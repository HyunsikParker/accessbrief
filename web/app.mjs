import { beginReport, confirmReport, CONFIRMATION_PHRASE } from "../src/core.mjs";
import { inventoryFromDocument } from "../src/dom-inventory.mjs";
import { sampleReport } from "../src/demo-data.mjs";
import { receiptFile, parseReceiptFile, MAX_RECEIPT_BYTES } from "../src/receipt-file.mjs";
import { inspectHtmlSource, MAX_HTML_BYTES } from '../src/imported-page.mjs';
import { verifyReceiptContext } from '../src/source-verification.mjs';
import ticketBookingHtml from '../examples/ticket-booking.html';

const localSkillAvailable = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

const form = document.querySelector("#report-form");
const input = document.querySelector("#report-input");
const clearButton = document.querySelector("#clear-button");
const confirmButton = document.querySelector("#confirm-button");
const cancelButton = document.querySelector("#cancel-button");
const reportStatus = document.querySelector("#report-status");
const receiptMessage = document.querySelector("#receipt-message");
const downloadButton = document.querySelector("#download-receipt");
const confirmationNote = document.querySelector("#confirmation-note");
const proofLine = document.querySelector("#proof-line");
const barrierValue = document.querySelector("#barrier-value");
const elementValue = document.querySelector("#element-value");
const pageValue = document.querySelector("#page-value");
const privacyValue = document.querySelector("#privacy-value");
const reviewedWording = document.querySelector("#reviewed-wording");
const reviewBadge = document.querySelector("#review-badge");
const reportHeading = document.querySelector("#report-sheet-heading");
const lifecycleItems = [...document.querySelectorAll(".lifecycle li")];
const skillProof = document.querySelector("#skill-proof");
const skillProofButton = document.querySelector("#skill-proof-button");
const skillProofStatus = document.querySelector("#skill-proof-status");
const skillProofTarget = document.querySelector("#skill-proof-target");
const skillProofPolicy = document.querySelector("#skill-proof-policy");
const skillProofReceipt = document.querySelector("#skill-proof-receipt");
let session = null;
let revision = 0;
let privacyChanged = false;
let confirming = false;
const publishedReceiptIds = new Set();
const publishedReceipts = new Map();
let exportingRevision = -1;
let importedPage = null;
let loadingPage = false;
let importGeneration = 0;
const htmlFile = document.querySelector('#html-file');
const sourceStatus = document.querySelector('#source-status');
const targetSelect = document.querySelector('#target-select');
const checkReceiptFile = document.querySelector('#check-receipt-file');
const sourceCheck = document.querySelector('#source-check');
let verificationGeneration = 0;

function itemLabel(item) {
  if (!item || !importedPage) return 'Checkout button';
  const names = { button: 'Button', textbox: 'Text field', link: 'Link', img: 'Image', checkbox: 'Checkbox', radio: 'Option', combobox: 'Menu' };
  const peers = importedPage.inventory.filter(candidate => candidate.role === item.role);
  return `${names[item.role] ?? 'Item'} ${peers.findIndex(candidate => candidate.id === item.id) + 1}`;
}

function sourceErrorMessage(message) {
  if (/256 KiB|nonempty HTML/.test(message)) return 'Choose a nonempty HTML page smaller than 256 KB.';
  if (/No supported controls/.test(message)) return 'We could not find any items to check in this page. Try a different saved page.';
  if (/complexity|100 supported/.test(message)) return 'This page is too large or complex for this check. Try a smaller saved page.';
  return 'We could not read this page reliably. Please try another saved page.';
}

function receiptErrorMessage(message) {
  if (/original HTML/.test(message)) return 'Choose the original page in Report details first.';
  if (/64 KiB/.test(message)) return 'This report file is too large. Choose a report downloaded from AccessBrief.';
  if (/source hash/.test(message)) return 'This report belongs to a different version of the page. Choose the original page and try again.';
  if (/does not describe imported/.test(message)) return 'This report was made from the built-in example. It cannot be checked against an uploaded page.';
  if (/not reproduced/.test(message)) return 'We could not confirm this report in the selected page.';
  return 'This report could not be verified. Choose an unchanged report downloaded from AccessBrief.';
}

