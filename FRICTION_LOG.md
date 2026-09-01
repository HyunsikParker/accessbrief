# Agent Skill onboarding friction log

## Task

Build a runnable Alexa+ Agent Skill and make its invocation and output inspectable for judges.

## Steps taken

1. Reviewed the Agent Skill submission path and available guidance.
2. Looked for one end-to-end reference covering the discovery folder, invocation contract, input and output schemas, and judge-visible proof.
3. Implemented and tested the smallest local equivalent.

## Expected result

One minimal starter should show the required directory tree, exact invocation, request and response shapes, and a local proof path in a single flow.

## Actual result

The Agent Skill route was clear, but no single reference brought those four details together. Resolving the acceptable layout and proof boundary took longer than reaching a browser-based hello world.

## Severity

**Important.** This slowed onboarding and created avoidable ambiguity, but it did not block a working implementation.

## Workaround

AccessBrief uses a `SKILL.md` contract, a dependency-free Node.js entry point that accepts one JSON request on standard input, and a bounded local proof endpoint that displays the same deterministic result in the browser.

## Actionable suggestion

Publish one minimal end-to-end Agent Skill starter containing the directory tree, invocation command, request and response schemas, one local test, and one judge-visible proof example.
