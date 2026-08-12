import { defineTool } from "eve/tools";

import extension from "../extension";
import { executeSearch } from "../lib/search-core";
import { nimbleSearchInputSchema } from "../lib/schemas";

/**
 * Web search backed by Nimble (`POST /v1/search`). Surfaces as
 * `nimble__search` when the extension is mounted as `nimble.ts`; re-export it
 * from `agent/tools/web_search.ts` to replace eve's built-in web search.
 */
export default defineTool({
  description:
    "Search the web with Nimble and return ranked results (title, url, " +
    "snippet, and — in deep mode — page content) for answering questions " +
    "about current or factual information.",
  inputSchema: nimbleSearchInputSchema,
  async execute(input, ctx) {
    // extension.config is bound at the mount site; unmounted (re-export/test
    // paths) it validates to {} and policy falls back to safe defaults.
    return executeSearch(input, { config: extension.config, signal: ctx.abortSignal });
  },
});