document.querySelector('#open-receipt-check').addEventListener('click', () => {
  document.querySelector('#receipt-check').open = true;
});

checkReceiptFile.addEventListener('change', async () => {
  const file = checkReceiptFile.files?.[0];
  if (!file) return;
  const generation = ++verificationGeneration;
  const page = importedPage;
  try {
    if (!page || loadingPage) throw new Error('Import the original HTML file first.');
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('Receipt file exceeds the 64 KiB limit.');
    const { receipt } = await parseReceiptFile(await file.text());
    await verifyReceiptContext(receipt, page);
    if (generation !== verificationGeneration || importedPage !== page) return;
    sourceCheck.textContent = 'The report matches this page, and the issue was found again. This confirms the saved page check, not the live website or who saved the report.';
  } catch (error) {
    if (generation === verificationGeneration && importedPage === page) sourceCheck.textContent = receiptErrorMessage(error.message);
  } finally {
    if (generation === verificationGeneration) checkReceiptFile.value = '';
  }
});

function invalidateReview() {
  revision++;
  confirming = false;
  session = null;
  render();
}

function suggestReport() {
  const target = importedPage?.inventory.find(item => item.id === targetSelect.value);
  document.querySelector('#target-detail').textContent = target?.issueCodes.length
    ? `${target.tag === 'img' ? 'This image needs a description' : 'This item needs a screen reader label'} in the saved page.`
    : target?.namePresent ? 'This item already has a label. A missing-label report cannot be confirmed here.'
      : 'This image is marked as decorative and does not need a description.';
  input.value = target?.role === 'img' ? 'This image has no alt text.' : 'This control has no label.';
  invalidateReview();
}

async function importPage(read) {
  const generation = ++importGeneration;
  verificationGeneration++;
  sourceCheck.textContent = '';
  loadingPage = true;
  invalidateReview();
  sourceStatus.textContent = 'Checking your page…';
  try {
    const next = await inspectHtmlSource(await read());
    if (generation !== importGeneration) return;
    importedPage = next;
    targetSelect.replaceChildren(...next.inventory.map(item => {
      const option = document.createElement('option');
      option.value = item.id;
      const status = item.issueCodes.length ? 'Needs attention' : item.namePresent ? 'Label found' : 'Decorative';
      option.textContent = `${itemLabel(item)} · ${status}`;
      return option;
    }));
    targetSelect.value = (next.inventory.find(item => item.issueCodes.length) ?? next.inventory[0]).id;
    document.querySelector('#imported-target').hidden = false;
    document.querySelector('.page-evidence').hidden = true;
    document.querySelector('.sample-actions').hidden = true;
    document.querySelector('#page-description').textContent = 'Your uploaded page';
    const issueCount = next.inventory.filter(item => item.issueCodes.length).length;
    sourceStatus.textContent = `${next.inventory.length} items checked. ${issueCount ? `${issueCount} may need attention.` : 'No missing labels or descriptions found.'}${next.skipped ? ' Some items could not be checked.' : ''}`;
    document.querySelector('.source-picker').open = false;
    suggestReport();
    targetSelect.focus();
  } catch (error) {
    if (generation === importGeneration) sourceStatus.textContent = `${sourceErrorMessage(error.message)} Your previous page is still selected. Review your report again before saving.`;
  } finally {
    if (generation === importGeneration) { loadingPage = false; htmlFile.value = ''; render(); }
  }
}

htmlFile.addEventListener('change', () => {
  const file = htmlFile.files?.[0];
  if (!file) return;
  importPage(() => {
    if (file.size > MAX_HTML_BYTES) throw new Error('Choose an HTML file up to 256 KiB.');
    return file.text();
  });
});
document.querySelector('#example-html').addEventListener('click', () => importPage(async () => ticketBookingHtml));
document.querySelector('#reset-page').addEventListener('click', () => {
  importGeneration++;
  verificationGeneration++;
  sourceCheck.textContent = '';
  loadingPage = false;
  importedPage = null;
  htmlFile.value = '';
  document.querySelector('#imported-target').hidden = true;
  document.querySelector('.page-evidence').hidden = false;
  document.querySelector('.sample-actions').hidden = false;
  document.querySelector('#page-description').textContent = 'Example checkout';
  sourceStatus.textContent = 'An example page is selected. You can upload your own above.';
  input.value = sampleReport;
  invalidateReview();
});
targetSelect.addEventListener('change', suggestReport);

