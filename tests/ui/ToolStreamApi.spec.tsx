import { describe, it, expect, vi } from 'vitest';
import { fetchExecutionToolStreamChunks, replayExecutionToolStream } from '../../src/ui/services/tool-streams';

describe('Tool stream API (service smoke)', () => {
  it('fetchExecutionToolStreamChunks parses list', async () => {
    const sample = { chunks: [ { toolName: 'demo', message: 'ok', timestamp: 't', status: 'success', correlationId: 'c1' } ] };
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(sample), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const list = await fetchExecutionToolStreamChunks('exec-1','c1');
      expect(list.length).toBe(1);
      expect(list[0]).toBeTruthy();
      expect(list[0]!.toolName).toBe('demo');
    } finally {
      global.fetch = orig as any;
    }
  });

  it('replayExecutionToolStream parses count', async () => {
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ replayed: 2 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const n = await replayExecutionToolStream('exec-1','c1');
      expect(n).toBe(2);
    } finally {
      global.fetch = orig as any;
    }
  });
});
