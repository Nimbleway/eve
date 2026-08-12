import { describe, expect, it, vi } from "vitest";
import { getEventListeners } from "node:events";

import { executeAgent } from "../extension/lib/agent-core";
import { NimbleAgentError } from "../extension/lib/errors";
import type {
  NimbleAgentClient,
  NimbleAgentRunParams,
  NimbleAgentRunState,
  NimbleRequestOptions,
} from "../extension/lib/schemas";

const baseRun: NimbleAgentRunState = {
  id: "task_run_test",
  web_search_agent_id: "agent_test",
  interaction_id: "interaction_test",
  effort: "high",
  is_active: true,
  status: "queued",
};

function mockAgentClient(states: NimbleAgentRunState[], result: unknown = { ok: true }) {
  const createCalls: Array<{
    params: NimbleAgentRunParams;
    options?: NimbleRequestOptions;
  }> = [];
  const getCalls: Array<{ runId: string; options?: NimbleRequestOptions }> = [];
  const resultCalls: Array<{ runId: string; options?: NimbleRequestOptions }> = [];
  const client: NimbleAgentClient = {
    agents: {
      run: async (params, options) => {
        createCalls.push({ params, options });
        return states[0]!;
      },
      runs: {
        get: async (runId, _params, options) => {
          getCalls.push({ runId, options });
          return states[Math.min(getCalls.length, states.length - 1)]!;
        },
        result: async (runId, _params, options) => {
          resultCalls.push({ runId, options });
          return result;
        },
      },
    },
  };
  return { client, createCalls, getCalls, resultCalls };
}

