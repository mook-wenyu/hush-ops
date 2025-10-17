import { requestJson } from "./core/http";

export interface ScheduleItem {
  planId: string;
  cron: string;
  file: string;
  dir: string;
  source: 'repo' | 'config';
  nextRunISO: string | null;
  lastRun: { executionId: string; status: string; startedAt?: string; finishedAt?: string } | null;
}

export async function fetchSchedules(): Promise<ScheduleItem[]> {
  const data = await requestJson<{ schedules?: ScheduleItem[] }>("GET", "/schedules");
  return data.schedules ?? [];
}

export async function reloadSchedules(): Promise<number> {
  const data = await requestJson<{ count: number }>("POST", "/schedules/reload");
  return data.count ?? 0;
}
