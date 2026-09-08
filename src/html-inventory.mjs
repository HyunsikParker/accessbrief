import { parse } from 'parse5';
import { inventoryFromTree } from './dom-inventory.mjs';

/** Parse inert source HTML without executing scripts or loading resources. */
export function inventoryFromHtml(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 1024 * 1024) {
    throw new Error('HTML must be a string no larger than 1 MiB');
  }
  function convert(node) {
    if (node.nodeName === '#text') return { text: node.value };
    return { tag: node.tagName ?? '',
      attributes: Object.fromEntries((node.attrs ?? []).map(attribute => [attribute.name, attribute.value])),
      children: (node.childNodes ?? []).filter(child => child.tagName || child.nodeName === '#text').map(convert) };
  }
  return inventoryFromTree(convert(parse(html)));
}
