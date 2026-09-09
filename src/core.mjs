export const CONFIRMATION_PHRASE = "Yes, publish this accessibility report.";

const CATEGORY_RULES = [
  ["missing_label", ["no label", "missing label", "missing a label", "unlabeled", "only says button", "only says edit text"]],
  ["missing_alt_text", ["no alt text", "missing alt text", "lacks a description", "no image description"]],
  ["captions_missing", ["no captions", "missing captions", "subtitles are missing", "no subtitles"]],
  ["keyboard_trap", ["keyboard trap", "cannot escape with the keyboard", "can't escape with the keyboard", "focus is trapped", "tab cycles inside it and escape does nothing"]],
  ["low_contrast", ["low contrast", "not enough contrast", "hard to read against the background"]],
];

const IMPACT = {
  captions_missing: "Audio content is unavailable without hearing it.",
  keyboard_trap: "Keyboard users cannot continue or leave the control.",
  low_contrast: "Text or controls are difficult to distinguish visually.",
  missing_alt_text: "The image purpose is unavailable to screen-reader users.",
  missing_label: "The control purpose is unavailable to screen-reader users.",
};

const INJECTION_RULES = [
  "ignore previous",
  "ignore all instructions",
  "reveal hidden",
  "show the system prompt",
  "publish without confirmation",
  "override the safety",
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function redactIdentity(text) {
  let safe = text;
  safe = safe.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]");
  safe = safe.replace(/(?:\+?\d[\d .()-]{7,}\d)/g, "[redacted]");
  safe = safe.replace(/@[A-Za-z0-9_]{2,}/g, "[redacted]");
  safe = safe.replace(/\b(?:my name is|i am)\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,2}\b/gi, "[redacted]");
  safe = safe.replace(/\b(?:i live|find me|send it)\s+at\s+\d{1,5}\s+[A-Za-z0-9 .'-]+(?:street|st|road|rd|avenue|ave|lane|ln)\b/gi, "[redacted]");
  return safe;
}

function withoutExplicitNegation(lower) {
  const negated = /\b(?:(?:is|are|was|were)\s+not\s+missing|(?:does|do|did)\s+not\s+lack)\s+(?:captions|subtitles|a label|alt text)\b/;
  return lower.split(/[;.!?]+/).filter((fragment) => !negated.test(fragment)).join(" ");
}

function matchedCategories(lower) {
  const asserted = withoutExplicitNegation(lower);
  return CATEGORY_RULES
    .filter(([, phrases]) => phrases.some((phrase) => asserted.includes(phrase)))
    .map(([category]) => category);
}

function matchedTargets(lower, inventory) {
  const asserted = withoutExplicitNegation(lower);
  return inventory.filter((element) =>
    element.spokenAliases.some((alias) => asserted.includes(alias.toLowerCase())),
  );
}

function clarificationFor(categories, targets) {
  if (categories.length !== 1 && targets.length !== 1) {
    return "Describe one barrier and one affected element at a time.";
  }
  if (categories.length !== 1) return "Which single barrier best describes the problem?";
  return "Which page element is affected?";
}

function safeBase(redactedReport, context) {
  return {
    schema: "accessbrief.session.v1",
    pageId: context.pageId,
    quotedInput: redactedReport,
    lifecycle: ["reported"],
    receipt: null,
  };
}

export function beginReport({ utterance, context, targetId }) {
  if (typeof utterance !== 'string' || !utterance.trim() || utterance.length > 8000 || !context?.pageId || !Array.isArray(context.inventory)) {
    throw new TypeError("utterance and a page inventory are required");
  }

  const redactedReport = redactIdentity(utterance);
  const lower = redactedReport.toLowerCase();
  const base = safeBase(redactedReport, context);

  if (INJECTION_RULES.some((phrase) => lower.includes(phrase))) {
    return {
      ...base,
      status: "blocked",
      reason: "inert_prompt_instruction",
      clarification: null,
    };
  }

  const categories = matchedCategories(lower);
  const targets = context.source === 'local_html_source' && targetId
    ? context.inventory.filter(element => element.id === targetId)
    : matchedTargets(lower, context.inventory);
  if (context.source === 'local_html_source' && targetId
    && [...lower.matchAll(/\bcontrol\s+(\d+)\b/g)].some(match => `control_${Number(match[1])}` !== targetId)) {
    return { ...base, status: 'needs_clarification', reason: 'conflicting_selected_target',
      clarification: 'The wording names a different control. Select that control or revise the report.' };
  }
  if (categories.length !== 1 || targets.length !== 1) {
    return {
      ...base,
      status: "needs_clarification",
      reason: "insufficient_or_conflicting_evidence",
      clarification: clarificationFor(categories, targets),
    };
  }

  const category = categories[0];
  const target = targets[0];
  if (!target.issueCodes.includes(category)) {
    return {
      ...base,
      status: "blocked",
      reason: "dom_evidence_does_not_support_report",
      clarification: null,
    };
  }

  return {
    ...base,
    status: "awaiting_confirmation",
    reason: null,
    clarification: null,
    lifecycle: ["reported", "verified"],
    normalized: {
      surface: "web",
      pageId: context.pageId,
      targetId: target.id,
      targetRole: target.role,
      barrierCategory: category,
      impact: context.source === 'local_html_source' ? 'Source markup lacks a supported text alternative. Confirm the finding in the rendered page.' : IMPACT[category],
      evidence: {
        source: context.source === 'local_html_source' ? 'local_html_source' : 'local_dom_inventory',
        selector: target.selector,
        issueCode: category,
        ...(context.source === 'local_html_source' ? { snapshotSha256: context.snapshotSha256 } : {}),
      },
    },
  };
}

export async function confirmReport(session, spokenConfirmation, options = {}) {
  if (session.status !== "awaiting_confirmation") return session;
  const normalizedConfirmation = spokenConfirmation.trim().toLowerCase();
  if (/\b(?:actually\s+)?cancel\b|\bdo not publish\b|\bdon't publish\b/i.test(spokenConfirmation)) {
    return {
      ...session,
      status: "cancelled",
      lifecycle: ["reported", "verified", "cancelled"],
      receipt: null,
    };
  }
  if (normalizedConfirmation !== CONFIRMATION_PHRASE.toLowerCase()) {
    return { ...session, status: "awaiting_confirmation" };
  }

  const report = session.normalized;
  const receiptBody = {
    schema: report.evidence.source === 'local_html_source' ? 'accessbrief.mcp-receipt.v2' : 'accessbrief.mcp-receipt.v1',
    report,
    confirmation: "explicit",
    lifecycle: ["reported", "verified", "confirmed", "published"],
  };
  const digest = await sha256(canonicalJson(receiptBody));
  const receipt = {
    ...receiptBody,
    receiptId: `ab_${digest.slice(0, 24)}`,
    sha256: digest,
  };
  const publishedReceiptIds = new Set(options.publishedReceiptIds ?? []);
  if (publishedReceiptIds.has(receipt.receiptId)) {
    return {
      ...session,
      status: "duplicate",
      lifecycle: ["reported", "verified", "confirmed", "duplicate"],
      receipt: null,
      duplicateOf: receipt.receiptId,
    };
  }

  return {
    ...session,
    status: "published",
    lifecycle: receipt.lifecycle,
    receipt,
  };
}
