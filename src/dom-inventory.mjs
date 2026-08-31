const NAMED_ROLES = new Set(["button", "link", "img", "textbox"]);

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function attributeValue(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeEntities(match[1] ?? match[2] ?? "") : null;
}

function roleFor(tagName, explicitRole) {
  if (explicitRole) return explicitRole.toLowerCase();
  if (tagName === "a") return "link";
  if (tagName === "textarea" || tagName === "input") return "textbox";
  return tagName;
}

function aliasesFor(value) {
  return (value ?? "")
    .split("|")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function issueCodesFor(role, accessibleName) {
  return NAMED_ROLES.has(role) && accessibleName.trim() === "" ? ["missing_label"] : [];
}

function textFromMarkup(markup) {
  return decodeEntities(markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function accessibleNameFromMarkup(tagName, attributes, innerMarkup) {
  const ariaLabel = attributeValue(attributes, "aria-label");
  if (ariaLabel !== null) return ariaLabel.trim();
  if (tagName === "img") return (attributeValue(attributes, "alt") ?? "").trim();
  return textFromMarkup(innerMarkup);
}

function selectorFor(id) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) throw new Error("annotated targets require a simple id");
  return `#${id}`;
}

export function inventoryFromHtml(html) {
  const pageMatch = html.match(/\bdata-accessbrief-page\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  if (!pageMatch) throw new Error("missing data-accessbrief-page root");
  const pageId = decodeEntities(pageMatch[1] ?? pageMatch[2]);
  const inventory = [];
  const targetPattern = /<([a-z][a-z0-9-]*)\b([^>]*\bdata-accessbrief-target\s*=\s*(?:"[^"]+"|'[^']+')[^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(targetPattern)) {
    const [, rawTag, attributes, innerMarkup] = match;
    const tagName = rawTag.toLowerCase();
    const id = attributeValue(attributes, "id");
    const targetId = attributeValue(attributes, "data-accessbrief-target");
    if (!id || !targetId) throw new Error("annotated targets require id and data-accessbrief-target");
    const role = roleFor(tagName, attributeValue(attributes, "role"));
    const accessibleName = accessibleNameFromMarkup(tagName, attributes, innerMarkup);
    inventory.push({
      id: targetId,
      role,
      selector: selectorFor(id),
      spokenAliases: aliasesFor(attributeValue(attributes, "data-accessbrief-aliases")),
      issueCodes: issueCodesFor(role, accessibleName),
      accessibleName,
    });
  }
  return { pageId, inventory };
}

export function accessibleNameForElement(element) {
  if (element.hasAttribute("aria-label")) return element.getAttribute("aria-label").trim();
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
  }
  if (element.localName === "img") return (element.getAttribute("alt") ?? "").trim();
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function inventoryFromDocument(document) {
  const root = document.querySelector("[data-accessbrief-page]");
  if (!root) throw new Error("missing data-accessbrief-page root");
  const inventory = [...root.querySelectorAll("[data-accessbrief-target]")].map((element) => {
    if (!element.id) throw new Error("annotated targets require an id");
    const role = roleFor(element.localName, element.getAttribute("role"));
    const accessibleName = accessibleNameForElement(element);
    return {
      id: element.dataset.accessbriefTarget,
      role,
      selector: selectorFor(element.id),
      spokenAliases: aliasesFor(element.dataset.accessbriefAliases),
      issueCodes: issueCodesFor(role, accessibleName),
      accessibleName,
    };
  });
  return { pageId: root.dataset.accessbriefPage, inventory };
}
