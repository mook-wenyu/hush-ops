import { describe, it, expect, vi } from 'vitest';
import { fetchExecutionById } from '../../src/ui/services/executions';

describe('fetchExecutionById', () => {
  it('parses execution record', async () => {
    const payload = { id: 'exec-1', planId: 'demo', createdAt: '2025-10-15T00:00:00.000Z', executorType: 'mock', status: 'running', bridgeStates: [], pendingApprovals: [] };
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const rec = await fetchExecutionById('exec-1');
      expect(rec.id).toBe('exec-1');
      expect(rec.status).toBe('running');
    } finally {
      global.fetch = orig as any;
    }
  });
});
