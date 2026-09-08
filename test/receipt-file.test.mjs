import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { beginReport, confirmReport, CONFIRMATION_PHRASE } from "../src/core.mjs";
import { inventoryFromHtml } from "../src/html-inventory.mjs";
import { receiptFile, parseReceiptFile } from "../src/receipt-file.mjs";

const context = inventoryFromHtml(await readFile(new URL("../web/index.html", import.meta.url), "utf8"));
const session = beginReport({ context, utterance: "Contact demo.person@example.invalid. The checkout button has no label for my screen reader." });
const { receipt } = await confirmReport(session, CONFIRMATION_PHRASE);
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const digest = value => createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
const resign = value => {
  const { receiptId, sha256, ...body } = value;
  value.sha256 = digest(body);
  value.receiptId = "ab_" + value.sha256.slice(0, 24);
  return value;
};

test("download preserves the frozen receipt without session wording", async () => {
  const file = await receiptFile(receipt);
  assert.equal(file.filename, "ab_61c465e00823df42546bd359.json");
  assert.doesNotMatch(file.text, /demo.person|redacted|quotedInput|utterance/);
  const result = await parseReceiptFile(file.text);
  assert.deepEqual(result.receipt, receipt);
  const { receiptId, sha256, ...body } = result.receipt;
  assert.equal(digest(body), sha256);
});

test("canonical checksum tolerates key order and whitespace, not changed evidence", async () => {
  const reordered = Object.fromEntries(Object.entries(receipt).reverse());
  assert.equal((await parseReceiptFile(JSON.stringify(reordered, null, 4))).verification.valid, true);
  const changed = structuredClone(receipt);
  changed.report.targetId = "other_button";
  await assert.rejects(parseReceiptFile(JSON.stringify(changed)), /checksum/);
});

test("extra wording and unsupported lifecycle fail even with a recomputed checksum", async () => {
  const extra = resign({ ...structuredClone(receipt), quotedInput: "private wording" });
  await assert.rejects(parseReceiptFile(JSON.stringify(extra)), /malformed/);
  const wrongStage = structuredClone(receipt);
  wrongStage.lifecycle = ["reported", "verified"];
  await assert.rejects(parseReceiptFile(JSON.stringify(resign(wrongStage))), /malformed/);
});

test("checksum validation is explicitly not origin authentication", async () => {
  const different = structuredClone(receipt);
  different.report.targetId = "other_button";
  const result = await parseReceiptFile(JSON.stringify(resign(different)));
  assert.equal(result.verification.valid, true);
  assert.match(result.verification.note, /not signed/);
  assert.match(result.verification.note, /not been independently checked/);
});

test("malformed, oversized, null and wrong-ID files fail closed", async () => {
  await assert.rejects(parseReceiptFile("{"), /not valid JSON/);
  await assert.rejects(parseReceiptFile(" ".repeat(65_537)), /64 KiB/);
  await assert.rejects(parseReceiptFile("null"), /malformed/);
  await assert.rejects(parseReceiptFile(JSON.stringify({ ...receipt, receiptId: "ab_" + "0".repeat(24) })), /checksum/);
});

test("offline CLI checks actual files and returns failure without echoing their contents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "accessbrief-receipt-test-"));
  try {
    const path = join(directory, "receipt.json");
    const script = new URL("../scripts/verify-receipt.mjs", import.meta.url);
    const invoke = () => spawnSync(process.execPath, [fileURLToPath(script), path], { encoding: "utf8" });
    await writeFile(path, (await receiptFile(receipt)).text);
    const valid = invoke();
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).valid, true);
    await writeFile(path, JSON.stringify({ ...receipt, privateData: "SECRET_FIXTURE_ONLY" }));
    const invalid = invoke();
    assert.equal(invalid.status, 1);
    assert.doesNotMatch(invalid.stdout + invalid.stderr, /SECRET_FIXTURE_ONLY/);
    await writeFile(path, " ".repeat(65_537));
    assert.equal(invoke().status, 1);
  } finally { await rm(directory, { recursive: true }); }
});
