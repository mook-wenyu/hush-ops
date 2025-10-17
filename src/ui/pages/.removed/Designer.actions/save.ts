import { compileGraph, fsWrite } from "../../../services/orchestratorApi";

export interface SaveContext {
  planId: string;
  graph: { nodes: any[]; edges: any[] };
}

export async function savePlanOrThrow(ctx: SaveContext): Promise<void> {
  const { planId, graph } = ctx;
  const comp = await compileGraph(graph);
  const hasError = (comp.diagnostics ?? []).some((d: any) => d.severity === "error");
  if (hasError) {
    throw new Error("存在错误诊断，已阻止保存");
  }
  const plan = { ...(comp.plan as any), id: planId, graph };
  const content = JSON.stringify(plan, null, 2);
  await fsWrite("plansConfig", `${planId}.json`, content, true);
}

export async function savePlanAsOrThrow(ctx: SaveContext, newPlanId: string): Promise<string> {
  const { graph } = ctx;
  const comp = await compileGraph(graph);
  const hasError = (comp.diagnostics ?? []).some((d: any) => d.severity === "error");
  if (hasError) throw new Error("存在错误诊断，已阻止另存");
  const plan = { ...(comp.plan as any), id: newPlanId, graph };
  const content = JSON.stringify(plan, null, 2);
  await fsWrite("plansConfig", `${newPlanId}.json`, content, true);
  return newPlanId;
}

export function exportPlanToText(ctx: SaveContext): string {
  const { planId, graph } = ctx;
  const plan = { id: planId, version: "v1", graph };
  return JSON.stringify(plan, null, 2);
}

export async function importPlanFromText(text: string): Promise<SaveContext> {
  const json = JSON.parse(text);
  const planId: string = typeof json?.id === "string" && json.id.length > 0 ? json.id : `imported-${Date.now()}`;
  const graph = json?.graph && typeof json.graph === "object" ? json.graph : { nodes: [], edges: [] };
  return { planId, graph };
}

export function triggerDownload(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
