import { z } from "zod";

// ── Tool inputs ────────────────────────────────────────────────────────────

/**
 * The search input the model fills in. Kept deliberately small: the model only
 * chooses the query and (optionally) how many results it wants. All policy
 * (depth, focus, region, caps) is fixed by the developer via extension config,
 * not by the model.
 */
export const nimbleSearchInputSchema = z.object({
  query: z.string().min(1).describe("The web search query."),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("How many results to return (clamped to the configured cap)."),
});

export type NimbleSearchInput = z.infer<typeof nimbleSearchInputSchema>;

/**
 * The extract input the model fills in: just the URL to read. All policy
 * (format, region, length cap) is fixed by the developer via extension config.
 */
export const nimbleExtractInputSchema = z.object({
  // Restricted to http(s): a bare URL check also accepts file:, data: and
  // javascript:, which have no meaning for a web fetch. A raw protocol regex is
  // used rather than z.httpUrl(), which additionally enforces a dotted-domain
  // hostname and would reject localhost / bare-IP extract targets.
  url: z
    .url({ protocol: /^https?$/ })
    .describe("The URL of the web page to extract clean content from."),
});

export type NimbleExtractInput = z.infer<typeof nimbleExtractInputSchema>;

const jsonObjectSchema = z.record(z.string(), z.unknown());

const sourceRuleSchema = z.object({
  title: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
  order: z.number().int().nonnegative().optional(),
});

const sourcesSchema = z.object({
  allow: z.array(sourceRuleSchema).optional(),
  avoid: z.string().optional(),
  block: z.array(sourceRuleSchema).optional(),
  prioritize: z.string().optional(),
});

/**
 * Agent API V2 input. `effort` is optional and therefore omitted unless the
 * caller chooses an override; Nimble's stored agent/template default remains
 * authoritative. `max` is intentionally outside this extension's supported
 * effort surface.
 */
export const nimbleAgentInputSchema = z.object({
  input: z.string().min(1).describe("The research, enrichment, or dataset-building task."),
  agentName: z
    .string()
    .min(1)
    .optional()
    .describe("Stable agent name to create or reuse. Omit to create a persistent minimal agent."),
  effort: z
    .enum(["low", "medium", "high", "x-high"])
    .optional()
    .describe("Optional per-run effort override. Omit to use the agent or template default."),
  enableEvents: z
    .boolean()
    .optional()
    .describe("Request Agent API V2 event collection for this run."),
  useCase: z
    .enum(["research", "enrichment", "dataset_building"])
    .optional()
    .describe("Use case fixed when a named agent is created; not a per-run override."),
  skill: z.string().min(1).optional(),
  inputData: z.union([jsonObjectSchema, z.array(jsonObjectSchema)]).optional(),
  outputSchema: jsonObjectSchema.optional(),
  previousInteractionId: z
    .string()
    .min(1)
    .optional()
    .describe("Continue from a previous Agent API V2 interaction."),
  sources: sourcesSchema.optional(),
});

export type NimbleAgentInput = z.infer<typeof nimbleAgentInputSchema>;

export const nimbleAgentResultInputSchema = z.object({
  runId: z.string().min(1).describe("Run ID returned by nimble__agent_start."),
  agentId: z.string().min(1).describe("Agent ID returned by nimble__agent_start."),
  interactionId: z
    .string()
    .min(1)
    .optional()
    .describe("Interaction ID returned by nimble__agent_start, when available."),
});

export type NimbleAgentResultInput = z.infer<typeof nimbleAgentResultInputSchema>;

// ── Extension config ───────────────────────────────────────────────────────

/**
 * Search depth. Only `lite` and `deep` are exposed; other server-side depths
 * are out of scope for this extension.
 */
export type SearchDepth = "lite" | "deep";

/** Output format for extracted page content. */
export type ExtractFormat = "markdown" | "html";

