import type { ExecutionRecord } from "../types/orchestrator.js";
import { requestJson } from "./core/http.js";

export async function fetchExecutions(signal?: AbortSignal): Promise<ExecutionRecord[]> {
  const opts = signal ? { signal } : undefined;
  const payload = await requestJson<{ executions: ExecutionRecord[] }>("GET", "/executions", opts);
  return payload.executions;
}

export async function fetchExecutionById(id: string): Promise<ExecutionRecord> {
  return await requestJson<ExecutionRecord>("GET", `/executions/${encodeURIComponent(id)}`);
}

export async function fetchExecutionHistory(params?: { planId?: string; limit?: number; offset?: number }, signal?: AbortSignal): Promise<{ total: number; executions: ExecutionRecord[] }> {
  const q = new URLSearchParams();
  if (params?.planId) q.set('planId', params.planId);
  if (typeof params?.limit === 'number') q.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') q.set('offset', String(params.offset));
  const path = `/executions/history${q.toString() ? `?${q.toString()}` : ''}`;
  const opts = signal ? { signal } : undefined;
  return await requestJson<{ total: number; executions: ExecutionRecord[] }>("GET", path, opts);
}

export function buildExecutionsExportUrl(format: 'json' | 'ndjson' = 'json', opts?: { compress?: boolean; planId?: string }): string {
  const q = new URLSearchParams();
  q.set('format', format);
  if (opts?.compress) q.set('compress', '1');
  if (opts?.planId) q.set('planId', opts.planId);
  return `/executions/export?${q.toString()}`;
}

export async function stopExecution(id: string): Promise<void> {
  await requestJson<void>("POST", `/executions/${encodeURIComponent(id)}/stop`);
}
