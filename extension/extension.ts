import { defineExtension } from "eve/extension";
import { nimbleConfigSchema } from "./lib/schemas";

/**
 * Nimble web data for eve agents: web search, page extraction, and Agent API
 * V2 research/enrichment/dataset building.
 *
 * Mount (conventional filename gives tools the `nimble__` prefix):
 *
 * ```ts
 * // agent/extensions/nimble.ts
 * import nimble from "@nimble-way/eve";
 * export default nimble({}); // apiKey falls back to NIMBLE_API_KEY
 * ```
 *
 * Every config field is optional — the extension also works unmounted (tool
 * re-exports, tests); the API key is resolved at call time.
 */
export default defineExtension({
  config: nimbleConfigSchema,
});
