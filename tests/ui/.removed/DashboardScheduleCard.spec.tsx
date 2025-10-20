import { describe, it, expect, vi } from 'vitest';
import { fetchSchedules } from '../../src/ui/services/schedules';

describe('Dashboard schedule summary (service smoke)', () => {
  it('fetchSchedules returns list for summary', async () => {
    const payload = { schedules: [{ planId: 'p', cron: '* * * * *', file: 'p.json', dir: 'plans', source: 'repo', nextRunISO: null, lastRun: null }] };
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const list = await fetchSchedules();
      expect(list.length).toBe(1);
      expect(list[0]).toBeTruthy();
      expect(list[0]!.source).toBe('repo');
    } finally {
      global.fetch = orig as any;
    }
  });
});
