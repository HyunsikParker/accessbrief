import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectHtmlSource, MAX_HTML_BYTES } from '../src/imported-page.mjs';
import { beginReport, confirmReport, CONFIRMATION_PHRASE, canonicalJson, sha256 } from '../src/core.mjs';
import { receiptFile, parseReceiptFile } from '../src/receipt-file.mjs';
import { verifyReceiptSource } from '../src/source-verification.mjs';

const html = '<!doctype html><html lang="en"><body><form><label for="email">Private User</label><input id="email" type="email" value="private@example.invalid"><button id="private-name"></button><button>Cancel</button></form><img src="https://example.invalid/secret-image"><img alt="" src="hidden.png"></body></html>';
const context = await inspectHtmlSource(html);
const reviewed = beginReport({ utterance: 'This control has no label.', context, targetId: 'control_2' });
const { receipt } = await confirmReport(reviewed, CONFIRMATION_PHRASE);

test('unannotated source supplies stable structural targets without retaining source text', () => {
  assert.equal(context.inventory.length, 5);
  assert.deepEqual(context.inventory.map(x => x.issueCodes), [[], ['missing_label'], [], ['missing_alt_text'], []]);
  assert.equal(context.inventory[1].selector, 'html:nth-of-type(1) > body:nth-of-type(1) > form:nth-of-type(1) > button:nth-of-type(1)');
  assert.doesNotMatch(JSON.stringify(context), /Private User|private@|private-name|secret-image/);
});

test('source receipt is bound to exact HTML and keeps the previous checksum-only contract explicit', async () => {
  assert.equal(receipt.schema, 'accessbrief.mcp-receipt.v2');
  assert.equal(receipt.report.evidence.snapshotSha256, await sha256(html));
  const file = await receiptFile(receipt);
  assert.doesNotMatch(file.text, /Private User|private@|private-name|secret-image|quotedInput/);
  assert.equal((await parseReceiptFile(file.text)).verification.valid, true);
  assert.equal((await verifyReceiptSource(receipt, html)).findingReproduced, true);
  await assert.rejects(verifyReceiptSource(receipt, html + '\n'), /source hash/);
});

test('a rehashed but fabricated finding fails source reinspection', async () => {
  const forged = structuredClone(receipt);
  forged.report.targetId = 'control_3';
  const { receiptId, sha256: oldHash, ...body } = forged;
  forged.sha256 = await sha256(canonicalJson(body));
  forged.receiptId = 'ab_' + forged.sha256.slice(0, 24);
  assert.equal((await parseReceiptFile(JSON.stringify(forged))).verification.valid, true);
  await assert.rejects(verifyReceiptSource(forged, html), /not reproduced/);
});

test('named targets, unsupported categories and explicit target conflicts cannot be confirmed', () => {
  for (const [targetId, utterance, status] of [['control_3', 'This control has no label.', 'blocked'], ['control_2', 'This control has low contrast.', 'blocked'], ['control_2', 'Control 3 has no label.', 'needs_clarification'], ['control_99', 'This control has no label.', 'needs_clarification']]) {
    assert.equal(beginReport({ context, targetId, utterance }).status, status);
  }
});

test('an image without alt can be reported, while an explicitly decorative image cannot', () => {
  assert.equal(beginReport({ context, targetId: 'control_4', utterance: 'This image has no alt text.' }).status, 'awaiting_confirmation');
  assert.equal(beginReport({ context, targetId: 'control_5', utterance: 'This image has no alt text.' }).status, 'blocked');
});

test('loose confirmations and cancellation create no source receipt', async () => {
  assert.equal((await confirmReport(reviewed, 'sure')).receipt, null);
  assert.equal((await confirmReport(reviewed, 'Cancel')).status, 'cancelled');
});

