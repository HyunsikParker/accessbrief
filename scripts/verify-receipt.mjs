#!/usr/bin/env node
import { open } from "node:fs/promises";
import { MAX_RECEIPT_BYTES, parseReceiptFile } from "../src/receipt-file.mjs";

let file;
try {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/verify-receipt.mjs RECEIPT.json");
  file = await open(process.argv[2], "r");
  // Read one bounded buffer even if the file grows after it is opened.
  const buffer = Buffer.alloc(MAX_RECEIPT_BYTES + 1);
  let bytesRead = 0;
  while (bytesRead < buffer.length) {
    const chunk = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
    if (chunk.bytesRead === 0) break;
    bytesRead += chunk.bytesRead;
  }
  if (bytesRead > MAX_RECEIPT_BYTES) throw new Error("Receipt file exceeds the 64 KiB limit.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
  const { verification } = await parseReceiptFile(text);
  process.stdout.write(JSON.stringify(verification) + "\n");
} catch (error) {
  const safeMessage = /^(Usage:|Receipt |Unsupported or malformed receipt)/.test(error.message)
    ? error.message : "Could not read the receipt file as UTF-8.";
  process.stderr.write(safeMessage + "\n");
  process.exitCode = 1;
} finally {
  await file?.close();
}
