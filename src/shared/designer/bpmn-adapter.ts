// BPMN 子集 ↔ Plan/Graph 适配器（占位实现）
// 说明：为避免引入额外依赖（如 bpmn-js），此处提供最小占位与接口，后续可替换为真实解析/生成。

export type GraphJson = { nodes: any[]; edges: any[] };

export async function importBpmnXml(_xml: string): Promise<GraphJson> {
  // 占位：返回空图；后续可在此解析 Task/SequenceFlow/ExclusiveGateway
  return { nodes: [], edges: [] };
}

export async function exportBpmnXml(_graph: GraphJson): Promise<string> {
  // 占位：根据最小语义生成 BPMN 片段，当前返回空流程定义
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://example"/>`;
  return xml;
}
