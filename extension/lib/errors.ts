/**
 * Thrown when a tool is invoked without a resolvable API key (no `apiKey` in
 * the mount config and no `NIMBLE_API_KEY` in the environment) and no injected
 * client. Raised at execute time, not at mount time, so the extension can be
 * mounted, built, and inspected (`eve info`) in environments without a key.
 */
export class NimbleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NimbleConfigError";
  }
}

/**
 * Wraps an error surfaced by the Nimble client / API during a search call,
 * preserving the HTTP status when available. eve surfaces a thrown tool error
 * back to the model as a tool-call failure.
 */
export class NimbleSearchError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "NimbleSearchError";
    this.status = options?.status;
  }
}

/**
 * Wraps an error surfaced by the Nimble client / API during an extract call,
 * preserving the HTTP status when available.
 */
export class NimbleExtractError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "NimbleExtractError";
    this.status = options?.status;
  }
}

/**
 * Wraps an Agent API V2 create, status, or result failure. Create requests are
 * never retried by this integration because they are billable and
 * non-idempotent.
 */
export class NimbleAgentError extends Error {
  readonly status?: number;
  readonly runId?: string;
  readonly agentId?: string;
  readonly interactionId?: string;

  constructor(
    message: string,
    options?: {
      status?: number;
      cause?: unknown;
      runId?: string;
      agentId?: string;
      interactionId?: string;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "NimbleAgentError";
    this.status = options?.status;
    this.runId = options?.runId;
    this.agentId = options?.agentId;
    this.interactionId = options?.interactionId;
  }
}
