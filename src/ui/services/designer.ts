import type { CompileResponse } from "./types.internal";
import { requestJson } from "./core/http";

// 统一导出类型：避免重复定义
export type { CompileResponse } from "./types.internal";

export async function compileGraph(graph: { nodes: any[]; edges: any[] }, opts?: { signal?: AbortSignal }): Promise<CompileResponse> {
  return await requestJson<CompileResponse>("POST", "/designer/compile", { body: { graph }, signal: opts?.signal });
}

export interface DryRunSimResponse { timeline?: unknown[]; warnings?: string[] }
export async function simulateDryRun(plan: unknown, opts?: { fromNode?: string; signal?: AbortSignal }): Promise<DryRunSimResponse> {
  return await requestJson<DryRunSimResponse>("POST", "/plans/dry-run", {
    body: { plan, fromNode: opts?.fromNode, dryRun: true },
    signal: opts?.signal
  });
}
