import { defineTool } from "eve/tools";

import handle from "../extension";
import { awaitAgentRun } from "../lib/agent-core";
import { nimbleAgentResultInputSchema } from "../lib/schemas";

/** Resume and retrieve a run created by agent_start; never creates a run. */
export default defineTool({
  description:
    "Wait for and retrieve a Nimble Agent API V2 run using identifiers from " +
    "nimble__agent_start. Safe to replay because it never creates a replacement run.",
  inputSchema: nimbleAgentResultInputSchema,
  async execute(input, ctx) {
    return awaitAgentRun(
      {
        id: input.runId,
        web_search_agent_id: input.agentId,
        interaction_id: input.interactionId ?? "",
        status: "queued",
        is_active: true,
      },
      { config: handle.config, signal: ctx.abortSignal },
    );
  },
});
