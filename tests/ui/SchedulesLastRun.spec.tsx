import { describe, it, expect, vi } from 'vitest';
import { fetchSchedules, type ScheduleItem } from '../../src/ui/services/schedules';

describe('Schedules lastRun parse', () => {
  it('parses lastRun when present', async () => {
    const sample: { schedules: ScheduleItem[] } = {
      schedules: [
        {
          planId: 'demo', cron: '* * * * *', file: 'demo.json', dir: 'plans', source: 'repo', nextRunISO: null,
          lastRun: { executionId: 'exec-1', status: 'success', startedAt: '2025-10-15T00:00:00.000Z', finishedAt: '2025-10-15T00:05:00.000Z' }
        }
      ]
    };
    const orig = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(sample), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;
    try {
      const list = await fetchSchedules();
      expect(list[0]).toBeTruthy();
      expect(list[0]!.lastRun?.status).toBe('success');
      expect(list[0]!.planId).toBe('demo');
    } finally {
      global.fetch = orig as any;
    }
  });
});
