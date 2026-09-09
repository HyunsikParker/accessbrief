# AccessBrief

AccessBrief helps a website maintainer turn an accessibility barrier report into a small, reproducible evidence file. The Alexa+ browser simulation and the executable Agent Skill share the same deterministic reporting core. Use the built-in checkout demo, or import source HTML from another page without executing it.

## How it works

1. A report is treated as untrusted quoted input.
2. AccessBrief checks the rendered synthetic DOM or parses imported HTML as inert text.
3. Detected identity patterns are removed before review; the user checks what remains.
4. Ambiguous reports receive one clarification; prompt-like instructions are blocked.
5. A receipt is created only after explicit confirmation. The Skill requires the exact confirmation phrase.

## Requirements

- Node.js 20.19 or newer
- Run `npm ci` once to install the pinned HTML parser and browser bundler
- No account, API key, or runtime network service

## Run the web demonstration

[Open the browser demo](https://hyunsikparker.github.io/accessbrief/). It runs on
the sample page or imported HTML without installation. Confirmation creates an in-tab receipt;
it does not send a report anywhere. The Agent Skill proof requires the local server.

For local use:

```sh
npm start
```

Open `http://127.0.0.1:4173/`. The server binds only to localhost and exposes a fixed file allowlist.

To verify the shipped Agent Skill through the same local server, open
`http://127.0.0.1:4173/?skill-proof=1` and choose **Run Agent Skill**. The
proof endpoint accepts no request body and returns only the frozen case status,
target, live synthetic-identity redaction and confirmation checks, and receipt
identifier.

## Test

```sh
npm test
```

The browser and Skill both use parse5 for imported HTML. They share name and role resolution, including ARIA label references, native labels, void elements and hidden decorative text. The tests also cover file bounds, stale confirmations, source-bound receipts, source reinspection and the original local Skill proof.

## Inspect another page

Choose **Choose a page to inspect**, then open a saved HTML file. No AccessBrief annotations are required. Select a control or image, describe one barrier, review the evidence, and confirm before downloading a receipt. **Try ticket-booking HTML** loads the same bytes as [the downloadable example](examples/ticket-booking.html).

The imported-page check is deliberately narrow: missing names on supported native controls and missing image descriptions. It accepts up to 256 KiB, 100 supported controls/images, 10,000 nodes and 80 levels of nesting. Ambiguous duplicate IDs are rejected. Custom ARIA widgets and inputs with browser-dependent default names are skipped. Scripts, stylesheets, images, frames and links are never executed or fetched.

This is source inspection, not a rendered accessibility audit. CSS, dynamic content, keyboard behavior, contrast, platform defaults and the complete accessible-name algorithm are outside its scope. A source finding needs confirmation in the target browser; a name being present does not establish accessibility.

Imported receipts use structural selectors and a SHA-256 hash of the exact source text. They omit file names, source IDs, text labels, URLs, field values and report wording. Changing the page or selected target clears the previous review and download action.

## Run the Agent Skill

The skill is defined in `skills/accessbrief/SKILL.md`. Start it with:

```sh
npm run skill
```

Paste one JSON object on standard input, then send end-of-file. Review first:

```json
{"action":"review","report":"The checkout button has no label for my screen reader."}
```

Publish only after exact confirmation:

```json
{"action":"publish","report":"The checkout button has no label for my screen reader.","confirmation":"Yes, publish this accessibility report."}
```

For another page, send `{"action":"inspect","html":"<button></button>"}` first. The response lists generated target IDs, roles, selectors and supported findings without echoing the HTML. Review with the same `html`, a returned `targetId` such as `control_1`, and a `report`. Publish requires the same inputs plus the exact `confirmation`. Requests travel on stdin; the Skill accepts no file path or URL to fetch. The request limit is 320 KiB, and report wording is limited to 8,000 characters.

## Download and check a receipt

After confirmation, choose **Download report**. A duplicate report can
retrieve the same receipt during that tab session. Editing, clearing, or cancelling
a report removes the download action until a report is confirmed again.

The file contains reviewed page evidence, the confirmation lifecycle, and a
canonical SHA-256 checksum. It omits the report wording, including redacted wording.
Check a downloaded file offline with:

```sh
npm run verify-receipt -- accessbrief-report.json
```

A valid file exits with code 0. Modified contents, extra fields, malformed JSON,
and files over 64 KiB exit with code 1. Whitespace and JSON key order do not affect
the canonical checksum. This checks file consistency only: the receipt is unsigned,
anyone can recompute its checksum, and the verifier does not inspect a page or
establish who confirmed the report.

For an imported-page receipt, also verify the source and repeat its finding:

```sh
npm run verify-receipt -- RECEIPT.json --html examples/ticket-booking.html
```

The browser offers the same check under **Check a saved report**. Open the original HTML first, then the receipt. A different source hash or a finding that the parser cannot reproduce fails. This additional check still does not authenticate the person who confirmed the report or evaluate rendered accessibility. Original v1 checkout receipts remain supported; imported HTML uses v2 receipts.

The interface uses plain item names and review results. Internal target IDs, selectors, source hashes and receipt IDs remain in the downloadable evidence file and the Skill output. They are not displayed in the reporting workflow. The layout adapts to mobile, and font and image assets are served locally.

## Privacy and safety boundary

This is a local Alexa+ simulation, with no Alexa device or remote model connected. It fetches no website and stores no audio. Imported source is parsed locally and never displayed, uploaded or persisted. Known identity patterns in report wording are redacted before review; this pattern filter does not guarantee complete anonymization. Reviewed wording and the derived inventory stay in memory for the tab session. Embedded instructions cannot authorize confirmation, and a receipt is not sent to a site owner.

## License

Code: MIT. See `LICENSE`. IBM Plex Sans is distributed under the SIL Open Font License in `web/assets/fonts/LICENSE-Plex-Sans.txt`. Its font files are copied from IBM's `@ibm/plex-sans` package, version 1.1.0. Small empty-state and saved-report illustrations were generated with GPT Image.
