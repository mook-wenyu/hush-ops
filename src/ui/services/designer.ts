import type { CompileResponse } from "./types.internal";
import { requestJson } from "./core/http";

// 统一导出类型：避免重复定义
export type { CompileResponse } from "./types.internal";

export async function compileGraph(graph: { nodes: any[]; edges: any[] }, opts?: { signal?: AbortSignal }): Promise<CompileResponse> {
  const options: any = { body: { graph } };
  if (opts?.signal) options.signal = opts.signal;
  return await requestJson<CompileResponse>("POST", "/designer/compile", options);
}

export interface DryRunSimResponse { timeline?: unknown[]; warnings?: string[] }
export async function simulateDryRun(plan: unknown, opts?: { fromNode?: string; signal?: AbortSignal }): Promise<DryRunSimResponse> {
  const options: any = { body: { plan, dryRun: true } };
  if (opts?.fromNode) options.body.fromNode = opts.fromNode;
  if (opts?.signal) options.signal = opts.signal;
  return await requestJson<DryRunSimResponse>("POST", "/plans/dry-run", options);
}
