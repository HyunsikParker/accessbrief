#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beginReport, canonicalJson, confirmReport } from "../../../src/core.mjs";
import { inventoryFromHtml } from "../../../src/dom-inventory.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAX_INPUT_BYTES = 32 * 1024;

async function readRequest() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error("input exceeds 32 KiB");
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString("utf8").trim();
  if (!input) throw new Error("one JSON request is required on stdin");
  const request = JSON.parse(input);
  if (!request || Array.isArray(request) || typeof request !== "object") {
    throw new Error("request must be one JSON object");
  }
  return request;
}

function validateRequest(request) {
  if (!["review", "publish", "cancel"].includes(request.action)) throw new Error("unsupported action");
  if (typeof request.report !== "string" || request.report.trim() === "") throw new Error("report is required");
  if (request.action === "publish" && typeof request.confirmation !== "string") {
    throw new Error("publish requires confirmation");
  }
}

async function main() {
  const request = await readRequest();
  validateRequest(request);
  const html = await readFile(resolve(PROJECT_ROOT, "web/index.html"), "utf8");
  const context = inventoryFromHtml(html);
  const reviewed = beginReport({ utterance: request.report, context });
  let result = reviewed;
  if (request.action === "publish") result = await confirmReport(reviewed, request.confirmation);
  if (request.action === "cancel") result = await confirmReport(reviewed, "Cancel");
  process.stdout.write(`${canonicalJson(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof SyntaxError ? "invalid JSON" : error.message}\n`);
  process.exitCode = 1;
});
