import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeExtract } from '../extension/lib/extract-core';
import { NimbleConfigError } from '../extension/lib/errors';
import { EXTRACT_DEFAULTS, nimbleExtractInputSchema } from '../extension/lib/schemas';
import type {
  NimbleEveConfig,
  NimbleExtractClient,
  NimbleExtractOutput,
  NimbleRequestOptions,
} from '../extension/lib/schemas';
import { extractResponse, mockNimbleExtractClient } from './fixtures';

async function run(
  config: NimbleEveConfig,
  input: { url: string },
  client?: NimbleExtractClient,
): Promise<NimbleExtractOutput> {
  return executeExtract(input, { config, client });
}

const URL = 'https://example.com/article';

describe('extract defaults', () => {
  it('exposes defaults', () => {
    expect(EXTRACT_DEFAULTS.format).toBe('markdown');
    expect(EXTRACT_DEFAULTS.maxContentLength).toBe(50_000);
  });
});

describe('executeExtract — parameter mapping', () => {
  it('sends the url and configured country', async () => {
    const { client, calls } = mockNimbleExtractClient(extractResponse());
    await run({ extract: { country: 'US' } }, { url: URL }, client);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL);
    expect(calls[0]!.country).toBe('US');
  });

  it('omits country when not configured', async () => {
    const { client, calls } = mockNimbleExtractClient(extractResponse());
    await run({}, { url: URL }, client);
    expect(calls[0]!.country).toBeUndefined();
  });

  it('requests both renderings (markdown preferred) plus links so the fallback is real', async () => {
    const { client, calls } = mockNimbleExtractClient(extractResponse());
    await run({}, { url: URL }, client);
    expect(calls[0]!.formats).toEqual(['markdown', 'html', 'links']);
  });

  it('requests html first when format is html', async () => {
    const { client, calls } = mockNimbleExtractClient(extractResponse());
    await run({ extract: { format: 'html' } }, { url: URL }, client);
    expect(calls[0]!.formats).toEqual(['html', 'markdown', 'links']);
  });
});

describe('executeExtract — abort signal', () => {
  it('forwards the abort signal to the client', async () => {
    const received: Array<NimbleRequestOptions | undefined> = [];
    const client: NimbleExtractClient = {
      extract: async (_params, options) => {
        received.push(options);
        return extractResponse();
      },
    };
    const controller = new AbortController();
    await executeExtract({ url: URL }, { config: {}, client, signal: controller.signal });
    expect(received[0]?.signal).toBe(controller.signal);
  });
});

describe('executeExtract — output', () => {
  it('returns markdown content by default', async () => {
    const { client } = mockNimbleExtractClient(extractResponse());
    const out = await run({}, { url: URL }, client);
    expect(out.format).toBe('markdown');
    expect(out.content).toContain('# Example Article');
    expect(out.url).toBe(URL);
    expect(out.status).toBe('success');
    expect(out.statusCode).toBe(200);
    expect(out.links).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('returns html content when format is html', async () => {
    const { client } = mockNimbleExtractClient(extractResponse());
    const out = await run({ extract: { format: 'html' } }, { url: URL }, client);
    expect(out.format).toBe('html');
    expect(out.content).toContain('<h1>Example Article</h1>');
  });

  it('falls back to the other format when the requested one is empty, and reports the format used', async () => {
    const { client } = mockNimbleExtractClient(
      extractResponse({ data: { markdown: '', html: '<p>only html</p>' } }),
    );
    const out = await run({ extract: { format: 'markdown' } }, { url: URL }, client);
    expect(out.content).toBe('<p>only html</p>');
    expect(out.format).toBe('html');
  });

  it('truncates content to maxContentLength', async () => {
    const big = '#'.repeat(100_000);
    const { client } = mockNimbleExtractClient(extractResponse({ data: { markdown: big } }));
    const out = await run({ extract: { maxContentLength: 1_000 } }, { url: URL }, client);
    expect(out.content).toHaveLength(1_000);
  });

  it('omits links when none are returned', async () => {
    const { client } = mockNimbleExtractClient(
      extractResponse({ data: { markdown: 'body', links: [] } }),
    );
    const out = await run({}, { url: URL }, client);
    expect(out.links).toBeUndefined();
  });
});

describe('extract input schema', () => {
  it('accepts http and https URLs', () => {
    expect(nimbleExtractInputSchema.safeParse({ url: 'https://example.com/a' }).success).toBe(true);
    expect(nimbleExtractInputSchema.safeParse({ url: 'http://example.com/a' }).success).toBe(true);
  });

  it('rejects non-web schemes', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'ftp://h/f']) {
      expect(nimbleExtractInputSchema.safeParse({ url }).success).toBe(false);
    }
  });
});

describe('executeExtract — errors', () => {
  it('wraps a client/API failure in NimbleExtractError with the status', async () => {
    const failing: NimbleExtractClient = {
      extract: async () => {
        throw Object.assign(new Error('forbidden'), { status: 403 });
      },
    };
    await expect(run({}, { url: URL }, failing)).rejects.toMatchObject({
      name: 'NimbleExtractError',
      status: 403,
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
      await expect(run({}, { url: URL })).rejects.toBeInstanceOf(NimbleConfigError);
    });

    it('does not throw when a client is injected', async () => {
      const { client } = mockNimbleExtractClient(extractResponse());
      await expect(run({}, { url: URL }, client)).resolves.toBeTruthy();
    });
  });
});