describe("executeAgent", () => {
  it("creates a minimal persistent agent, omits unspecified effort, disables create retries, and polls to result", async () => {
    const completed = { ...baseRun, is_active: false, status: "completed" as const };
    const { client, createCalls, getCalls } = mockAgentClient(
      [baseRun, { ...baseRun, status: "running" }, completed],
      { output: { type: "text", content: "grounded" } },
    );
    const sleep = vi.fn(async () => {});

    const result = await executeAgent(
      { input: "Research the current market" },
      { config: {}, client, pollIntervalMs: 0, sleep },
    );

    expect(createCalls).toEqual([
      {
        params: { input: "Research the current market" },
        options: { maxRetries: 0 },
      },
    ]);
    expect(getCalls.map(({ runId }) => runId)).toEqual(["task_run_test", "task_run_test"]);
    expect(getCalls[0]!.options?.timeout).toBeGreaterThan(0);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ output: { type: "text", content: "grounded" } });
  });

  it("forwards all typed 1.2 per-run controls when supplied", async () => {
    const completed = { ...baseRun, is_active: false, status: "completed" as const };
    const { client, createCalls } = mockAgentClient([completed]);

    await executeAgent(
      {
        input: "Enrich these companies",
        agentName: "company-enricher",
        effort: "medium",
        enableEvents: true,
        useCase: "enrichment",
        skill: "Prefer official company sources.",
        inputData: [{ company: "Acme" }],
        outputSchema: { type: "object" },
        previousInteractionId: "interaction_previous",
        sources: {
          allow: [
            {
              title: "Official company websites",
              domains: ["acme.example"],
              order: 0,
            },
          ],
          prioritize: "Official company websites",
        },
      },
      { config: {}, client },
    );

    expect(createCalls[0]!.params).toEqual({
      input: "Enrich these companies",
      agent_name: "company-enricher",
      effort: "medium",
      enable_events: true,
      use_case: "enrichment",
      skill: "Prefer official company sources.",
      input_data: [{ company: "Acme" }],
      output_schema: { type: "object" },
      previous_interaction_id: "interaction_previous",
      sources: {
        allow: [
          {
            title: "Official company websites",
            domains: ["acme.example"],
            order: 0,
          },
        ],
        prioritize: "Official company websites",
      },
    });
  });

  it("uses a configurable 10-second production polling default", async () => {
    const completed = { ...baseRun, is_active: false, status: "completed" as const };
    const { client } = mockAgentClient([baseRun, completed]);
    const sleep = vi.fn(async () => {});

    await executeAgent({ input: "Research" }, { config: {}, client, sleep });

    expect(sleep).toHaveBeenCalledWith(10_000, undefined);
  });

  it("fails closed on failed runs without retrying create", async () => {
    const failed: NimbleAgentRunState = {
      ...baseRun,
      is_active: false,
      status: "failed",
      error: { message: "backend rejected the run", ref_id: baseRun.id },
    };
    const { client, createCalls } = mockAgentClient([failed]);

    await expect(executeAgent({ input: "Research" }, { config: {}, client })).rejects.toThrow(
      NimbleAgentError,
    );
    expect(createCalls).toHaveLength(1);
  });

  it("enforces a bounded deadline", async () => {
    const { client, getCalls } = mockAgentClient([baseRun]);
    let now = 0;

    await expect(
      executeAgent(
        { input: "Research" },
        {
          config: { agent: { timeoutMs: 1 } },
          client,
          pollIntervalMs: 0,
          sleep: async () => {
            now = 2;
          },
          now: () => now,
        },
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("timed out"),
      runId: "task_run_test",
      agentId: "agent_test",
      interactionId: "interaction_test",
    });
    expect(getCalls).toHaveLength(0);
  });

  it("resumes a durable run without issuing another billable create", async () => {
    const completed = { ...baseRun, is_active: false, status: "completed" as const };
    const { client, createCalls, getCalls } = mockAgentClient([baseRun, completed]);

    const result = await executeAgent(
      { input: "Research" },
      { config: {}, client, resumeRun: baseRun, pollIntervalMs: 0, sleep: async () => {} },
    );

    expect(createCalls).toHaveLength(0);
    expect(getCalls.map(({ runId }) => runId)).toEqual(["task_run_test"]);
    expect(result).toEqual({ ok: true });
  });

  it("clamps sleep to the remaining deadline", async () => {
    const { client } = mockAgentClient([baseRun]);
    const sleep = vi.fn(async () => {});
    const times = [0, 75, 100];
    const now = () => times.shift() ?? 100;

    await expect(
      executeAgent(
        { input: "Research" },
        {
          config: { agent: { timeoutMs: 100 } },
          client,
          pollIntervalMs: 1_000,
          sleep,
          now,
        },
      ),
    ).rejects.toThrow("timed out");
    expect(sleep).toHaveBeenCalledWith(25, undefined);
  });

  it("bounds status and result requests by the remaining deadline", async () => {
    const completed = { ...baseRun, is_active: false, status: "completed" as const };
    const { client, getCalls, resultCalls } = mockAgentClient([baseRun, completed]);
    const times = [0, 20, 30, 40];

    await executeAgent(
      { input: "Research" },
      {
        config: { agent: { timeoutMs: 100 } },
        client,
        pollIntervalMs: 0,
        sleep: async () => {},
        now: () => times.shift() ?? 40,
      },
    );

    expect(getCalls[0]!.options).toMatchObject({ timeout: 70 });
    expect(resultCalls[0]!.options).toMatchObject({ timeout: 60 });
  });

  it("removes the abort listener after a successful polling delay", async () => {
    const completed = { ...baseRun, is_active: false, status: "completed" as const };
    const { client } = mockAgentClient([baseRun, completed]);
    const controller = new AbortController();

    await executeAgent(
      { input: "Research" },
      { config: {}, client, pollIntervalMs: 0, signal: controller.signal },
    );

    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("retains recovery identifiers when polling is cancelled", async () => {
    const { client } = mockAgentClient([baseRun]);

    await expect(
      executeAgent(
        { input: "Research" },
        {
          config: {},
          client,
          pollIntervalMs: 0,
          sleep: async () => {
            throw new Error("cancelled");
          },
        },
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("run task_run_test, agent agent_test"),
      runId: "task_run_test",
      agentId: "agent_test",
      interactionId: "interaction_test",
    });
  });
});
