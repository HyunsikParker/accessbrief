import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inventoryFromHtml } from '../src/html-inventory.mjs';
const fixture = await readFile(new URL('./dom-cases.html', import.meta.url), 'utf8');
const cases = [["plain", "<button>Continue</button>", "Continue", "button"], ["empty", "<button></button>", "", "button"], ["priority", "<span id=\"label-priority\">Pay now</span><button aria-labelledby=\"label-priority\" aria-label=\"Other\">Child</button>", "Pay now", "button"], ["broken", "<button aria-labelledby=\"absent\" aria-label=\"Fallback\"></button>", "Fallback", "button"], ["native", "<label for=\"native\">Email</label><input>", "Email", "textbox"], ["wrapped", "<label>Search <input></label>", "Search", "textbox"], ["image", "<img alt=\"Route map\">", "Route map", "img"], ["decorative", "<img alt=\"\">", "", "presentation"], ["nested", "<button>Save <span aria-hidden=\"true\">icon</span><strong>draft</strong></button>", "Save draft", "button"], ["entities", "<button>Save &amp; send &#33;</button>", "Save & send !", "button"]];
for (const [id, , name, role] of cases) {
  test(`source inventory resolves ${id}`, () => {
    const item = inventoryFromHtml(fixture).inventory.find(item => item.id === id);
    assert.ok(item);
    assert.equal(item.accessibleName, name);
    assert.equal(item.role, role);
    assert.deepEqual(item.issueCodes, id === 'empty' ? ['missing_label'] : []);
  });
}
test('duplicate DOM ids cannot create grounded evidence', () => {
 assert.throws(() => inventoryFromHtml(fixture.replace('id="empty"', 'id="plain"')), /duplicate DOM id/);
});
test('unannotated controls do not enter the report inventory', () => {
 assert.equal(inventoryFromHtml(fixture.replace('</main>', '<button id="outside"></button></main>')).inventory.length, 10);
});
