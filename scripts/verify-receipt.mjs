#!/usr/bin/env node
import { open } from "node:fs/promises";
import { MAX_RECEIPT_BYTES, parseReceiptFile } from "../src/receipt-file.mjs";
import { MAX_HTML_BYTES } from '../src/imported-page.mjs';
import { verifyReceiptSource } from '../src/source-verification.mjs';

let file;
let htmlFile;
try {
  if (process.argv.length !== 3 && !(process.argv.length === 5 && process.argv[3] === '--html')) throw new Error("Usage: node scripts/verify-receipt.mjs RECEIPT.json [--html PAGE.html]");
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
  const { receipt, verification } = await parseReceiptFile(text);
  let result = verification;
  if (process.argv[3] === '--html') {
    htmlFile = await open(process.argv[4], 'r');
    const htmlBuffer = Buffer.alloc(MAX_HTML_BYTES + 1);
    let total = 0;
    while (total < htmlBuffer.length) {
      const chunk = await htmlFile.read(htmlBuffer, total, htmlBuffer.length - total, total);
      if (!chunk.bytesRead) break;
      total += chunk.bytesRead;
    }
    if (total > MAX_HTML_BYTES) throw new Error('HTML file exceeds the 256 KiB limit.');
    result = await verifyReceiptSource(receipt, new TextDecoder('utf-8', { fatal: true }).decode(htmlBuffer.subarray(0, total)));
  }
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  const safeMessage = /^(Usage:|Receipt |HTML |Unsupported or malformed receipt|Duplicate HTML|No supported controls|This page|Choose a nonempty)/.test(error.message)
    ? error.message : "Could not read the receipt file as UTF-8.";
  process.stderr.write(safeMessage + "\n");
  process.exitCode = 1;
} finally {
  await file?.close();
  await htmlFile?.close();
}
