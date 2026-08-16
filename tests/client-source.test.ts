import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// resolveClient identifies this integration to Nimble via the `clientSource`
// constructor option, which the SDK sends as the `X-Client-Source` header on
// every request. Mock the SDK so the constructor args are inspectable without
// depending on its internal header-building logic.

const constructorCalls: Array<Record<string, unknown>> = [];

vi.mock('@nimble-way/nimble-js', () => {
  class MockNimble {
    search = vi.fn();
    extract = { run: vi.fn() };
    agents = {};
    constructor(opts: Record<string, unknown>) {
      constructorCalls.push(opts);
    }
  }
  return { Nimble: MockNimble };
});

const { resolveClient } = await import('../extension/lib/client');

let saved: string | undefined;
beforeEach(() => {
  constructorCalls.length = 0;
  saved = process.env.NIMBLE_API_KEY;
});
afterEach(() => {
  if (saved !== undefined) process.env.NIMBLE_API_KEY = saved;
  else delete process.env.NIMBLE_API_KEY;
});

describe('resolveClient client source', () => {
  it('identifies this integration to Nimble as "vercel-eve"', () => {
    process.env.NIMBLE_API_KEY = 'client-source-key';
    resolveClient({});
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toMatchObject({ clientSource: 'vercel-eve' });
  });
});
