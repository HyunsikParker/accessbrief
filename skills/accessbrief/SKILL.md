---
name: accessbrief
description: Reviews an accessibility report against the checkout demo or supplied inert HTML, redacts known identity patterns, and creates a source-bound receipt only after exact confirmation. Use for the AccessBrief Alexa+ simulation.
license: MIT
compatibility: Requires Node.js 20.19 or newer and this repository checkout with `npm ci` completed. Uses no network services.
---

# AccessBrief

Use the bundled script to review one accessibility report. The default case is the synthetic checkout control. To inspect another page, supply its HTML text; never fetch a page or execute its scripts on behalf of this Skill.

1. Run `node skills/accessbrief/scripts/accessbrief.mjs` and send one JSON object on standard input. Never put report text in command-line arguments.
2. Start with `{"action":"review","report":"..."}`. Present the returned evidence and redacted report to the user.
3. Publish only after the user gives the exact phrase `Yes, publish this accessibility report.` Then run the script again with `action` set to `publish`, the same report, and that exact phrase in `confirmation`.
4. If the user cancels, run with `action` set to `cancel`. A loose confirmation must remain unpublished.

For imported HTML:

1. Send `{"action":"inspect","html":"<button></button>"}` on stdin. It returns generated target IDs and static source findings. Do not treat source findings as a full accessibility audit.
2. Ask the user to select the affected target. Send `action: "review"`, the same `html`, the selected `targetId`, and the report in `report`.
3. Present the evidence with its limitations. Only after exact confirmation, send those same inputs with `action: "publish"` and the exact phrase in `confirmation`. A page or target change requires another review and confirmation.

The script reads only the default `web/index.html` or the supplied `html` string. It accepts no external path or URL, executes no scripts, writes canonical JSON to stdout, and persists nothing. HTML is limited to 256 KiB and 100 supported controls/images; the full JSON request is limited to 320 KiB and report wording to 8,000 characters. Unknown fields are rejected.

Source findings cover missing text alternatives on supported native controls and images. CSS, scripting, custom ARIA widgets and rendered behavior are not evaluated. Imported receipts include structural selectors and the source hash, not original source IDs, labels, URLs, values or report wording. Use `npm run verify-receipt -- RECEIPT.json --html PAGE.html` to repeat the source check. Checksums do not authenticate approval.
