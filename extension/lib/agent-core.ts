import { resolveClient } from "./client";
import { NimbleAgentError } from "./errors";
import { AGENT_DEFAULTS } from "./schemas";
import type {
  NimbleAgentClient,
  NimbleAgentInput,
  NimbleAgentRunParams,
  NimbleAgentRunState,
  NimbleEveConfig,
} from "./schemas";

export interface AgentCoreOptions {
  config: NimbleEveConfig;
  client?: NimbleAgentClient;
  signal?: AbortSignal;
  /** Test-only override for avoiding wall-clock waits. */
  pollIntervalMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  /** Resume a previously-created billable run without creating another one. */
  resumeRun?: NimbleAgentRunState;
}

function readStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function identifiers(run: NimbleAgentRunState) {
  return {
    runId: run.id,
    agentId: run.web_search_agent_id,
    interactionId: run.interaction_id,
  };
}

function toAgentError(err: unknown, run?: NimbleAgentRunState): NimbleAgentError {
  if (err instanceof NimbleAgentError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const recovery = run
    ? ` (run ${run.id}, agent ${run.web_search_agent_id}, interaction ${run.interaction_id})`
    : "";
  return new NimbleAgentError(`Nimble agent run failed: ${message}${recovery}`, {
    status: readStatus(err),
    cause: err,
    ...(run ? identifiers(run) : {}),
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function terminalError(run: NimbleAgentRunState): NimbleAgentError {
  const detail = run.error?.message ? `: ${run.error.message}` : "";
  return new NimbleAgentError(
    `Nimble agent run ${run.status}${detail} (run ${run.id}, agent ${run.web_search_agent_id}, interaction ${run.interaction_id})`,
    identifiers(run),
  );
}

export async function createAgentRun(
  input: NimbleAgentInput,
  options: AgentCoreOptions,
): Promise<NimbleAgentRunState> {
  const client = options.client ?? resolveClient(options.config);
  const params: NimbleAgentRunParams = {
    input: input.input,
    ...(input.agentName ? { agent_name: input.agentName } : {}),
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.enableEvents !== undefined ? { enable_events: input.enableEvents } : {}),
    ...(input.inputData ? { input_data: input.inputData } : {}),
    ...(input.outputSchema ? { output_schema: input.outputSchema } : {}),
    ...(input.previousInteractionId
      ? { previous_interaction_id: input.previousInteractionId }
      : {}),
    ...(input.skill ? { skill: input.skill } : {}),
    ...(input.sources ? { sources: input.sources } : {}),
    ...(input.useCase ? { use_case: input.useCase } : {}),
  };

  try {
    return await client.agents.run(params, {
      maxRetries: 0,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (err) {
    throw toAgentError(err);
  }
}

export async function awaitAgentRun(
  initialRun: NimbleAgentRunState,
  options: AgentCoreOptions,
): Promise<unknown> {
  const { config, signal } = options;
  const client = options.client ?? resolveClient(config);
  const interval =
    options.pollIntervalMs ?? config.agent?.pollIntervalMs ?? AGENT_DEFAULTS.pollIntervalMs;
  const timeout = config.agent?.timeoutMs ?? AGENT_DEFAULTS.timeoutMs;
  const sleep = options.sleep ?? delay;
  const now = options.now ?? Date.now;
  const deadline = now() + timeout;
  let run = initialRun;

  try {
    while (run.status === "queued" || run.status === "running") {
      const remaining = deadline - now();
      if (remaining <= 0) {
        throw new NimbleAgentError(
          `Nimble agent run timed out after ${timeout}ms (run ${run.id}, agent ${run.web_search_agent_id})`,
          identifiers(run),
        );
      }
      await sleep(Math.min(interval, remaining), signal);
      const requestBudget = deadline - now();
      if (requestBudget <= 0) {
        throw new NimbleAgentError(
          `Nimble agent run timed out after ${timeout}ms (run ${run.id}, agent ${run.web_search_agent_id})`,
          identifiers(run),
        );
      }
      run = await client.agents.runs.get(
        run.id,
        { agent_id: run.web_search_agent_id },
        { timeout: requestBudget, ...(signal ? { signal } : {}) },
      );
    }

    if (run.status !== "completed") throw terminalError(run);

    const resultBudget = deadline - now();
    if (resultBudget <= 0) {
      throw new NimbleAgentError(
        `Nimble agent run timed out after ${timeout}ms before result retrieval (run ${run.id}, agent ${run.web_search_agent_id})`,
        identifiers(run),
      );
    }

    return await client.agents.runs.result(
      run.id,
      { agent_id: run.web_search_agent_id },
      { timeout: resultBudget, ...(signal ? { signal } : {}) },
    );
  } catch (err) {
    throw toAgentError(err, run);
  }
}

/**
 * Start one Agent API V2 run, wait for a terminal state, and return the
 * citation/trust-bearing result. The billable create uses `maxRetries: 0`.
 */
export async function executeAgent(
  input: NimbleAgentInput,
  options: AgentCoreOptions,
): Promise<unknown> {
  const run = options.resumeRun ?? (await createAgentRun(input, options));
  return awaitAgentRun(run, options);
}
