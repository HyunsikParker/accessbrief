import { parse } from 'parse5';
import { nameFor, roleFor } from './dom-inventory.mjs';
import { sha256 } from './core.mjs';

export const MAX_HTML_BYTES = 262_144;
const supported = new Set(['button', 'a', 'input', 'textarea', 'select', 'img']);
const inputTypes = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'checkbox', 'radio', 'button']);

// parse5 only parses text. Never attach imported nodes to a document or iframe.
export async function inspectHtmlSource(html) {
  if (typeof html !== 'string' || !html.trim() || new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
    throw new Error('Choose a nonempty HTML file up to 256 KiB.');
  }
  const all = [];
  let count = 0;
  function convert(node, parent = null, depth = 0, selector = '') {
    if (++count > 10_000 || depth > 80) throw new Error('HTML exceeds the supported page complexity.');
    if (node.nodeName === '#text') return { text: node.value, parent };
    const value = { tag: node.tagName ?? '', attributes: Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value])), children: [], parent, selector };
    all.push(value);
    const counts = new Map();
    for (const child of node.childNodes ?? []) {
      if (!child.tagName && child.nodeName !== '#text') continue;
      const n = (counts.get(child.tagName) ?? 0) + 1;
      counts.set(child.tagName, n);
      const segment = child.tagName ? `${child.tagName}:nth-of-type(${n})` : '';
      value.children.push(convert(child, value, depth + 1, selector ? `${selector} > ${segment}` : segment));
    }
    return value;
  }
  convert(parse(html));
  const byId = new Map();
  for (const node of all) {
    const id = node.attributes.id;
    if (!id) continue;
    if (byId.has(id)) throw new Error('Duplicate HTML IDs make label references ambiguous.');
    byId.set(id, node);
  }
  function suppressed(node) {
    for (let current = node; current; current = current.parent) {
      const a = current.attributes;
      if (['head', 'script', 'style', 'template', 'svg', 'math'].includes(current.tag)
        || Object.hasOwn(a, 'hidden') || Object.hasOwn(a, 'inert') || a['aria-hidden']?.toLowerCase() === 'true'
        || /(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))/i.test(a.style ?? '')) return true;
    }
    return false;
  }
  let skipped = 0;
  const inventory = [];
  for (const node of all) {
    if (!supported.has(node.tag) || suppressed(node)) continue;
    const a = node.attributes;
    // Source alone cannot reproduce custom widgets or browser-default names.
    if (a.role || (node.tag === 'a' && !Object.hasOwn(a, 'href'))
      || (node.tag === 'input' && !inputTypes.has((a.type ?? 'text').toLowerCase()))) { skipped++; continue; }
    if (inventory.length >= 100) throw new Error('This page has more than 100 supported controls and images.');
    if (node.selector.length > 1000) throw new Error('HTML exceeds the supported page complexity.');
    const role = roleFor(node);
    const accessibleName = nameFor(node, all, byId);
    const issueCodes = [];
    if (!accessibleName) {
      if (role === 'img' && !Object.hasOwn(a, 'alt')) issueCodes.push('missing_alt_text');
      else if (['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox'].includes(role)) issueCodes.push('missing_label');
    }
    const index = inventory.length + 1;
    inventory.push({ id: `control_${index}`, role, selector: node.selector,
      // No source text, ids, values, URLs or file names enter the context or receipt.
      spokenAliases: [`control ${index}`], issueCodes,
      namePresent: Boolean(accessibleName), tag: node.tag });
  }
  if (!inventory.length) throw new Error('No supported controls or images were found.');
  const snapshotSha256 = await sha256(html);
  return { pageId: `html_${snapshotSha256.slice(0, 24)}`, source: 'local_html_source', snapshotSha256, inventory, skipped };
}
