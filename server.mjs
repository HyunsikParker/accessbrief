#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));

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
]);
const payloads = new Map(
  [...allowlist].map(([path, [file, type]]) => [path, [readFileSync(resolve(PROJECT_ROOT, file)), type]]),
);
const headers = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const server = createServer((request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
    response.end();
    return;
  }
  const path = new URL(request.url, "http://127.0.0.1").pathname;
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
