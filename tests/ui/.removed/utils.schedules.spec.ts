import { describe, it, expect } from 'vitest';
import { filterAndSortSchedules } from '../../../src/ui/utils/schedules';

const items = [
  { planId: 'a', cron: '* * * * *', file: 'a.json', dir: 'plans', source: 'repo', nextRunISO: '2025-10-15T00:05:00.000Z', lastRun: null },
  { planId: 'b', cron: '* * * * *', file: 'b.json', dir: 'plans', source: 'config', nextRunISO: null, lastRun: null },
  { planId: 'c', cron: '* * * * *', file: 'c.json', dir: 'plans', source: 'repo', nextRunISO: '2025-10-15T00:01:00.000Z', lastRun: null },
] as any;

describe('filterAndSortSchedules', () => {
  it('filters by source and sorts by nextRun asc', () => {
    const out = filterAndSortSchedules(items, 'repo', '', 'nextAsc');
    expect(out.map(o=>o.planId)).toEqual(['c','a']);
    expect(out[0]).toBeTruthy();
  });
  it('searches by planId/file', () => {
    const out = filterAndSortSchedules(items, 'all', 'b.json', 'nextAsc');
    expect(out.length).toBe(1);
    expect(out[0]).toBeTruthy();
    expect(out[0]!.planId).toBe('b');
  });
  it('treats null nextRun as Infinity', () => {
    const out = filterAndSortSchedules(items, 'all', '', 'nextAsc');
    expect(out.at(-1)?.planId).toBe('b');
  });
});
