// 轻量占位：Graph <-> Plan 的简化编译器
// 真实实现应根据项目 Plan 结构完成映射；此处仅作为最小可用占位。

export interface GraphJson { nodes: any[]; edges: any[] }

export interface DiagnosticsItem {
  code?: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export function graphToPlan(graph: GraphJson): { plan: unknown; diagnostics: DiagnosticsItem[] } {
  const diagnostics: DiagnosticsItem[] = [];
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    diagnostics.push({ severity: 'error', message: '图结构无效（缺少 nodes/edges）' });
    return { plan: {}, diagnostics };
  }
  // 最小映射：仅把 graph 挂到 plan.graph，真实业务可替换为 DAG->步骤映射
  const plan = { id: `designer-${Date.now()}`, graph };
  return { plan, diagnostics };
}

export function planToGraph(plan: any): GraphJson {
  if (plan && plan.graph && typeof plan.graph === 'object') {
    const g = plan.graph as GraphJson;
    return { nodes: Array.isArray(g.nodes) ? g.nodes : [], edges: Array.isArray(g.edges) ? g.edges : [] };
  }
  return { nodes: [], edges: [] };
}
