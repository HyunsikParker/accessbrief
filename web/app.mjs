import { beginReport, confirmReport, CONFIRMATION_PHRASE } from "../src/core.mjs";
import { inventoryFromDocument } from "../src/dom-inventory.mjs";
import { sampleReport } from "../src/demo-data.mjs";

const form = document.querySelector("#report-form");
const input = document.querySelector("#report-input");
const clearButton = document.querySelector("#clear-button");
const confirmButton = document.querySelector("#confirm-button");
const cancelButton = document.querySelector("#cancel-button");
const reportStatus = document.querySelector("#report-status");
const receiptMessage = document.querySelector("#receipt-message");
const proofLine = document.querySelector("#proof-line");
const barrierValue = document.querySelector("#barrier-value");
const elementValue = document.querySelector("#element-value");
const pageValue = document.querySelector("#page-value");
const lifecycleItems = [...document.querySelectorAll(".lifecycle li")];
const skillProof = document.querySelector("#skill-proof");
const skillProofButton = document.querySelector("#skill-proof-button");
const skillProofStatus = document.querySelector("#skill-proof-status");
const skillProofTarget = document.querySelector("#skill-proof-target");
const skillProofPolicy = document.querySelector("#skill-proof-policy");
const skillProofReceipt = document.querySelector("#skill-proof-receipt");
const pageContext = inventoryFromDocument(document);

let session = null;
const publishedReceiptIds = new Set();

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
  barrierValue.textContent = verified ? displayWords(verified.barrierCategory === "missing_label" ? "missing accessible label" : verified.barrierCategory) : "—";
  elementValue.textContent = verified ? displayWords(verified.targetId) : "—";
  pageValue.textContent = verified ? verified.evidence.selector : "—";
  confirmButton.disabled = session?.status !== "awaiting_confirmation";
  cancelButton.disabled = session?.status !== "awaiting_confirmation";
  renderLifecycle(session?.lifecycle ?? []);
  reportStatus.textContent = "";
  receiptMessage.textContent = "";

  if (!session) {
    proofLine.textContent = "Not yet verified.";
  } else if (session.status === "awaiting_confirmation") {
    proofLine.textContent = "Verified against the current page.";
  } else if (session.status === "needs_clarification") {
    proofLine.textContent = "Not yet verified.";
    reportStatus.textContent = session.clarification;
  } else if (session.status === "blocked") {
    proofLine.textContent = "Current page evidence does not support this report.";
    reportStatus.textContent = "Nothing was published.";
  } else if (session.status === "cancelled") {
    proofLine.textContent = "Verified, then cancelled.";
    reportStatus.textContent = "Cancelled. Nothing was published.";
  } else if (session.status === "duplicate") {
    proofLine.textContent = "Matched an existing verified report.";
    reportStatus.textContent = "No duplicate publication was created.";
    receiptMessage.textContent = `Existing receipt ${session.duplicateOf}`;
  } else if (session.status === "published") {
    proofLine.textContent = "Published after explicit confirmation.";
    receiptMessage.textContent = `Receipt ${session.receipt.receiptId}`;
  }
}

function reviewReport() {
  session = beginReport({ utterance: input.value, context: pageContext });
  input.value = session.quotedInput;
  render();
}

async function runSkillProof() {
  skillProofButton.disabled = true;
  skillProofStatus.textContent = "Running";
  skillProofTarget.textContent = "—";
  skillProofPolicy.textContent = "—";
  skillProofReceipt.textContent = "—";
  try {
    const response = await fetch("/api/skill-proof", { method: "POST" });
    if (!response.ok) throw new Error("skill proof unavailable");
    const result = await response.json();
    skillProofStatus.textContent = result.status;
    skillProofTarget.textContent = result.target;
    skillProofPolicy.textContent = `${result.confirmation} confirmation · ${result.privacy}`;
    skillProofReceipt.textContent = result.receiptId;
  } catch {
    skillProofStatus.textContent = "Unavailable";
  } finally {
    skillProofButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  reviewReport();
});

clearButton.addEventListener("click", () => {
  input.value = "";
  session = null;
  render();
  input.focus();
});

confirmButton.addEventListener("click", async () => {
  session = await confirmReport(session, CONFIRMATION_PHRASE, { publishedReceiptIds });
  if (session.receipt) publishedReceiptIds.add(session.receipt.receiptId);
  render();
});

cancelButton.addEventListener("click", async () => {
  session = await confirmReport(session, "Cancel");
  render();
});

if (new URLSearchParams(window.location.search).get("skill-proof") === "1") {
  skillProof.hidden = false;
  skillProofButton.addEventListener("click", runSkillProof);
}

input.value = sampleReport;
reviewReport();
