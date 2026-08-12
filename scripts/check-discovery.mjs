#!/usr/bin/env node
// Discovery check: build the example agent's resolved tool/skill surface with
// `eve info --json` and assert the extension contract:
//   - the nimble__web-research skill is discovered under the nimble__ prefix
//   - the web_search and web_fetch overrides (agent/tools/*.ts) own the
//     built-in slots (verified against the compiled manifest's source + desc)
//   - nimble__search and nimble__extract are absent (disabled in the mount dir
//     to avoid duplicating the promoted web_search / web_fetch)
//   - Agent API V2 creation and result retrieval are separate discovered tools
//     so resumed polling cannot repeat a billable create
// Runs credential-free; used by CI on every push.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = join(root, "examples", "agent");
const eveBin = join(root, "node_modules", ".bin", "eve");

const raw = execFileSync(eveBin, ["info", "--json"], {
  cwd: agentDir,
  encoding: "utf8",
});
// The CLI prints a banner line before the JSON payload.
const info = JSON.parse(raw.slice(raw.indexOf("{")));

const failures = [];
const assert = (cond, message) => {
  if (!cond) failures.push(message);
};

assert(info.status === "ready", `status is ${info.status}, expected ready`);
assert(info.diagnostics?.errors === 0, `discovery reported ${info.diagnostics?.errors} error(s)`);

const tools = info.tools ?? [];
assert(tools.includes("web_search"), "web_search override not discovered");
assert(tools.includes("web_fetch"), "web_fetch override not discovered");
assert(!tools.includes("nimble__search"), "nimble__search should be disabled in this example");
assert(!tools.includes("nimble__extract"), "nimble__extract should be disabled in this example");
assert(tools.includes("nimble__agent_start"), "nimble__agent_start not discovered");
assert(tools.includes("nimble__agent_result"), "nimble__agent_result not discovered");
assert((info.skills ?? []).includes("nimble__web-research"), "nimble__web-research skill not discovered");

const manifest = JSON.parse(
  readFileSync(join(agentDir, ".eve", "compile", "compiled-agent-manifest.json"), "utf8"),
);
const webSearch = (manifest.tools ?? []).find((t) => t.name === "web_search");
assert(
  webSearch?.description?.includes("Nimble"),
  "web_search is not the Nimble implementation — the built-in was not replaced",
);
assert(
  webSearch?.sourceId === "tools/web_search.ts",
  `web_search sourceId is ${webSearch?.sourceId}, expected the agent-local override`,
);
const webFetch = (manifest.tools ?? []).find((t) => t.name === "web_fetch");
assert(
  webFetch?.description?.includes("Nimble"),
  "web_fetch is not the Nimble implementation — the built-in was not replaced",
);
assert(
  webFetch?.sourceId === "tools/web_fetch.ts",
  `web_fetch sourceId is ${webFetch?.sourceId}, expected the agent-local override`,
);

if (failures.length > 0) {
  console.error("Discovery check FAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("Discovery check passed:");
console.log(`  ✓ tools: ${tools.join(", ")}`);
console.log(`  ✓ skills: ${(info.skills ?? []).join(", ")}`);
console.log("  ✓ web_search and web_fetch are the Nimble implementations (agent-local overrides)");