const names = [
 ['native label', '<label for="x">Address</label><input id="x">', true],
 ['wrapped label', '<label>Search <input></label>', true],
 ['aria reference', '<span id="x">Send</span><button aria-labelledby="x"></button>', true],
 ['hidden aria reference', '<span id="x" hidden>Send</span><button aria-labelledby="x"></button>', true],
 ['broken reference fallback', '<button aria-labelledby="absent" aria-label="Send"></button>', true],
 ['empty reference overrides aria', '<span id="x"></span><button aria-labelledby="x" aria-label="Send"></button>', false],
 ['hidden decorative child', '<button><span aria-hidden="true">icon</span></button>', false],
 ['button value', '<input type="button" value="Continue">', true],
 ['title fallback', '<textarea title="Message"></textarea>', true],
 ['entity text', '<a href="/">Terms &amp; conditions</a>', true],
];
for (const [label, fragment, namePresent] of names) test(`generic source names: ${label}`, async () => {
  const page = await inspectHtmlSource(fragment);
  assert.equal(page.inventory[0].namePresent, namePresent);
});

test('hidden, embedded and browser-dependent controls do not yield supported findings', async () => {
  const page = await inspectHtmlSource('<main><div hidden><button></button></div><div inert><input></div><div style="display:none"><button></button></div><template><button></button></template><svg><a href="/"></a></svg><iframe srcdoc="<button></button>"></iframe><input type="submit"><button role="switch"></button><button>Visible</button></main>');
  assert.equal(page.inventory.length, 1);
  assert.equal(page.skipped, 2);
});

test('scripts, resource URLs and form secrets remain inert and absent from derived output', async () => {
  const page = await inspectHtmlSource('<script>globalThis.PARSER_EXECUTED=true;fetch("https://example.invalid/leak")</script><img src="https://example.invalid/leak" onerror="alert(1)"><input type="password" value="LOCAL_SECRET"><style>@import "https://example.invalid/style"</style>');
  assert.equal(globalThis.PARSER_EXECUTED, undefined);
  assert.equal(page.inventory.length, 2);
  assert.doesNotMatch(JSON.stringify(page), /LOCAL_SECRET|example\.invalid|alert|PARSER_EXECUTED/);
});

test('bounds and duplicate identifiers fail closed', async () => {
  for (const source of ['', 'x'.repeat(MAX_HTML_BYTES + 1), '<button id="a"></button><p id="a"></p>', '<div>'.repeat(90) + '<button></button>', '<button></button>'.repeat(101), '<p>No controls</p>']) {
    await assert.rejects(inspectHtmlSource(source));
  }
  assert.equal((await inspectHtmlSource('<button></button>'.repeat(100))).inventory.length, 100);
});

test('the actual Skill inspects and reviews supplied HTML without requesting files or URLs', () => {
  const script = fileURLToPath(new URL('../skills/accessbrief/scripts/accessbrief.mjs', import.meta.url));
  const invoke = input => spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: 'utf8' });
  const inspected = invoke({ action: 'inspect', html });
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.deepEqual(JSON.parse(inspected.stdout), context);
  const published = invoke({ action: 'publish', html, targetId: 'control_2', report: 'This control has no label.', confirmation: CONFIRMATION_PHRASE });
  assert.equal(published.status, 0, published.stderr);
  assert.deepEqual(JSON.parse(published.stdout).receipt, receipt);
  const invalid = invoke({ action: 'inspect', html, url: 'https://example.invalid/secret' });
  assert.equal(invalid.status, 1);
  assert.doesNotMatch(invalid.stderr, /example/);
});

test('offline CLI rechecks supplied source and rejects another file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'accessbrief-source-test-'));
  try {
    const source = join(dir, 'page.html'); const receiptPath = join(dir, 'receipt.json');
    await writeFile(source, html); await writeFile(receiptPath, (await receiptFile(receipt)).text);
    const script = fileURLToPath(new URL('../scripts/verify-receipt.mjs', import.meta.url));
    const invoke = () => spawnSync(process.execPath, [script, receiptPath, '--html', source], { encoding: 'utf8' });
    assert.equal(invoke().status, 0);
    await writeFile(source, html + '\n');
    assert.equal(invoke().status, 1);
    assert.match(invoke().stderr, /source hash/);
  } finally { await rm(dir, { recursive: true }); }
});
