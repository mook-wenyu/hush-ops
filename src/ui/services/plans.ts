import type { PlanJson } from "../components/graph/PlanCanvas";
import { getBaseUrl, requestJson } from "./core/http";

export interface PlanSummary { id: string; description?: string; version?: string }

export async function fetchPlans(): Promise<PlanSummary[]> {
  const payload = await requestJson<{ plans?: PlanSummary[] }>("GET", "/plans", {
    // 在后端短暂重启/冷启动时提高容错：对 50x/网关类错误做少量重试
    retry: { maxRetries: 2, baseDelayMs: 600, retriableStatuses: [502, 503, 504] }
  });
  return payload.plans ?? [];
}

export async function fetchPlanById(planId: string): Promise<PlanJson | null> {
  try {
    const res = await requestJson<PlanJson>("GET", `/plans/${encodeURIComponent(planId)}`);
    return res;
  } catch {
    return null;
  }
}

export async function createPlan(plan: unknown): Promise<{ id: string }> {
  return await requestJson<{ id: string }>("POST", "/plans", { body: { plan } });
}

export async function updatePlan(planId: string, plan: unknown): Promise<void> {
  await requestJson<void>("PUT", `/plans/${encodeURIComponent(planId)}`, { body: { plan } });
}

export async function deletePlan(planId: string): Promise<void> {
  await requestJson<void>("DELETE", `/plans/${encodeURIComponent(planId)}`);
}

export async function uploadPlanFiles(files: File[]): Promise<{ imported: number; ids: string[] } | null> {
  const base = getBaseUrl();
  const fd = new FormData();
  for (const f of files) fd.append("file", f);
  const res = await fetch(`${base}/plans/upload`, { method: "POST", body: fd as any });
  if (!res.ok) return null;
  return (await res.json()) as { imported: number; ids: string[] };
}

export async function fetchExamplePlans(): Promise<Array<{ name: string; plan?: unknown }>> {
  const payload = await requestJson<{ examples?: Array<{ name: string; plan?: unknown }> }>("GET", "/plans/examples");
  return payload.examples ?? [];
}

export async function importExamplePlan(name: string): Promise<{ id: string } | null> {
  try {
    return await requestJson<{ id: string }>("POST", `/plans/examples/${encodeURIComponent(name)}/import`);
  } catch { return null; }
}

export interface DryRunResponse { planId: string; warnings: string[] }
export async function dryRunPlan(plan: unknown): Promise<DryRunResponse> {
  return await requestJson<DryRunResponse>("POST", "/plans/validate", { body: { plan } });
}

export interface ExecuteResponse { executionId: string; status: string; planId: string }
export async function executePlan(plan: unknown, serverName?: string): Promise<ExecuteResponse> {
  return await requestJson<ExecuteResponse>("POST", "/plans/execute", { body: { plan, mcpServer: serverName } });
}

export async function executePlanById(planId: string, serverName?: string): Promise<ExecuteResponse> {
  return await requestJson<ExecuteResponse>("POST", `/plans/${encodeURIComponent(planId)}/execute`, { body: { mcpServer: serverName } });
}

