#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beginReport, canonicalJson, confirmReport } from "../../../src/core.mjs";
import { inventoryFromHtml } from "../../../src/html-inventory.mjs";
import { inspectHtmlSource } from '../../../src/imported-page.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAX_INPUT_BYTES = 320 * 1024;

async function readRequest() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error("input exceeds 320 KiB");
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
  if (Object.keys(request).some(key => !['action', 'report', 'confirmation', 'html', 'targetId'].includes(key))) throw new Error('unsupported request field');
  if (Object.hasOwn(request, 'html') && typeof request.html !== 'string') throw new Error('html must be a string');
  if (request.action === 'inspect') {
    if (typeof request.html !== 'string') throw new Error('inspect requires html');
    return;
  }
  if (!["review", "publish", "cancel"].includes(request.action)) throw new Error("unsupported action");
  if (typeof request.report !== "string" || request.report.trim() === "") throw new Error("report is required");
  if (request.report.length > 8000) throw new Error('report exceeds 8000 characters');
  if (Object.hasOwn(request, 'html') && !/^control_(?:[1-9]|[1-9][0-9]|100)$/.test(request.targetId)) throw new Error('imported HTML requires a targetId from inspect');
  if (request.action === "publish" && typeof request.confirmation !== "string") {
    throw new Error("publish requires confirmation");
  }
}

async function main() {
  const request = await readRequest();
  validateRequest(request);
  const context = Object.hasOwn(request, 'html') ? await inspectHtmlSource(request.html)
    : inventoryFromHtml(await readFile(resolve(PROJECT_ROOT, "web/index.html"), "utf8"));
  if (request.action === 'inspect') {
    process.stdout.write(`${canonicalJson(context)}\n`);
    return;
  }
  const reviewed = beginReport({ utterance: request.report, context, targetId: request.targetId });
  let result = reviewed;
  if (request.action === "publish") result = await confirmReport(reviewed, request.confirmation);
  if (request.action === "cancel") result = await confirmReport(reviewed, "Cancel");
  process.stdout.write(`${canonicalJson(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof SyntaxError ? "invalid JSON" : error.message}\n`);
  process.exitCode = 1;
});
