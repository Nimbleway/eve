import { describe, it, expect } from 'vitest';
import search from '../extension/tools/search';
import extract from '../extension/tools/extract';
import agentStart from '../extension/tools/agent_start';
import agentResult from '../extension/tools/agent_result';
import extension from '../extension/extension';
import {
  nimbleAgentInputSchema,
  nimbleAgentResultInputSchema,
  nimbleSearchInputSchema,
  nimbleExtractInputSchema,
} from '../extension/lib/schemas';

/** eve marks defineTool results with this well-known brand symbol. */
const TOOL_BRAND = Symbol.for('eve:tool-brand');

function brandOf(tool: unknown): unknown {
  return (tool as Record<symbol, unknown>)[TOOL_BRAND];
}

describe('tool shape (eve contract)', () => {
  it('tools are eve-branded defineTool results (raw objects are rejected by eve)', () => {
    expect(brandOf(search)).toBe(true);
    expect(brandOf(extract)).toBe(true);
    expect(brandOf(agentStart)).toBe(true);
    expect(brandOf(agentResult)).toBe(true);
  });

  it('descriptions are distinct — eve keys tool identity off the description', () => {
    expect(search.description).toBeTruthy();
    expect(extract.description).toBeTruthy();
    expect(search.description).not.toBe(extract.description);
    expect(agentStart.description).not.toBe(search.description);
    expect(agentStart.description).not.toBe(extract.description);
    expect(agentResult.description).not.toBe(agentStart.description);
  });

  it('input schemas implement Standard Schema (what eve consumes)', () => {
    const std = (schema: unknown): unknown =>
      (schema as Record<string, unknown>)['~standard'];
    expect(std(nimbleSearchInputSchema)).toBeDefined();
    expect(std(nimbleExtractInputSchema)).toBeDefined();
    expect(std(nimbleAgentInputSchema)).toBeDefined();
    expect(std(nimbleAgentResultInputSchema)).toBeDefined();
  });

  it('tools expose an execute function', () => {
    expect(typeof search.execute).toBe('function');
    expect(typeof extract.execute).toBe('function');
    expect(typeof agentStart.execute).toBe('function');
    expect(typeof agentResult.execute).toBe('function');
  });
});

describe('extension config (unmounted path)', () => {
  it('validates to {} when unmounted — every field is optional, so tool re-exports and tests work without a mount', () => {
    expect(extension.config).toEqual({});
  });
});
