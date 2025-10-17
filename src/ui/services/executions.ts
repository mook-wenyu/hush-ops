import type { ExecutionRecord } from "../types/orchestrator.js";
import { requestJson } from "./core/http.js";

export async function fetchExecutions(signal?: AbortSignal): Promise<ExecutionRecord[]> {
  const payload = await requestJson<{ executions: ExecutionRecord[] }>("GET", "/executions", { signal });
  return payload.executions;
}

export async function fetchExecutionById(id: string): Promise<ExecutionRecord> {
  return await requestJson<ExecutionRecord>("GET", `/executions/${encodeURIComponent(id)}`);
}

export async function stopExecution(id: string): Promise<void> {
  await requestJson<void>("POST", `/executions/${encodeURIComponent(id)}/stop`);
}
