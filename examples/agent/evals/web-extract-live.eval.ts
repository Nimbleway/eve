import { defineEval } from "eve/evals";

// Live smoke for the extract tool: given a concrete URL, the agent should
// read it with web_fetch (Nimble Extract, promoted into the built-in slot in
// this example) rather than searching.
export default defineEval({
  description: "web_fetch (Nimble-backed) reads a specific page the user provides.",
  async test(t) {
    await t.send(
      "Read https://vercel.com/blog and summarize the most recent post title. " +
        "Use the page itself, not a search.",
    );
    t.succeeded();
    t.calledTool("web_fetch");
    t.noFailedActions();
  },
});