/**
 * Mount-site configuration. Every field is optional so the extension also
 * works unmounted (tool re-exports, unit tests) and with a bare
 * `export default nimble({})` mount — the API key then comes from
 * `NIMBLE_API_KEY` at call time.
 */
export const nimbleConfigSchema = z.object({
  /** Nimble API key. Defaults to `process.env.NIMBLE_API_KEY` at call time. */
  apiKey: z.string().optional(),
  search: z
    .object({
      /** Search depth. Default `lite`. */
      depth: z.enum(["lite", "deep"]).optional(),
      /** Default number of results when the model doesn't specify. Default 5. */
      maxResults: z.number().int().positive().optional(),
      /** Hard upper bound on results, regardless of model request. Default 10. */
      maxResultsCap: z.number().int().positive().optional(),
      /** ISO country for result localization. Default `US`. */
      country: z.string().optional(),
      /** Locale for result localization. Default `en`. */
      locale: z.string().optional(),
      /** Truncate each result's body to this many characters. Default 10_000. */
      maxContentLength: z.number().int().positive().optional(),
    })
    .optional(),
  extract: z
    .object({
      /** Content format. Default `markdown`. */
      format: z.enum(["markdown", "html"]).optional(),
      /** ISO country for geolocation / proxy selection. */
      country: z.string().optional(),
      /** Truncate the extracted content to this many characters. Default 50_000. */
      maxContentLength: z.number().int().positive().optional(),
    })
    .optional(),
  agent: z
    .object({
      /** Status polling interval. Production values are at least 10 seconds. */
      pollIntervalMs: z.number().int().min(10_000).optional(),
      /** Bounded overall wait for a terminal run state. Default 420 seconds. */
      timeoutMs: z.number().int().positive().optional(),
    })
    .optional(),
});

export type NimbleEveConfig = z.infer<typeof nimbleConfigSchema>;

/** Search policy defaults. `focus` is fixed to `general` and not user-exposed. */
export const SEARCH_DEFAULTS = {
  maxResults: 5,
  maxResultsCap: 10,
  searchDepth: "lite",
  country: "US",
  locale: "en",
  maxContentLength: 10_000,
  focus: "general",
} as const;

/** Extract policy defaults. */
export const EXTRACT_DEFAULTS: { format: ExtractFormat; maxContentLength: number } = {
  format: "markdown",
  maxContentLength: 50_000,
};

export const AGENT_DEFAULTS = {
  pollIntervalMs: 10_000,
  timeoutMs: 420_000,
} as const;

// ── Structural client surface ──────────────────────────────────────────────
// Declared structurally (rather than importing the SDK's generated types) so
// the package typechecks against a stable shape and tests can inject a mock.

/** Per-request options forwarded to the SDK (abort wiring). */
export interface NimbleRequestOptions {
  signal?: AbortSignal;
  maxRetries?: number;
  timeout?: number;
}

/** Params this package sends to the SDK's `client.search()`. */
export interface NimbleSearchParams {
  query: string;
  max_results?: number;
  search_depth?: SearchDepth;
  focus?: string;
  country?: string;
  locale?: string;
}

/** Metadata for SERP-based results (general/news/location focus). */
export interface NimbleSerpMetadata {
  country: string;
  entity_type: string;
  locale: string;
  position: number;
  driver?: string | null;
}

/** Metadata for WSA-based results (shopping/social/geo focus). */
export interface NimbleWsaMetadata {
  agent_name: string;
}

export interface NimbleRawSearchResult {
  /** Full page text in `deep`; may be empty in `lite`. */
  content: string;
  description: string;
  title: string;
  url: string;
  /** SERP focus (v1 `general`) yields {@link NimbleSerpMetadata}. */
  metadata: NimbleSerpMetadata | NimbleWsaMetadata;
  /** Platform-specific extras (price, publish_date, …); omitted when none. */
  additional_data?: Record<string, unknown> | null;
}

export interface NimbleRawSearchResponse {
  request_id: string;
  results: NimbleRawSearchResult[];
  total_results: number;
  /** Intentionally never surfaced (include_answer is off). */
  answer?: string | null;
}

