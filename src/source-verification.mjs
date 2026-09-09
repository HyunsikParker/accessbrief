import { beginReport, canonicalJson } from './core.mjs';
import { inspectHtmlSource } from './imported-page.mjs';
import { verifyReceipt } from './receipt-file.mjs';

export async function verifyReceiptSource(receipt, html) {
  const context = await inspectHtmlSource(html);
  return verifyReceiptContext(receipt, context);
}

export async function verifyReceiptContext(receipt, context) {
  await verifyReceipt(receipt);
  if (receipt.schema !== 'accessbrief.mcp-receipt.v2') throw new Error('Receipt does not describe imported HTML.');
  if (context.snapshotSha256 !== receipt.report.evidence.snapshotSha256) throw new Error('Receipt source hash does not match this HTML file.');
  const utterance = receipt.report.barrierCategory === 'missing_alt_text' ? 'This image has no alt text.' : 'This control has no label.';
  const result = beginReport({ utterance, context, targetId: receipt.report.targetId });
  if (result.status !== 'awaiting_confirmation' || canonicalJson(result.normalized) !== canonicalJson(receipt.report)) {
    throw new Error('Receipt evidence is not reproduced by this HTML source.');
  }
  return { valid: true, sourceMatched: true, findingReproduced: true, snapshotSha256: context.snapshotSha256,
    note: 'Static source check only. No script or stylesheet was run; this does not authenticate confirmation or establish rendered accessibility.' };
}
