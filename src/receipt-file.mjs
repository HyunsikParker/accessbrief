import { canonicalJson, sha256 } from "./core.mjs";

export const MAX_RECEIPT_BYTES = 65_536;
export const RECEIPT_TRUST_NOTE = "Checksum only: this file is not signed, and its page evidence has not been independently checked.";
const lifecycle = ["reported", "verified", "confirmed", "published"];
const categories = new Set(["missing_label", "missing_alt_text", "captions_missing", "keyboard_trap", "low_contrast"]);

function keysMatch(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function boundedText(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1_000;
}

function validShape(receipt) {
  if (!keysMatch(receipt, ["schema", "report", "confirmation", "lifecycle", "receiptId", "sha256"])) return false;
  const report = receipt.report;
  if (!keysMatch(report, ["surface", "pageId", "targetId", "targetRole", "barrierCategory", "impact", "evidence"])) return false;
  const imported = receipt.schema === 'accessbrief.mcp-receipt.v2';
  if (!keysMatch(report.evidence, imported ? ['source', 'selector', 'issueCode', 'snapshotSha256'] : ["source", "selector", "issueCode"])) return false;
  if (![report.pageId, report.targetId, report.targetRole, report.impact, report.evidence.selector].every(boundedText)) return false;
  const validEvidence = imported
    ? report.evidence.source === 'local_html_source'
      && typeof report.evidence.snapshotSha256 === 'string'
      && /^[a-f0-9]{64}$/.test(report.evidence.snapshotSha256)
      && report.pageId === 'html_' + report.evidence.snapshotSha256.slice(0, 24)
      && /^control_(?:[1-9]|[1-9][0-9]|100)$/.test(report.targetId)
      && /^[a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]*\)(?: > [a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]*\))*$/.test(report.evidence.selector)
      && ['missing_label', 'missing_alt_text'].includes(report.barrierCategory)
    : report.evidence.source === 'local_dom_inventory' && /^#[A-Za-z][A-Za-z0-9_-]*$/.test(report.evidence.selector);
  return (receipt.schema === "accessbrief.mcp-receipt.v1" || imported)
    && receipt.confirmation === "explicit"
    && Array.isArray(receipt.lifecycle)
    && JSON.stringify(receipt.lifecycle) === JSON.stringify(lifecycle)
    && report.surface === "web"
    && categories.has(report.barrierCategory)
    && validEvidence
    && report.evidence.issueCode === report.barrierCategory
    && typeof receipt.sha256 === "string" && /^[a-f0-9]{64}$/.test(receipt.sha256)
    && typeof receipt.receiptId === "string" && /^ab_[a-f0-9]{24}$/.test(receipt.receiptId);
}

export async function verifyReceipt(receipt) {
  if (!validShape(receipt)) throw new Error("Unsupported or malformed receipt.");
  const body = {
    schema: receipt.schema,
    report: receipt.report,
    confirmation: receipt.confirmation,
    lifecycle: receipt.lifecycle,
  };
  const digest = await sha256(canonicalJson(body));
  if (digest !== receipt.sha256 || receipt.receiptId !== "ab_" + digest.slice(0, 24)) {
    throw new Error("Receipt checksum does not match its contents.");
  }
  return { valid: true, sha256: digest, note: RECEIPT_TRUST_NOTE };
}

export async function parseReceiptFile(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_RECEIPT_BYTES) {
    throw new Error("Receipt file exceeds the 64 KiB limit.");
  }
  let receipt;
  try { receipt = JSON.parse(text); }
  catch { throw new Error("Receipt file is not valid JSON."); }
  const verification = await verifyReceipt(receipt);
  return { receipt, verification };
}

export async function receiptFile(receipt) {
  // Build from a verified receipt, never from the session or quoted report.
  await verifyReceipt(receipt);
  return { filename: receipt.receiptId + ".json", text: canonicalJson(receipt) + "\n" };
}
