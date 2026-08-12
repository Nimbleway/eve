import type {
  ExtractFormat,
  NimbleExtractOutput,
  NimbleRawExtractResponse,
  NimbleRawSearchResponse,
  NimbleRawSearchResult,
  NimbleSearchOutput,
  NimbleSearchResultItem,
  NimbleSerpMetadata,
} from "./schemas";

export interface NormalizeOptions {
  query: string;
  maxContentLength: number;
}

/** SERP focus (`general`) carries position + entity_type; WSA does not. */
function isSerpMetadata(
  metadata: NimbleRawSearchResult["metadata"],
): metadata is NimbleSerpMetadata {
  return "position" in metadata;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // Don't end on a lone high surrogate: re-encoding downstream would turn the
  // split pair into U+FFFD.
  const lastUnit = cut.charCodeAt(cut.length - 1);
  return lastUnit >= 0xd800 && lastUnit <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Map a raw `/v1/search` response into the package's normalized output shape.
 *
 * - `description` is the snippet (always present when the API returns one).
 * - `content` is the full page text, present only in `deep` depth (empty in
 *   `lite`), truncated to `maxContentLength`.
 * - `position` / `entityType` come from SERP metadata; for WSA results
 *   `position` falls back to the array index and `entityType` is omitted.
 * - Results without a URL are dropped (defensive).
 * - `response.answer` is never surfaced.
 */
export function normalizeSearchResponse(
  response: NimbleRawSearchResponse,
  options: NormalizeOptions,
): NimbleSearchOutput {
  const results: NimbleSearchResultItem[] = [];

  response.results.forEach((raw, index) => {
    if (!raw.url) return;

    const item: NimbleSearchResultItem = {
      title: raw.title ?? "",
      url: raw.url,
    };
    if (raw.description) item.description = raw.description;
    const content = raw.content?.trim();
    if (content) {
      item.content = truncate(content, options.maxContentLength);
    }

    if (isSerpMetadata(raw.metadata)) {
      item.position = raw.metadata.position;
      item.entityType = raw.metadata.entity_type;
    } else {
      // Forward-compatible: WSA metadata is only returned for shopping/social/
      // geo focus modes, which this extension never requests (focus is fixed to
      // `general`). Kept so a future focus option degrades gracefully.
      item.position = index + 1;
    }

    results.push(item);
  });

  return {
    query: options.query,
    requestId: response.request_id,
    totalResults: response.total_results,
    results,
  };
}

export interface NormalizeExtractOptions {
  format: ExtractFormat;
  maxContentLength: number;
}

/**
 * Map a raw `/v1/extract` response into the package's normalized extract shape.
 *
 * - `content` is `data.markdown` (default) or `data.html`, falling back to the
 *   other when the requested one is empty, truncated to `maxContentLength`.
 * - `format` reflects the rendering actually returned, which may differ from
 *   the requested format when the fallback is used.
 * - `links` is surfaced when present; everything else (browser actions, network
 *   captures, screenshots) is intentionally dropped.
 */
export function normalizeExtractResponse(
  response: NimbleRawExtractResponse,
  options: NormalizeExtractOptions,
): NimbleExtractOutput {
  const data = response.data;
  const otherFormat: ExtractFormat = options.format === "html" ? "markdown" : "html";
  const primary = options.format === "html" ? data.html : data.markdown;
  const fallback = options.format === "html" ? data.markdown : data.html;

  // Report the format that actually populated `content`. We request one
  // rendering, but if the API returns it empty we fall back to the other — and
  // the model must be told which format it received, not the one we asked for.
  // A rendering that is present but blank (e.g. "\n" from a failed article
  // extraction) does not count as populated — otherwise it would win over a
  // fallback that actually has the page content.
  const primaryHasContent = Boolean(primary && primary.trim().length > 0);
  const fallbackHasContent = Boolean(fallback && fallback.trim().length > 0);
  const usedFormat: ExtractFormat = primaryHasContent
    ? options.format
    : fallbackHasContent
      ? otherFormat
      : options.format;
  // Trim the chosen rendering before truncating, matching the search path: a
  // real but heavily-padded body must not have its actual text sliced off by
  // the length cap and come back all-whitespace.
  const chosen = primaryHasContent ? primary : fallbackHasContent ? fallback : "";
  const content = truncate((chosen ?? "").trim(), options.maxContentLength);

  const out: NimbleExtractOutput = {
    url: response.url,
    status: response.status,
    format: usedFormat,
    content,
  };
  if (typeof response.status_code === "number") out.statusCode = response.status_code;
  if (data.links && data.links.length > 0) out.links = data.links;
  return out;
}
