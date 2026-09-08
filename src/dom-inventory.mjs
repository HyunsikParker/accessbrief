// Shared markup semantics for the annotated synthetic fixtures, not a full
// browser accessible-name algorithm (CSS and platform defaults are out of scope).
const NAMED_ROLES = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox']);
const compact = value => value.replace(/\s+/g, ' ').trim();
const attr = (node, name) => node.attributes?.[name] ?? null;

function descendants(node) {
  return [node, ...(node.children ?? []).flatMap(descendants)];
}
function hidden(node) {
  return attr(node, 'hidden') !== null || attr(node, 'aria-hidden') === 'true';
}
function text(node, includeHidden = false) {
  if (!includeHidden && hidden(node)) return '';
  if (['script', 'style', 'template'].includes(node.tag)) return '';
  if (node.tag === 'img') return attr(node, 'alt') ?? '';
  return node.text ?? (node.children ?? []).map(child => text(child, includeHidden)).join('');
}
function roleFor(node) {
  if (attr(node, 'role')) return attr(node, 'role').split(/\s+/)[0].toLowerCase();
  if (node.tag === 'a') return attr(node, 'href') === null ? 'generic' : 'link';
  if (node.tag === 'textarea') return 'textbox';
  if (node.tag === 'select') return 'combobox';
  if (node.tag === 'input') {
    const type = (attr(node, 'type') ?? 'text').toLowerCase();
    if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    if (['checkbox', 'radio'].includes(type)) return type;
    if (type === 'hidden') return 'none';
    return 'textbox';
  }
  if (node.tag === 'img' && attr(node, 'alt') === '' && !attr(node, 'aria-label') && !attr(node, 'aria-labelledby')) return 'presentation';
  return node.tag;
}

function nameFor(node, all, byId) {
  const references = (attr(node, 'aria-labelledby') ?? '').trim().split(/\s+/).map(id => byId.get(id)).filter(Boolean);
  // At least one valid reference wins, even if its text alternative is empty.
  if (references.length) return compact(references.map(ref => {
    return attr(ref, 'aria-label')?.trim() || text(ref, true);
  }).join(' '));
  if (attr(node, 'aria-label')?.trim()) return compact(attr(node, 'aria-label'));
  if (node.tag === 'img') return compact(attr(node, 'alt') ?? attr(node, 'title') ?? '');
  if (['input', 'textarea', 'select', 'button'].includes(node.tag)) {
    const labels = all.filter(candidate => candidate.tag === 'label' && (
      (attr(node, 'id') && attr(candidate, 'for') === attr(node, 'id')) ||
      (attr(candidate, 'for') === null && descendants(candidate).includes(node))
    ));
    if (labels.length) return compact(labels.map(label => text(label)).join(' '));
  }
  if (node.tag === 'input' && ['button', 'submit', 'reset'].includes((attr(node, 'type') ?? '').toLowerCase())) {
    return compact(attr(node, 'value') ?? attr(node, 'title') ?? '');
  }
  const fromContent = ['button', 'link'].includes(roleFor(node)) ? compact(text(node)) : '';
  return fromContent || compact(attr(node, 'title') ?? '');
}

export function inventoryFromTree(tree) {
  const all = descendants(tree);
  const roots = all.filter(node => attr(node, 'data-accessbrief-page') !== null);
  if (roots.length !== 1) throw new Error('exactly one data-accessbrief-page root required');
  const byId = new Map();
  for (const node of all) {
    const id = attr(node, 'id');
    if (!id) continue;
    if (byId.has(id)) throw new Error('duplicate DOM id prevents reliable evidence');
    byId.set(id, node);
  }
  const targetIds = new Set();
  const root = roots[0];
  const inventory = descendants(root).filter(node => node !== root && attr(node, 'data-accessbrief-target') !== null).map(node => {
    const id = attr(node, 'id');
    const targetId = attr(node, 'data-accessbrief-target');
    if (!id || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || !targetId || targetIds.has(targetId)) {
      throw new Error('annotated targets require unique target identifiers and simple DOM ids');
    }
    targetIds.add(targetId);
    const role = roleFor(node);
    const accessibleName = nameFor(node, all, byId);
    const suppressed = all.some(parent => hidden(parent) && descendants(parent).includes(node));
    let issueCodes = [];
    if (!suppressed && accessibleName === '') {
      if (NAMED_ROLES.has(role)) issueCodes = ['missing_label'];
      if (role === 'img' && attr(node, 'alt') === null) issueCodes = ['missing_alt_text'];
    }
    return { id: targetId, role, selector: `#${id}`,
      spokenAliases: (attr(node, 'data-accessbrief-aliases') ?? '').split('|').map(value => value.trim()).filter(Boolean),
      issueCodes, accessibleName };
  });
  return { pageId: attr(root, 'data-accessbrief-page'), inventory };
}

export function treeFromDocument(document) {
  function convert(node) {
    if (node.nodeType === 3) return { text: node.nodeValue ?? '' };
    return { tag: node.localName ?? '',
      attributes: Object.fromEntries([...node.attributes ?? []].map(attribute => [attribute.name, attribute.value])),
      children: [...node.childNodes ?? []].filter(child => [1, 3].includes(child.nodeType)).map(convert) };
  }
  return convert(document.documentElement);
}

export function accessibleNameForElement(element) {
  const all = descendants(treeFromDocument(element.ownerDocument));
  const byId = new Map(all.filter(node => attr(node, 'id')).map(node => [attr(node, 'id'), node]));
  const node = byId.get(element.id);
  if (!node) throw new Error('annotated targets require an id');
  return nameFor(node, all, byId);
}

export function inventoryFromDocument(document) {
  return inventoryFromTree(treeFromDocument(document));
}
