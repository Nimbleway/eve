import { defineAgent } from "eve";
import { openai } from "@ai-sdk/openai";

// Gateway model by default; falls back to calling OpenAI directly when only
// OPENAI_API_KEY is configured (no AI Gateway credentials / linked project).
const hasGatewayCreds = Boolean(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
);

export default defineAgent({
  model: hasGatewayCreds ? "anthropic/claude-sonnet-5" : openai("gpt-5.4-mini"),
});
