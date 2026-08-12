import { defineTool } from "eve/tools";

import extension from "../extension";
import { executeExtract } from "../lib/extract-core";
import { nimbleExtractInputSchema } from "../lib/schemas";

/**
 * Page extraction backed by Nimble (`POST /v1/extract`). Surfaces as
 * `nimble__extract` when the extension is mounted as `nimble.ts`; re-export it
 * from `agent/tools/web_fetch.ts` to replace eve's built-in page fetcher with
 * rendered, markdown-cleaned extraction.
 */
export default defineTool({
  description:
    "Fetch a web page by URL with Nimble and return its clean, readable content " +
    "(markdown or HTML) — use this to read, quote, or summarize a specific page.",
  inputSchema: nimbleExtractInputSchema,
  async execute(input, ctx) {
    return executeExtract(input, { config: extension.config, signal: ctx.abortSignal });
  },
});
