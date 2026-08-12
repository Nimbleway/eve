import { defineTool } from "eve/tools";

import handle from "../extension";
import { createAgentRun } from "../lib/agent-core";
import { nimbleAgentInputSchema } from "../lib/schemas";

/**
 * Start the non-idempotent, billable operation as its own short Eve step. Eve
 * durably records the identifiers returned by a completed tool step, and the
 * separate agent_result tool resumes polling without another create.
 */
export default defineTool({
  description:
    "Start one Nimble Web Search Agent run for multi-source research, enrichment, " +
    "or dataset building. Returns durable run identifiers; call nimble__agent_result next.",
  inputSchema: nimbleAgentInputSchema,
  async execute(input, ctx) {
    return createAgentRun(input, {
      config: handle.config,
      signal: ctx.abortSignal,
    });
  },
});