function currentReceipt() {
  return session?.receipt ?? publishedReceipts.get(session?.duplicateOf);
}

function displayWords(value) {
  const phrase = value.replaceAll("_", " ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function renderLifecycle(states = []) {
  lifecycleItems.forEach((item) => {
    item.classList.toggle("is-complete", states.includes(item.dataset.state));
    item.classList.remove("is-current");
    item.removeAttribute("aria-current");
  });
  const currentState = states.at(-1);
  const currentItem = lifecycleItems.find((item) => item.dataset.state === currentState);
  if (currentItem) {
    currentItem.classList.add("is-current");
    currentItem.setAttribute("aria-current", "step");
  }
}

function render() {
  const verified = session?.normalized;
  const downloadable = currentReceipt();
  downloadButton.hidden = !downloadable;
  downloadButton.disabled = !downloadable || exportingRevision === revision;
  confirmButton.hidden = cancelButton.hidden = Boolean(downloadable);
  document.querySelector('#review-empty').hidden = Boolean(session);
  document.querySelector('#review-content').hidden = !session;
  document.querySelector('#receipt-art').hidden = !downloadable;
  document.querySelector('#confirmation-heading').textContent = downloadable ? 'Your report is ready' : 'Save this report?';
  confirmationNote.textContent = downloadable
    ? 'Download it to keep a copy. The saved file contains page evidence, without your original wording.'
    : 'Check the wording and remove any personal details before saving.';
  const issueNames = { missing_label: 'Missing screen reader label', missing_alt_text: 'Missing image description' };
  barrierValue.textContent = verified ? issueNames[verified.barrierCategory] ?? displayWords(verified.barrierCategory) : '—';
  elementValue.textContent = verified ? itemLabel(importedPage?.inventory.find(item => item.id === verified.targetId)) : '—';
  pageValue.textContent = verified ? importedPage ? 'Found in the saved page' : 'Found in the example page' : '—';
  confirmButton.disabled = loadingPage || confirming || session?.status !== "awaiting_confirmation";
  cancelButton.disabled = confirming || session?.status !== "awaiting_confirmation";
  reviewedWording.textContent = session?.quotedInput ?? 'Review your details to see the report.';
  privacyValue.textContent = !session ? 'Not checked' : privacyChanged ? 'Detected details removed' : 'None detected';
  const states = {awaiting_confirmation: 'Ready to save', needs_clarification: 'Needs more detail', blocked: 'Issue not confirmed', cancelled: 'Cancelled', duplicate: 'Already saved', published: 'Ready to download'};
  reviewBadge.textContent = confirming ? 'Preparing report' : states[session?.status] ?? 'Not reviewed';
  reviewBadge.dataset.status = session?.status ?? "idle";
  renderLifecycle(downloadable ? ['reported', 'verified', 'confirmed', 'published'] : session?.lifecycle ?? []);
  reportStatus.textContent = "";
  receiptMessage.textContent = "";

  if (!session) {
    proofLine.textContent = "Not yet verified.";
  } else if (session.status === "awaiting_confirmation") {
    proofLine.textContent = importedPage ? 'Check the live page too. This review covers the saved page only.' : 'Checked against the selected example page.';
  } else if (session.status === "needs_clarification") {
    proofLine.textContent = "Not yet verified.";
    reportStatus.textContent = session.clarification;
  } else if (session.status === "blocked") {
    proofLine.textContent = 'This issue could not be confirmed in the selected page.';
    reportStatus.textContent = 'Choose another item or revise the report before saving.';
  } else if (session.status === "cancelled") {
    proofLine.textContent = 'You cancelled this report.';
    reportStatus.textContent = 'Report cancelled. Nothing was saved.';
  } else if (session.status === "duplicate") {
    proofLine.textContent = 'This issue is already in a report you saved.';
    reportStatus.textContent = 'You can download your existing report below.';
    receiptMessage.textContent = 'Your existing report is ready to download.';
  } else if (session.status === "published") {
    proofLine.textContent = 'You confirmed this report. Download it to keep the evidence.';
    receiptMessage.textContent = 'Ready to download to your device.';
  }
}

function reviewReport(moveFocus = false) {
  if (loadingPage) return;
  revision += 1;
  confirming = false;
  if (!input.value.trim()) {
    session = null;
    render();
    reportStatus.textContent = "Describe a barrier before reviewing.";
    input.focus();
    return;
  }
  session = beginReport({ utterance: input.value, context: importedPage ?? inventoryFromDocument(document), targetId: importedPage ? targetSelect.value : undefined });
  privacyChanged = session.quotedInput !== input.value;
  input.value = session.quotedInput;
  render();
  if (moveFocus && session.status === "awaiting_confirmation") reportHeading.focus();
}

async function runSkillProof() {
  if (!localSkillAvailable) return;
  skillProofButton.disabled = true;
  skillProofStatus.textContent = "Running";
  skillProofTarget.textContent = "—";
  skillProofPolicy.textContent = "—";
  skillProofReceipt.textContent = "—";
  try {
    const response = await fetch("/api/skill-proof", { method: "POST" });
    if (!response.ok) throw new Error("skill proof unavailable");
    const result = await response.json();
    skillProofStatus.textContent = 'Passed';
    skillProofTarget.textContent = 'Example checkout button';
    skillProofPolicy.textContent = 'Personal details removed · Confirmed';
    skillProofReceipt.textContent = 'Created and checked';
  } catch {
    skillProofStatus.textContent = "Unavailable";
  } finally {
    skillProofButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  reviewReport(true);
});

input.addEventListener("input", () => {
  revision += 1;
  session = null;
  confirming = false;
  render();
  reportStatus.textContent = "Report changed. Review it again before confirming.";
});

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = {barrier: sampleReport, privacy: "Contact demo.person@example.invalid. The checkout button has no label for my screen reader.", clarify: "I cannot use this page."}[button.dataset.example];
    reviewReport(true);
    if (session?.status === "needs_clarification") input.focus();
  });
});

