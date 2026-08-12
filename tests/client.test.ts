import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveClient } from '../extension/lib/client';
import { NimbleConfigError } from '../extension/lib/errors';

// resolveClient constructs a real Nimble SDK client (no network happens at
// construction time). The cache is a single entry for the most recently
// resolved key: same key → same instance; a different key → rebuild.

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.NIMBLE_API_KEY;
});
afterEach(() => {
  if (saved !== undefined) process.env.NIMBLE_API_KEY = saved;
  else delete process.env.NIMBLE_API_KEY;
});

describe('resolveClient', () => {
  it('falls back to NIMBLE_API_KEY from the environment', () => {
    process.env.NIMBLE_API_KEY = 'env-key-a';
    const client = resolveClient({});
    expect(client).toBeTruthy();
    expect(typeof client.search).toBe('function');
    expect(typeof client.extract).toBe('function');
  });

  it('memoizes: same key returns the same client instance', () => {
    process.env.NIMBLE_API_KEY = 'env-key-b';
    const first = resolveClient({});
    const second = resolveClient({});
    expect(second).toBe(first);
  });

  it('rebuilds when the key rotates', () => {
    process.env.NIMBLE_API_KEY = 'env-key-c1';
    const first = resolveClient({});
    process.env.NIMBLE_API_KEY = 'env-key-c2';
    const second = resolveClient({});
    expect(second).not.toBe(first);
  });

  it('config.apiKey wins over the environment', () => {
    process.env.NIMBLE_API_KEY = 'env-key-d';
    const envClient = resolveClient({});
    const configClient = resolveClient({ apiKey: 'config-key-d' });
    expect(configClient).not.toBe(envClient);
  });

  it('is single-entry: re-resolving an earlier key rebuilds (no multi-key retention)', () => {
    process.env.NIMBLE_API_KEY = 'env-key-e1';
    const first = resolveClient({});
    process.env.NIMBLE_API_KEY = 'env-key-e2';
    resolveClient({});
    process.env.NIMBLE_API_KEY = 'env-key-e1';
    const firstAgain = resolveClient({});
    // A single-entry cache evicts e1 when e2 is resolved, so e1 rebuilds.
    // (A multi-key map would return the original `first` instance here.)
    expect(firstAgain).not.toBe(first);
  });

  it('throws NimbleConfigError when no key is available anywhere', () => {
    delete process.env.NIMBLE_API_KEY;
    expect(() => resolveClient({})).toThrow(NimbleConfigError);
  });
});
