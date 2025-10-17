import { describe, it, expect, vi } from 'vitest';
import { executePlanById } from '../../src/ui/services/plans';

// smoke：验证按 ID 触发执行的服务函数

describe('UI executePlanById service', () => {
  it('parses success payload', async () => {
    const payload = { executionId: 'exec-1', status: 'pending', planId: 'demo' };
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const res = await executePlanById('demo');
      expect(res.executionId).toBe('exec-1');
      expect(res.planId).toBe('demo');
    } finally {
      global.fetch = orig as any;
    }
  });
});
