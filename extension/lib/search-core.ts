import { resolveClient } from "./client";
import { NimbleSearchError } from "./errors";
import { normalizeSearchResponse } from "./normalize";
import { SEARCH_DEFAULTS } from "./schemas";
import type {
  NimbleEveConfig,
  NimbleSearchClient,
  NimbleSearchInput,
  NimbleSearchOutput,
  NimbleSearchParams,
} from "./schemas";

export interface SearchCoreOptions {
  config: NimbleEveConfig;
  /** Inject a pre-built / mock client (tests); skips key resolution. */
  client?: NimbleSearchClient;
  signal?: AbortSignal;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function toSearchError(err: unknown): NimbleSearchError {
  if (err instanceof NimbleSearchError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new NimbleSearchError(`Nimble search failed: ${message}`, {
    status: readStatus(err),
    cause: err,
  });
}

/**
 * Run a Nimble web search (`POST /v1/search`) and return the normalized
 * output. The model only chooses `{ query, maxResults? }`; all policy (depth,
 * focus, region, caps) comes from the mount config with safe defaults.
 */
export async function executeSearch(
  input: NimbleSearchInput,
  { config, client, signal }: SearchCoreOptions,
): Promise<NimbleSearchOutput> {
  const s = config.search ?? {};
  const maxResults = s.maxResults ?? SEARCH_DEFAULTS.maxResults;
  const maxResultsCap = s.maxResultsCap ?? SEARCH_DEFAULTS.maxResultsCap;

  const params: NimbleSearchParams = {
    query: input.query,
    max_results: clamp(input.maxResults ?? maxResults, 1, maxResultsCap),
    search_depth: s.depth ?? SEARCH_DEFAULTS.searchDepth,
    focus: SEARCH_DEFAULTS.focus, // fixed 'general'; WSA focus modes are out of scope
    country: s.country ?? SEARCH_DEFAULTS.country,
    locale: s.locale ?? SEARCH_DEFAULTS.locale,
  };

  const resolved = client ?? resolveClient(config);

  let raw;
  try {
    raw = await resolved.search(params, signal ? { signal } : undefined);
  } catch (err) {
    throw toSearchError(err);
  }

  return normalizeSearchResponse(raw, {
    query: input.query,
    maxContentLength: s.maxContentLength ?? SEARCH_DEFAULTS.maxContentLength,
  });
}
