import { defineEval } from "eve/evals";

// Live smoke: proves the web_search slot is Nimble-backed end to end.
// Requires NIMBLE_API_KEY and model credentials (AI_GATEWAY_API_KEY or a
// linked Vercel project) in the environment.
export default defineEval({
  description: "web_search (Nimble-backed) grounds an answer about current information.",
  async test(t) {
    await t.send(
      "Use web search to find what the 'eve' framework by Vercel is, and cite the URL you used.",
    );
    t.succeeded();
    t.calledTool("web_search");
    t.noFailedActions();
  },
});