clearButton.addEventListener("click", () => {
  input.value = "";
  revision += 1;
  confirming = false;
  session = null;
  render();
  input.focus();
});

confirmButton.addEventListener("click", async () => {
  if (loadingPage || confirming || session?.status !== "awaiting_confirmation") return;
  const pendingRevision = revision;
  const reviewed = session;
  confirming = true;
  render();
  let result;
  try {
    result = await confirmReport(reviewed, CONFIRMATION_PHRASE, { publishedReceiptIds });
  } catch {
    if (pendingRevision !== revision) return;
    confirming = false;
    render();
    receiptMessage.textContent = "The receipt could not be created. Try confirming again.";
    return;
  }
  if (pendingRevision !== revision) return;
  session = result;
  confirming = false;
  if (session.receipt) {
    publishedReceiptIds.add(session.receipt.receiptId);
    publishedReceipts.set(session.receipt.receiptId, session.receipt);
  }
  render();
});

downloadButton.addEventListener("click", async () => {
  const receipt = currentReceipt();
  if (!receipt || exportingRevision === revision) return;
  const pendingRevision = revision;
  exportingRevision = pendingRevision;
  downloadButton.disabled = true;
  try {
    const file = await receiptFile(receipt);
    if (pendingRevision !== revision || currentReceipt() !== receipt) return;
    const url = URL.createObjectURL(new Blob([file.text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = 'accessbrief-report.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    receiptMessage.textContent = 'Download started. Keep the file to check this report again later.';
  } catch {
    if (pendingRevision === revision) receiptMessage.textContent = "The receipt file could not be prepared. Try downloading again.";
  } finally {
    if (pendingRevision === revision) {
      exportingRevision = -1;
      downloadButton.disabled = !currentReceipt();
    }
  }
});

cancelButton.addEventListener("click", async () => {
  if (confirming || session?.status !== "awaiting_confirmation") return;
  const pendingRevision = ++revision;
  const result = await confirmReport(session, "Cancel");
  if (pendingRevision !== revision) return;
  session = result;
  render();
});

if (localSkillAvailable && new URLSearchParams(window.location.search).get("skill-proof") === "1") {
  skillProof.hidden = false;
  skillProofButton.addEventListener("click", runSkillProof);
}

input.value = sampleReport;
reviewReport();
