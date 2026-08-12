import { Nimble } from "@nimble-way/nimble-js";
import { NimbleConfigError } from "./errors";
import type { NimbleEveConfig, NimbleFullClient } from "./schemas";

/**
 * Identifies this integration to Nimble via the `X-Client-Source` header the
 * SDK sends on every request.
 */
const CLIENT_SOURCE = "eve";

let cached: { apiKey: string; client: NimbleFullClient } | undefined;

/**
 * Resolve the Nimble client for a tool call: an explicit `apiKey` from the
 * mount config wins, then `NIMBLE_API_KEY` from the environment. Constructed
 * lazily at execute time (never at module load), so building, `eve info`, and
 * mounting all work without a key. The cache is a single entry holding the
 * client for the most recently resolved key — extension config is static
 * after mount, so a single-mount session constructs one client; a process
 * that alternates between different keys rebuilds on each switch.
 */
export function resolveClient(config: NimbleEveConfig): NimbleFullClient {
  const apiKey = config.apiKey ?? process.env.NIMBLE_API_KEY;
  if (!apiKey) {
    throw new NimbleConfigError(
      "Missing Nimble API key: set NIMBLE_API_KEY or pass { apiKey } where the " +
        "extension is mounted (agent/extensions/nimble.ts).",
    );
  }
  if (cached?.apiKey !== apiKey) {
    const sdk = new Nimble({ apiKey, clientSource: CLIENT_SOURCE });
    // SDK 1.2 keeps Search as a top-level method, moves Extract to
    // `extract.run`, and exposes Agent API V2 under `agents`. Keep the rest of
    // the extension behind one small structural facade so tests can inject
    // focused mocks without depending on generated SDK types.
    cached = {
      apiKey,
      client: {
        search: sdk.search.bind(sdk),
        extract: sdk.extract.run.bind(sdk.extract),
        agents: sdk.agents,
      } as unknown as NimbleFullClient,
    };
  }
  return cached.client;
}
