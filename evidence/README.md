# Hosted Eve + Nimble Agent API V2 evidence

## Corrected live validation — 2026-08-12

The reviewed extension was deployed to a protected hosted Eve environment.
Anonymous discovery was denied with HTTP 401, authenticated discovery returned
HTTP 200 with zero errors or warnings, and Eve exposed
`nimble__agent_start` plus `nimble__agent_result`.

One authorized create used `maxRetries: 0`. A single replay-safe result call
resumed the returned run and agent, used the configured 10-second polling
interval, and reached `completed` after 141.4 seconds. No replacement create,
generic search, or fetch call was used.

The result was classified **grounded** with high trust confidence, six official
primary sources, and five trust-reviewed claims. The validation query required
five current Eve adoption claims, official sources only, explicit unknowns,
and no more than six source pages.

## Historical native-UI recording

[eve-agent-sdk-1.2-live-demo.mp4](./eve-agent-sdk-1.2-live-demo.mp4) is a
sanitized recording of the earlier single-tool implementation running in Eve's
native terminal UI. It demonstrates:

- protected hosted execution;
- anonymous API access denied with HTTP 401;
- Eve selecting the Nimble Agent tool exactly once;
- changing live tool state followed by terminal completion; and
- a citation-bearing final response.

The recording predates the replay-safe split into `nimble__agent_start` and
`nimble__agent_result`. It is retained as UI evidence, while the corrected live
validation above is the release gate.

## Local validation

- TypeScript typecheck: passed
- Vitest: 70/70 passed
- Eve extension build: passed
- Example agent typecheck/build: passed
- Packed-tarball clean consumer on Eve 0.33.2: typecheck passed; `eve info`
  returned `ready`, zero diagnostics, and discovered `web_search`, `web_fetch`,
  `nimble__agent_start`, `nimble__agent_result`, and
  `nimble__web-research`
- `git diff --check`: passed

No credentials, authorization headers, account identifiers, deployment
identifiers, session identifiers, or run identifiers are included in this
public evidence bundle.
