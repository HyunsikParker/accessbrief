# AccessBrief

AccessBrief turns a spoken or typed accessibility barrier report into evidence that can be reviewed before publication. The repository contains a local web demonstration and an Agent Skill for the Alexa+ track. Both paths use the same deterministic core and the same annotated synthetic page.

## How it works

1. A report is treated as untrusted quoted input.
2. AccessBrief derives the affected control and accessibility issue from the rendered synthetic DOM.
3. Identity details are removed before the report is shown or persisted.
4. Ambiguous reports receive one clarification; prompt-like instructions are blocked.
5. A receipt is created only after the exact confirmation phrase.

## Requirements

- Node.js 20.19 or newer
- Run `npm ci` once to install the pinned HTML parser
- No account, API key, or runtime network service

## Run the web demonstration

[Open the browser demo](https://hyunsikparker.github.io/accessbrief/). It runs on
the synthetic page without installation. Confirmation creates an in-tab receipt;
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

The Skill uses parse5 to parse inert source HTML. It shares name and role resolution with the browser path, including ARIA label references, native labels, void elements and hidden decorative text. This covers annotated synthetic fixtures; it is not a complete accessible-name or WCAG audit and does not model CSS-generated content, computed styles or platform-specific defaults.

The tests cover real DOM evidence derivation, exact confirmation, deterministic receipts, identity redaction, prompt-injection blocking, and the live local Skill proof boundary.

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

## Privacy and safety boundary

This is a synthetic local demonstration. It does not inspect a private site, call a remote service, store audio, or retain report text. Reports are redacted before review, embedded instructions remain inert, and loose confirmations cannot publish.

## License

MIT. See `LICENSE`.
