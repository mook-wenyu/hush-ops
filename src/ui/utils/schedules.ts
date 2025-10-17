import type { ScheduleItem } from '../services/schedules';

export type SourceFilter = 'all' | 'repo' | 'config';
export type SortMode = 'nextAsc' | 'nextDesc';

export function filterAndSortSchedules(
  items: ScheduleItem[],
  source: SourceFilter,
  search: string,
  sort: SortMode,
  withinMinutes?: number | null
): ScheduleItem[] {
  const kw = (search ?? '').trim().toLowerCase();
  const now = Date.now();
  const windowMs = withinMinutes && withinMinutes > 0 ? withinMinutes * 60_000 : null;
  const filtered = items.filter(it => {
    if (source !== 'all' && it.source !== source) return false;
    if (windowMs) {
      const t = it.nextRunISO ? new Date(it.nextRunISO).getTime() : null;
      if (!t || t - now > windowMs || t < now) return false;
    }
    if (!kw) return true;
    return (
      it.planId.toLowerCase().includes(kw) ||
      it.file.toLowerCase().includes(kw)
    );
  });
  const score = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);
  const sorted = filtered.sort((a,b)=>{
    const va = score(a.nextRunISO);
    const vb = score(b.nextRunISO);
    return sort === 'nextAsc' ? va - vb : vb - va;
  });
  return [...sorted];
}
