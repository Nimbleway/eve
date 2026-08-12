import { defineEvalConfig } from "eve/evals";

// All evals here are deterministic (tool-call assertions) — no judge model
// and no reporters needed.
export default defineEvalConfig({});
