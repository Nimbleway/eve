import { describe, it, expect } from 'vitest';
import { NimbleExtractError } from '../extension/lib/errors';
import { executeSearch } from '../extension/lib/search-core';
import { executeExtract } from '../extension/lib/extract-core';
import type { NimbleExtractClient, NimbleSearchClient } from '../extension/lib/schemas';

// Complements the ported errors parity suite: NimbleExtractError's constructor
// contract, and the cause-chain both cores promise when wrapping failures.

describe('NimbleExtractError', () => {
  it('carries an optional status and cause', () => {
    const cause = new Error('upstream 500');
    const err = new NimbleExtractError('extract failed', { status: 500, cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NimbleExtractError');
    expect(err.status).toBe(500);
    expect(err.cause).toBe(cause);
  });

  it('works without options', () => {
    const err = new NimbleExtractError('extract failed');
    expect(err.status).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });
});

describe('error wrapping preserves the original as cause', () => {
  it('executeSearch chains the thrown error', async () => {
    const original = Object.assign(new Error('boom'), { status: 502 });
    const failing: NimbleSearchClient = {
      search: async () => {
        throw original;
      },
    };
    const err = await executeSearch({ query: 'q' }, { config: {}, client: failing }).catch(
      (e: unknown) => e,
    );
    expect((err as Error).cause).toBe(original);
  });

  it('executeExtract chains the thrown error', async () => {
    const original = Object.assign(new Error('boom'), { status: 502 });
    const failing: NimbleExtractClient = {
      extract: async () => {
        throw original;
      },
    };
    const err = await executeExtract(
      { url: 'https://example.com' },
      { config: {}, client: failing },
    ).catch((e: unknown) => e);
    expect((err as Error).cause).toBe(original);
  });
});
