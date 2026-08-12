import { describe, it, expect } from 'vitest';
import { normalizeSearchResponse, normalizeExtractResponse } from '../extension/lib/normalize';
import { serpResult, wsaResult, searchResponse, extractResponse } from './fixtures';

describe('normalizeSearchResponse', () => {
  it('maps the basic fields and SERP metadata', () => {
    const out = normalizeSearchResponse(
      searchResponse([serpResult()], { request_id: 'req-1', total_results: 7 }),
      { query: 'nimble release notes', maxContentLength: 10_000 },
    );
    expect(out.query).toBe('nimble release notes');
    expect(out.requestId).toBe('req-1');
    expect(out.totalResults).toBe(7);
    expect(out.results).toHaveLength(1);
    const r = out.results[0]!;
    expect(r.title).toBe('Example Result');
    expect(r.url).toBe('https://example.com/article');
    expect(r.description).toBe('A short snippet about the topic.');
    expect(r.position).toBe(1);
    expect(r.entityType).toBe('OrganicResult');
  });

  it('lite depth: no content field (content is empty), description carries the snippet', () => {
    const out = normalizeSearchResponse(searchResponse([serpResult({ content: '' })]), {
      query: 'q',
      maxContentLength: 10_000,
    });
    expect(out.results[0]!.content).toBeUndefined();
    expect(out.results[0]!.description).toBe('A short snippet about the topic.');
  });

  it('deep depth: surfaces content, truncated to maxContentLength', () => {
    const longBody = 'x'.repeat(50_000);
    const out = normalizeSearchResponse(searchResponse([serpResult({ content: longBody })]), {
      query: 'q',
      maxContentLength: 1_000,
    });
    expect(out.results[0]!.content).toHaveLength(1_000);
  });

  it('WSA metadata: position falls back to index, entityType omitted', () => {
    const out = normalizeSearchResponse(searchResponse([wsaResult(), wsaResult()]), {
      query: 'q',
      maxContentLength: 10_000,
    });
    expect(out.results[0]!.position).toBe(1);
    expect(out.results[1]!.position).toBe(2);
    expect(out.results[0]!.entityType).toBeUndefined();
  });

  it('drops results without a URL', () => {
    const out = normalizeSearchResponse(
      searchResponse([serpResult(), serpResult({ url: '' })]),
      { query: 'q', maxContentLength: 10_000 },
    );
    expect(out.results).toHaveLength(1);
  });

  it('never surfaces the answer field', () => {
    const out = normalizeSearchResponse(
      searchResponse([serpResult()], { answer: 'LEAK: should not appear' }),
      { query: 'q', maxContentLength: 10_000 },
    );
    expect(JSON.stringify(out)).not.toContain('LEAK');
  });

  it('handles an empty result set', () => {
    const out = normalizeSearchResponse(searchResponse([]), { query: 'q', maxContentLength: 100 });
    expect(out.results).toEqual([]);
    expect(out.totalResults).toBe(0);
  });
});

// NOTE: the blank-fallback, trim-before-truncate, and surrogate-safe truncate
// behaviors below are an intentional divergence from @nimble-way/ai-sdk's ported
// core (which still has these bugs). Tracked in the workspace sdk-feedback log to
// fix in ai-sdk 0.2.2; do not "restore parity" by reverting these during the
// planned v0.2.x dependency migration.
describe('normalizeExtractResponse — blank-rendering fallback', () => {
  it('falls back when the requested rendering is present but blank, not just empty', () => {
    const out = normalizeExtractResponse(
      extractResponse({ data: { markdown: '\n  \n', html: '<p>the real article</p>' } }),
      { format: 'markdown', maxContentLength: 10_000 },
    );
    expect(out.format).toBe('html');
    expect(out.content).toBe('<p>the real article</p>');
  });

  it('reports the requested format when neither rendering has content', () => {
    const out = normalizeExtractResponse(
      extractResponse({ data: { markdown: '  ', html: '' } }),
      { format: 'markdown', maxContentLength: 10_000 },
    );
    expect(out.format).toBe('markdown');
    expect(out.content).toBe('');
  });

  it('trims a padded-but-real rendering so the cap does not slice away the body', () => {
    const out = normalizeExtractResponse(
      extractResponse({ data: { markdown: '        Body text        ' } }),
      { format: 'markdown', maxContentLength: 8 },
    );
    // Without the trim, truncate(cap=8) would return 8 leading spaces.
    expect(out.content).toBe('Body tex');
  });
});

describe('truncate boundary', () => {
  it('does not end a truncated string on a split surrogate pair', () => {
    const out = normalizeExtractResponse(
      extractResponse({ data: { markdown: 'a'.repeat(9) + '🎉tail' } }),
      { format: 'markdown', maxContentLength: 10 },
    );
    // The emoji straddles the cut, so it is dropped rather than half-emitted.
    expect(out.content).toBe('a'.repeat(9));
    expect(out.content.charCodeAt(out.content.length - 1)).toBeLessThan(0xd800);
  });
});

describe('normalizeExtractResponse', () => {
  it('reports the requested format when it is populated', () => {
    const out = normalizeExtractResponse(extractResponse(), {
      format: 'markdown',
      maxContentLength: 10_000,
    });
    expect(out.format).toBe('markdown');
    expect(out.content).toContain('# Example Article');
    expect(out.links).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('reports the fallback format when the requested rendering is empty', () => {
    const out = normalizeExtractResponse(
      extractResponse({ data: { markdown: '', html: '<p>only html</p>' } }),
      { format: 'markdown', maxContentLength: 10_000 },
    );
    expect(out.content).toBe('<p>only html</p>');
    expect(out.format).toBe('html');
  });

  it('returns empty content without throwing on a non-success status', () => {
    const out = normalizeExtractResponse(
      extractResponse({ status: 'error', status_code: 404, data: { markdown: '', html: '' } }),
      { format: 'markdown', maxContentLength: 10_000 },
    );
    expect(out.status).toBe('error');
    expect(out.statusCode).toBe(404);
    expect(out.content).toBe('');
  });
});
