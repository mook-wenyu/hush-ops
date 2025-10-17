import { describe, it, expect, vi } from 'vitest';
import { fetchGlobalToolStreamSummaries, fetchGlobalToolStreamChunks, buildGlobalToolStreamExportUrl } from '../../src/ui/services/tool-streams';

describe('Global Tool Streams API', () => {
  it('fetchGlobalToolStreamSummaries parses paging payload', async () => {
    const sample = { total: 2, streams: [ { correlationId: 'c1', toolName: 't', chunkCount: 1, latestSequence: 0, updatedAt: 't', completed: true, hasError: false } ] };
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(sample), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const { total, streams } = await fetchGlobalToolStreamSummaries({ onlyErrors: false, limit: 10, offset: 0 });
      expect(total).toBe(2);
      expect(streams.length).toBe(1);
      expect(streams[0]?.correlationId).toBe('c1');
    } finally {
      global.fetch = orig as any;
    }
  });

  it('fetchGlobalToolStreamChunks returns chunks list', async () => {
    const sample = { chunks: [ { toolName: 'demo', message: 'ok', timestamp: 't', status: 'success', correlationId: 'c1' } ] };
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(sample), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const chunks = await fetchGlobalToolStreamChunks('c1');
      expect(chunks.length).toBe(1);
      expect(chunks[0]?.status).toBe('success');
    } finally {
      global.fetch = orig as any;
    }
  });

  it('buildGlobalToolStreamExportUrl returns a URL string', () => {
    const url = buildGlobalToolStreamExportUrl('c1', { format: 'json', compress: false });
    expect(typeof url).toBe('string');
    expect(url.includes('/tool-streams/')).toBe(true);
  });
});