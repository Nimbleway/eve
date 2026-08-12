import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeSearch } from '../extension/lib/search-core';
import { NimbleConfigError } from '../extension/lib/errors';
import { SEARCH_DEFAULTS } from '../extension/lib/schemas';
import type {
  NimbleEveConfig,
  NimbleRawSearchResponse,
  NimbleRequestOptions,
  NimbleSearchClient,
  NimbleSearchOutput,
  NimbleSearchParams,
} from '../extension/lib/schemas';
import { serpResult, searchResponse, mockNimbleClient } from './fixtures';

async function run(
  config: NimbleEveConfig,
  input: { query: string; maxResults?: number },
  client?: NimbleSearchClient,
): Promise<NimbleSearchOutput> {
  return executeSearch(input, { config, client });
}

describe('search defaults', () => {
  it('exposes the supported search defaults', () => {
    expect(SEARCH_DEFAULTS.searchDepth).toBe('lite');
    expect(SEARCH_DEFAULTS.focus).toBe('general');
    expect(SEARCH_DEFAULTS.maxResults).toBe(5);
    expect(SEARCH_DEFAULTS.maxResultsCap).toBe(10);
  });
});

describe('executeSearch — parameter mapping', () => {
  it('sends the v1-safe params (general focus, configured depth/region)', async () => {
    const { client, calls } = mockNimbleClient(searchResponse([serpResult()]));
    await run(
      { search: { depth: 'lite', country: 'US', locale: 'en' } },
      { query: 'nimble' },
      client,
    );

    expect(calls).toHaveLength(1);
    const params = calls[0]!;
    expect(params.query).toBe('nimble');
    expect(params.focus).toBe('general');
    expect(params.search_depth).toBe('lite');
    expect(params.country).toBe('US');
    expect(params.locale).toBe('en');
  });

  it('never sends include_answer or search_depth "fast"', async () => {
    const { client, calls } = mockNimbleClient(searchResponse([serpResult()]));
    await run({}, { query: 'q' }, client);
    const sent = calls[0] as NimbleSearchParams & { include_answer?: unknown };
    expect(sent.include_answer).toBeUndefined();
    expect(sent.search_depth).not.toBe('fast');
  });

  it('defaults max_results to the configured maxResults', async () => {
    const { client, calls } = mockNimbleClient(searchResponse([serpResult()]));
    await run({ search: { maxResults: 5 } }, { query: 'q' }, client);
    expect(calls[0]!.max_results).toBe(5);
  });

  it('clamps a model-requested maxResults to maxResultsCap', async () => {
    const { client, calls } = mockNimbleClient(searchResponse([serpResult()]));
    await run({ search: { maxResultsCap: 10 } }, { query: 'q', maxResults: 50 }, client);
    expect(calls[0]!.max_results).toBe(10);
  });

  it('lets the model lower maxResults below the default', async () => {
    const { client, calls } = mockNimbleClient(searchResponse([serpResult()]));
    await run({ search: { maxResults: 5 } }, { query: 'q', maxResults: 2 }, client);
    expect(calls[0]!.max_results).toBe(2);
  });
});

describe('executeSearch — abort signal', () => {
  function signalRecordingClient(response: NimbleRawSearchResponse): {
    client: NimbleSearchClient;
    received: Array<NimbleRequestOptions | undefined>;
  } {
    const received: Array<NimbleRequestOptions | undefined> = [];
    const client: NimbleSearchClient = {
      search: async (_params, options) => {
        received.push(options);
        return response;
      },
    };
    return { client, received };
  }

  it('forwards the abort signal to the client', async () => {
    const { client, received } = signalRecordingClient(searchResponse([serpResult()]));
    const controller = new AbortController();
    await executeSearch({ query: 'q' }, { config: {}, client, signal: controller.signal });
    expect(received[0]?.signal).toBe(controller.signal);
  });

  it('omits request options when no signal is given', async () => {
    const { client, received } = signalRecordingClient(searchResponse([serpResult()]));
    await executeSearch({ query: 'q' }, { config: {}, client });
    expect(received[0]).toBeUndefined();
  });
});

describe('executeSearch — output + errors', () => {
  it('returns normalized results', async () => {
    const { client } = mockNimbleClient(searchResponse([serpResult()]));
    const out = await run({}, { query: 'nimble' }, client);
    expect(out.query).toBe('nimble');
    expect(out.results[0]!.url).toBe('https://example.com/article');
    expect(out.results[0]!.position).toBe(1);
  });

  it('wraps a client/API failure in NimbleSearchError with the status', async () => {
    const failing: NimbleSearchClient = {
      search: async () => {
        throw Object.assign(new Error('rate limited'), { status: 429 });
      },
    };
    await expect(run({}, { query: 'q' }, failing)).rejects.toMatchObject({
      name: 'NimbleSearchError',
      status: 429,
    });
  });

  describe('missing key', () => {
    let saved: string | undefined;
    beforeEach(() => {
      saved = process.env.NIMBLE_API_KEY;
      delete process.env.NIMBLE_API_KEY;
    });
    afterEach(() => {
      if (saved !== undefined) process.env.NIMBLE_API_KEY = saved;
    });

    it('throws NimbleConfigError when no key and no client are available', async () => {
      await expect(run({}, { query: 'q' })).rejects.toBeInstanceOf(NimbleConfigError);
    });

    it('does not throw when a client is injected (no key needed)', async () => {
      const { client } = mockNimbleClient(searchResponse([serpResult()]));
      await expect(run({}, { query: 'q' }, client)).resolves.toBeTruthy();
    });
  });
});