export interface NimbleSearchClient {
  search(
    params: NimbleSearchParams,
    options?: NimbleRequestOptions,
  ): Promise<NimbleRawSearchResponse>;
}

/** Params this package sends to the SDK's `client.extract()`. */
export interface NimbleExtractParams {
  url: string;
  country?: string;
  /** Which renderings to request; `data.<format>` is populated per entry. */
  formats?: Array<"html" | "markdown" | "links">;
  /** Refines Markdown extraction; `main_content` yields the cleaned article. */
  markdown_backend?: "full_page" | "main_content";
}

/** Structural surface of the SDK extract response data this package consumes. */
export interface NimbleRawExtractData {
  /** Markdown rendering of the page (default). */
  markdown?: string;
  /** Raw HTML of the page. */
  html?: string;
  /** Unique URLs found on the page. */
  links?: string[];
}

export interface NimbleRawExtractResponse {
  url: string;
  status: string;
  status_code?: number;
  task_id: string;
  data: NimbleRawExtractData;
  warnings?: string[];
}

export interface NimbleExtractClient {
  extract(
    params: NimbleExtractParams,
    options?: NimbleRequestOptions,
  ): Promise<NimbleRawExtractResponse>;
}

/** The full client surface the extension constructs (search + extract). */
export type NimbleClient = NimbleSearchClient & NimbleExtractClient;

export type NimbleAgentStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface NimbleAgentRunParams {
  input: string;
  agent_name?: string;
  effort?: "low" | "medium" | "high" | "x-high";
  enable_events?: boolean;
  input_data?: Record<string, unknown> | Array<Record<string, unknown>>;
  output_schema?: Record<string, unknown>;
  previous_interaction_id?: string;
  skill?: string;
  sources?: {
    allow?: Array<{ title: string; domains: string[]; order?: number }>;
    avoid?: string;
    block?: Array<{ title: string; domains: string[]; order?: number }>;
    prioritize?: string;
  };
  use_case?: "research" | "enrichment" | "dataset_building";
}

export interface NimbleAgentRunState {
  id: string;
  web_search_agent_id: string;
  interaction_id: string;
  /** Present on API responses; optional on a caller-supplied resume reference. */
  effort?: "low" | "medium" | "high" | "x-high" | "max";
  is_active: boolean;
  status: NimbleAgentStatus;
  error?: { message: string; ref_id: string } | null;
}

export interface NimbleAgentClient {
  agents: {
    run(
      params: NimbleAgentRunParams,
      options?: NimbleRequestOptions,
    ): Promise<NimbleAgentRunState>;
    runs: {
      get(
        runId: string,
        params: { agent_id: string },
        options?: NimbleRequestOptions,
      ): Promise<NimbleAgentRunState>;
      result(
        runId: string,
        params: { agent_id: string },
        options?: NimbleRequestOptions,
      ): Promise<unknown>;
    };
  };
}

export type NimbleFullClient = NimbleClient & NimbleAgentClient;

// ── Normalized outputs ─────────────────────────────────────────────────────

/** A single normalized result item returned to the model. */
export interface NimbleSearchResultItem {
  title: string;
  url: string;
  description?: string;
  content?: string;
  position?: number;
  entityType?: string;
}

/** The normalized search output. `answer` is intentionally omitted. */
export interface NimbleSearchOutput {
  query: string;
  requestId?: string;
  totalResults?: number;
  results: NimbleSearchResultItem[];
}

/** The normalized extract output returned to the model. */
export interface NimbleExtractOutput {
  /** The final URL (after redirects). */
  url: string;
  /** Task status reported by Nimble (e.g. `success`). */
  status: string;
  statusCode?: number;
  format: ExtractFormat;
  /** The extracted page content in the requested format, truncated. */
  content: string;
  /** Unique links found on the page, when available. */
  links?: string[];
}
