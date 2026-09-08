---
name: accessbrief
description: Reviews a synthetic web accessibility report against the annotated local page, removes identity details, and creates a deterministic receipt only after exact confirmation. Use for the AccessBrief Alexa+ demo flow.
license: MIT
compatibility: Requires Node.js 20.19 or newer and this repository checkout with `npm ci` completed. Uses no network services.
---

# AccessBrief

Use the bundled script to review one synthetic accessibility report against the rendered checkout control.

1. Run `node skills/accessbrief/scripts/accessbrief.mjs` and send one JSON object on standard input. Never put report text in command-line arguments.
2. Start with `{"action":"review","report":"..."}`. Present the returned evidence and redacted report to the user.
3. Publish only after the user gives the exact phrase `Yes, publish this accessibility report.` Then run the script again with `action` set to `publish`, the same report, and that exact phrase in `confirmation`.
4. If the user cancels, run with `action` set to `cancel`. A loose confirmation must remain unpublished.

The script reads only `web/index.html`, derives evidence from its annotated DOM, writes canonical JSON to standard output, and does not persist reports or use the network.
