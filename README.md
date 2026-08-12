# @nimble-way/eve

Nimble Web Search, Extract, and Agent API V2 as an extension for [Vercel's eve](https://eve.dev) agent framework.

Mount one extension and your agent gets ranked web search results, clean page
extraction, and long-running Web Search Agent research backed by
[Nimble](https://nimbleway.com)'s web data infrastructure.

## Features

- **`nimble__search`** — web search returning ranked results with title, URL, snippet, and (in deep mode) page content.
- **`nimble__extract`** — fetch a page by URL and get clean, readable markdown (or HTML) plus the links found on it.
- **`nimble__agent_start` + `nimble__agent_result`** — start multi-source
  research, enrichment, or dataset building in one short durable step, then
  resume/poll it without replaying the billable create.
- **`web_search` override recipe** — replace eve's provider-managed built-in search with Nimble in one line (no AI Gateway search provider needed).
- **`web_fetch` override recipe** — replace eve's built-in page fetch with Nimble Extract (rendered pages, cleaned main content).
- **`nimble__web-research` skill** — teaches the agent when to search vs extract and how to combine them, recognizing both the namespaced and promoted tool names.
- Abort-aware (tool calls cancel with the run), typed config, zero required configuration beyond an API key.

## Install

```bash
npm i @nimble-way/eve
# pnpm add @nimble-way/eve
```

## Prerequisites

- An eve project (`npx eve@latest init`) on eve **>= 0.27.8**, Node >= 24.
- A Nimble API key in `NIMBLE_API_KEY` (eve auto-loads `.env` / `.env.local`), or passed at the mount site.

## Usage

### Mount the extension

Create `agent/extensions/nimble.ts` — the filename is the namespace, so this
mount exposes `nimble__search`, `nimble__extract`, `nimble__agent_start`,
`nimble__agent_result`, and the `nimble__web-research` skill:

```ts
// agent/extensions/nimble.ts
import nimble from "@nimble-way/eve";

export default nimble({}); // apiKey falls back to NIMBLE_API_KEY
```

Run `eve info` and you should see the `nimble__*` tools and skill listed.

### Make Nimble your built-in `web_search`

eve's built-in `web_search` is provider-managed and only available on some model providers. To replace it with Nimble for every model, author the override in your agent (only the consuming agent may replace framework built-ins — an extension can't do it for you):

```ts
// agent/tools/web_search.ts
export { search as default } from "@nimble-way/eve/tools";
```

That's the whole file. `eve info` will now resolve `web_search` to the Nimble implementation.

### Mounting and promoting together? Disable each duplicate

Every tool you promote to a built-in slot needs its namespaced duplicate disabled in the mount's override slot — otherwise the same tool appears twice (once as the built-in, once as `nimble__*`). Mount as a directory and add one `disableTool()` file per promoted tool. The full recommended setup — both tools promoted — is five files:

```ts
// agent/extensions/nimble/extension.ts   (the mount)
import nimble from "@nimble-way/eve";
export default nimble({});
```

```ts
// agent/tools/web_search.ts              (promote search to the built-in slot)
export { search as default } from "@nimble-way/eve/tools";
```

```ts
// agent/extensions/nimble/tools/search.ts   (disable the duplicate nimble__search)
import { disableTool } from "eve/tools";
export default disableTool();
```

```ts
// agent/tools/web_fetch.ts               (promote extract to the built-in slot)
export { extract as default } from "@nimble-way/eve/tools";
```

```ts
// agent/extensions/nimble/tools/extract.ts  (disable the duplicate nimble__extract)
import { disableTool } from "eve/tools";
export default disableTool();
```

`eve info` should then list exactly `web_search` and `web_fetch` (both Nimble-backed) plus the `nimble__web-research` skill. Promoting only one of the two? Keep that tool's promote + disable pair and drop the other's — the un-promoted tool stays available as `nimble__search` / `nimble__extract`. (The [example agent](examples/agent) in this repo runs the full five-file setup.)

### Why promote `web_fetch`?

eve's built-in `web_fetch` does a plain fetch. Nimble Extract renders the page and returns cleaned main content — useful for JavaScript-heavy pages. The bundled `nimble__web-research` skill recognizes both namings, so it keeps working whichever setup you choose.

## Configuration

All fields are optional; pass them where the extension is mounted:

```ts
export default nimble({
  apiKey: process.env.NIMBLE_API_KEY,
  search: { depth: "lite", maxResults: 5, country: "US", locale: "en" },
  extract: { format: "markdown" },
  agent: { pollIntervalMs: 10_000, timeoutMs: 420_000 },
});
```

| Option | Default | Notes |
|---|---|---|
| `apiKey` | `NIMBLE_API_KEY` env | Resolved at call time, so building and `eve info` work without a key |
| `search.depth` | `"lite"` | `"lite"` (snippets, fast) or `"deep"` (full page content in results) |
| `search.maxResults` | `5` | Default result count when the model doesn't ask for a specific number |
| `search.maxResultsCap` | `10` | Hard cap on what the model can request |
| `search.country` / `search.locale` | `"US"` / `"en"` | Result localization |
| `search.maxContentLength` | `10000` | Per-result content truncation (chars) |
| `extract.format` | `"markdown"` | `"markdown"` (cleaned main content) or `"html"` |
| `extract.country` | — | Geolocation / proxy selection for the fetch |
| `extract.maxContentLength` | `50000` | Extracted content truncation (chars) |
| `agent.pollIntervalMs` | `10000` | Configurable Agent API V2 status polling interval; production values must be at least 10 seconds |
| `agent.timeoutMs` | `420000` | Bounded deadline for reaching a terminal run state |

## Output shape

`search` returns:

```jsonc
{
  "query": "…",
  "requestId": "…",
  "totalResults": 12,
  "results": [
    { "title": "…", "url": "…", "description": "…", "content": "…", "position": 1, "entityType": "OrganicResult" }
  ]
}
```

`extract` returns:

```jsonc
{
  "url": "…",            // final URL after redirects
  "status": "success",
  "statusCode": 200,
  "format": "markdown",  // the rendering actually returned
  "content": "…",        // cleaned page content, truncated to the configured cap
  "links": ["…"]
}
```

`agent_start` returns the Agent API V2 run, agent, and interaction identifiers.
Pass those identifiers to `agent_result`, which waits for the terminal state and
returns the result envelope. Text and JSON outputs include Nimble trust metadata
and citations. `agent_start` supports:

- no `agentName` to create a persistent minimal agent and start a run;
- optional `agentName` to create or reuse a stable named agent (its `useCase`
  is fixed when the named agent is created);
- `skill`, `inputData`, `outputSchema`, `previousInteractionId`, and `sources`
  request values;
- `useCase` when creating a named agent (it is fixed at creation, not a general
  per-run override);
- optional `enableEvents` to request Agent API V2 event collection;
- optional `effort` values `low`, `medium`, `high`, and `x-high`.

Source allow/block groups use the SDK 1.2 shape:
`{ title, domains, order? }`.

When `effort` is omitted, the request omits it too so the stored agent or
template default remains authoritative. `max` is intentionally not exposed as
a generally available user choice.

## Limitations

- Search results and extracted pages are third-party web content: treat them as untrusted data for your agent to reason over, not as instructions to follow. The bundled skill tells the model the same thing, but your own agent instructions are the strongest place to reinforce it.
- Data flow: web queries, URLs, Agent API task inputs, record data, skill
  instructions, output schemas, source rules, and interaction identifiers passed
  to these tools are sent to the Nimble API for processing. Apply your data
  classification, minimization, retention, and access-control requirements
  before sending sensitive or regulated data.
- `eve` is a wildcard peer, so a package manager may install the newest `eve` if your project doesn't already have one — pin `eve` yourself in your agent's `package.json` (the scaffold does this for you).
- Search depth is `lite` or `deep`; the search focus is fixed to general web results.
- Extraction returns readable content and links — not screenshots, scripts, or network captures.
- Agent API V2 creates are billable and non-idempotent. The extension disables
  SDK retries for the create request and keeps creation in the short
  `agent_start` tool step. Eve records its returned identifiers before the
  separate `agent_result` step begins polling, so resumed polling cannot create
  a replacement. Polling defaults to every 10 seconds with a bounded deadline;
  timeout, cancellation, and terminal errors retain `runId`, `agentId`, and
  `interactionId` for later retrieval.
- Whole-site crawling and URL discovery (Nimble Crawl / Map) are not part of this extension — see the [Nimble docs](https://docs.nimbleway.com) for those APIs.

## Troubleshooting

- **`NimbleConfigError: Missing Nimble API key`** — set `NIMBLE_API_KEY` in `.env.local`, or pass `{ apiKey }` at the mount site. The key is only needed when a tool actually runs.
- **`nimble__search` and `web_search` (or `nimble__extract` and `web_fetch`) look like the same tool** — they are; add the matching `disableTool()` file from the [promotion setup](#mounting-and-promoting-together-disable-each-duplicate) for every tool you promote.
- **Different namespace than `nimble__*`** — the prefix comes from your mount filename (`agent/extensions/<name>.ts`); name the file `nimble.ts` for the names used in this README.
- **Node version errors** — eve requires Node >= 24.

## Compatibility

Built and tested with **eve 0.27.8** and **`@nimble-way/nimble-js` 1.2.0**. Eve
0.27.8 remains the exact development pin used to generate the extension
capability manifest. A clean packed-tarball consumer test also passes on
**eve 0.33.2** (the current npm release verified 2026-08-12): TypeScript
compiles and `eve info` reports `ready` with zero diagnostics and all documented
tools and skills discovered. The `eve` peer dependency is the wildcard `*` per
eve's extension contract: npm semver does not decide extension compatibility —
eve validates it from the generated capability manifest at consumption time.

## License

Apache-2.0
