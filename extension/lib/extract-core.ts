import { resolveClient } from "./client";
import { NimbleExtractError } from "./errors";
import { normalizeExtractResponse } from "./normalize";
import { EXTRACT_DEFAULTS } from "./schemas";
import type {
  NimbleEveConfig,
  NimbleExtractClient,
  NimbleExtractInput,
  NimbleExtractOutput,
  NimbleExtractParams,
} from "./schemas";

export interface ExtractCoreOptions {
  config: NimbleEveConfig;
  /** Inject a pre-built / mock client (tests); skips key resolution. */
  client?: NimbleExtractClient;
  signal?: AbortSignal;
}

function readStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function toExtractError(err: unknown): NimbleExtractError {
  if (err instanceof NimbleExtractError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new NimbleExtractError(`Nimble extract failed: ${message}`, {
    status: readStatus(err),
    cause: err,
  });
}

/**
 * Extract clean, readable content from a web page (`POST /v1/extract`) and
 * return the normalized output. The model only chooses `{ url }`; format,
 * region, and length cap come from the mount config with safe defaults.
 */
export async function executeExtract(
  input: NimbleExtractInput,
  { config, client, signal }: ExtractCoreOptions,
): Promise<NimbleExtractOutput> {
  const e = config.extract ?? {};
  const format = e.format ?? EXTRACT_DEFAULTS.format;

  // Request both renderings (preferred format first) plus links. A rendering
  // is only produced when requested via `formats`, so asking for both lets an
  // empty primary fall back to the other; normalizeExtractResponse reports
  // whichever rendering actually populated the content.
  const params: NimbleExtractParams = {
    url: input.url,
    formats: format === "html" ? ["html", "markdown", "links"] : ["markdown", "html", "links"],
  };
  if (e.country) params.country = e.country;
  // `main_content` returns the cleaned article body rather than the full page.
  if (format === "markdown") params.markdown_backend = "main_content";

  const resolved = client ?? resolveClient(config);

  let raw;
  try {
    raw = await resolved.extract(params, signal ? { signal } : undefined);
  } catch (err) {
    throw toExtractError(err);
  }

  return normalizeExtractResponse(raw, {
    format,
    maxContentLength: e.maxContentLength ?? EXTRACT_DEFAULTS.maxContentLength,
  });
}
