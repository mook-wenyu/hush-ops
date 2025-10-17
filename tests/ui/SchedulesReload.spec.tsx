import { describe, it, expect, vi } from 'vitest';
import { reloadSchedules } from '../../src/ui/services/schedules';

describe('reloadSchedules', () => {
  it('parses count', async () => {
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ reloaded: true, count: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const count = await reloadSchedules();
      expect(count).toBe(3);
    } finally {
      global.fetch = orig as any;
    }
  });
});
