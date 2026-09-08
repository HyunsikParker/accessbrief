#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));
const SKILL_SCRIPT = resolve(PROJECT_ROOT, "skills/accessbrief/scripts/accessbrief.mjs");
const SKILL_TIMEOUT_MS = 5_000;
const MAX_SKILL_OUTPUT_BYTES = 64 * 1024;
const SYNTHETIC_NAME = "Example Person";
const SYNTHETIC_EMAIL = "demo.person@example.invalid";
const SKILL_REQUEST = JSON.stringify({
  action: "publish",
  report: `My name is ${SYNTHETIC_NAME} and email ${SYNTHETIC_EMAIL}. The checkout button has no label for my screen reader.`,
  confirmation: "Yes, publish this accessibility report.",
});

let skillProofActive = false;

function parsePort(argv) {
  if (argv.length === 0) return 4173;
  if (argv.length !== 2 || argv[0] !== "--port") throw new Error("usage: node server.mjs [--port 4173]");
  const port = Number.parseInt(argv[1], 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("port must be between 1024 and 65535");
  return port;
}

const port = parsePort(process.argv.slice(2));
const allowlist = new Map([
  ["/", ["web/index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["web/styles.css", "text/css; charset=utf-8"]],
  ["/app.mjs", ["web/app.mjs", "text/javascript; charset=utf-8"]],
  ["/src/core.mjs", ["src/core.mjs", "text/javascript; charset=utf-8"]],
  ["/src/demo-data.mjs", ["src/demo-data.mjs", "text/javascript; charset=utf-8"]],
  ["/src/dom-inventory.mjs", ["src/dom-inventory.mjs", "text/javascript; charset=utf-8"]],
  ["/src/receipt-file.mjs", ["src/receipt-file.mjs", "text/javascript; charset=utf-8"]],
]);
const payloads = new Map(
  [...allowlist].map(([path, [file, type]]) => [path, [readFileSync(resolve(PROJECT_ROOT, file)), type]]),
);
const headers = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function writeJson(response, status, body, extraHeaders = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    ...headers,
    "Content-Length": payload.byteLength,
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(payload);
}

async function hasRequestBody(request) {
  for await (const chunk of request) {
    if (chunk.length > 0) return true;
  }
  return false;
}

function declaresRequestBody(request) {
  const contentLength = request.headers["content-length"];
  return request.headers["transfer-encoding"] !== undefined
    || (contentLength !== undefined && contentLength !== "0");
}

function runSkillProof() {
  if (skillProofActive) return Promise.reject(new Error("busy"));
  skillProofActive = true;
  return new Promise((resolveProof, rejectProof) => {
    const child = spawn(process.execPath, [SKILL_SCRIPT], {
      cwd: PROJECT_ROOT,
      env: {},
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    let outputBytes = 0;
    let settled = false;

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      skillProofActive = false;
      if (error) rejectProof(error);
      else resolveProof(value);
    }

    function countOutput(chunk) {
      outputBytes += chunk.length;
      if (outputBytes > MAX_SKILL_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new Error("output_limit"));
        return false;
      }
      return true;
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("timeout"));
    }, SKILL_TIMEOUT_MS);
    child.once("error", () => finish(new Error("spawn_failed")));
    child.stdout.on("data", (chunk) => {
      if (countOutput(chunk)) stdout.push(chunk);
    });
    child.stderr.on("data", countOutput);
    child.once("close", (code) => {
      if (code !== 0) {
        finish(new Error("skill_failed"));
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(stdout).toString("utf8"));
        const resultJson = JSON.stringify(result);
        const redactions = result.quotedInput?.match(/\[redacted\]/g)?.length ?? 0;
        if (
          result.status !== "published"
          || result.normalized?.targetId !== "checkout_button"
          || result.receipt?.receiptId !== "ab_61c465e00823df42546bd359"
          || resultJson.includes(SYNTHETIC_NAME)
          || resultJson.includes(SYNTHETIC_EMAIL)
          || redactions < 2
        ) {
          finish(new Error("unexpected_result"));
          return;
        }
        finish(null, {
          status: result.status,
          target: result.normalized.targetId,
          evidenceSource: result.normalized.evidence.source,
          privacy: "synthetic identity removed",
          confirmation: result.receipt.confirmation,
          receiptId: result.receipt.receiptId,
        });
      } catch {
        finish(new Error("invalid_result"));
      }
    });
    child.stdin.end(SKILL_REQUEST);
  });
}

async function handleSkillProof(request, response) {
  if (request.method !== "POST") {
    writeJson(response, 405, { error: "method_not_allowed" }, { Allow: "POST" });
    return;
  }
  if (declaresRequestBody(request)) {
    request.resume();
    writeJson(response, 413, { error: "request_body_not_allowed" }, { Connection: "close" });
    return;
  }
  if (await hasRequestBody(request)) {
    writeJson(response, 413, { error: "request_body_not_allowed" });
    return;
  }
  if (skillProofActive) {
    writeJson(response, 429, { error: "skill_proof_busy" }, { "Retry-After": "1" });
    return;
  }
  try {
    writeJson(response, 200, await runSkillProof());
  } catch (error) {
    const status = error.message === "busy" ? 429 : 503;
    writeJson(response, status, { error: status === 429 ? "skill_proof_busy" : "skill_proof_unavailable" });
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400, headers);
    response.end();
    return;
  }
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (path === "/api/skill-proof") {
    await handleSkillProof(request, response);
    return;
  }
  if (!["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
    response.end();
    return;
  }
  const entry = payloads.get(path);
  if (!entry) {
    response.writeHead(404, headers);
    response.end("Not found");
    return;
  }
  const [payload, type] = entry;
  response.writeHead(200, { ...headers, "Content-Length": payload.byteLength, "Content-Type": type });
  response.end(request.method === "HEAD" ? undefined : payload);
});

server.on("error", (error) => {
  process.stderr.write(`${error.code ?? "SERVER_ERROR"}\n`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ status: "ready", url: `http://127.0.0.1:${port}/` })}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
