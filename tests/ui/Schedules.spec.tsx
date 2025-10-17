import { describe, it, expect, vi } from 'vitest';
import { fetchSchedules } from '../../src/ui/services/schedules';

// 仅 smoke：验证服务函数存在且可被调用并解析空返回

describe('UI Schedules service', () => {
  it('fetchSchedules returns array or empty', async () => {
    // Mock fetch 返回空 schedules
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ schedules: [] }), { status: 200 })) as any;
    try {
      const list = await fetchSchedules();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(0);
    } finally {
      global.fetch = orig as any;
    }
  });
});
