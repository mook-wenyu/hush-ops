import { readFile } from "node:fs/promises";
import path from "node:path";

import { PlanSchema, PlanV3Schema } from "./schema.js";
import type { Plan, PlanNode } from "./schema.js";

export interface PlanContext {
  readonly plan: Plan;
  readonly nodeMap: Map<string, PlanNode>;
  readonly adjacency: Map<string, string[]>;
}

function buildNodeMap(plan: Plan): Map<string, PlanNode> {
  const map = new Map<string, PlanNode>();
  for (const node of plan.nodes) {
    if (map.has(node.id)) {
      throw new Error(`Plan 中存在重复节点 ID: ${node.id}`);
    }
    map.set(node.id, node);
  }
  if (!map.has(plan.entry)) {
    throw new Error(`Plan entry 节点 ${plan.entry} 不存在`);
  }
  return map;
}

function collectChildren(node: PlanNode): string[] {
  switch (node.type) {
    case "sequence":
    case "parallel":
      return node.children;
    case "conditional":
      return [...node.whenTrue, ...(node.whenFalse ?? [])];
    case "loop":
      return node.body;
    case "human_approval":
    case "local_task":
    case "agent_invocation":
    case "mcp_tool":
    case "external_service":
      return [];
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

function buildAdjacency(plan: Plan, nodeMap: Map<string, PlanNode>): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const node of plan.nodes) {
    const children = collectChildren(node);
    for (const childId of children) {
      if (!nodeMap.has(childId)) {
        throw new Error(`节点 ${node.id} 引用了不存在的子节点: ${childId}`);
      }
    }
    adjacency.set(node.id, children);
  }
  return adjacency;
}

function normalizeV3ToLegacy(raw: unknown): Plan | null {
  const parsed = PlanV3Schema.safeParse(raw);
  if (!parsed.success) return null;
  const v3 = parsed.data;
  const outChildren = new Map<string, string[]>();
  for (const edge of v3.edges) {
    const list = outChildren.get(edge.source) ?? [];
    list.push(edge.target);
    outChildren.set(edge.source, list);
  }
  const nodes: Plan["nodes"] = v3.nodes.map((n: any) => {
    if (n.type === "sequence" || n.type === "parallel") {
      const children = outChildren.get(n.id) ?? [];
      // 仅拣选 v1 中存在的字段，避免额外 UI 字段导致 schema 不一致
      const { id, type, name, description, riskLevel, requiresApproval, retryPolicy, timeoutSeconds, metadata } = n;
      return { id, type, name, description, riskLevel, requiresApproval, retryPolicy, timeoutSeconds, metadata, children } as any;
    }
    // 其他节点：结构与 v1 一致（conditional/loop/...），拣选已知字段
    const { id, type, name, description, riskLevel, requiresApproval, retryPolicy, timeoutSeconds, metadata } = n;
    return { id, type, name, description, riskLevel, requiresApproval, retryPolicy, timeoutSeconds, metadata, ...n } as any;
  });
  const plan: Plan = {
    id: v3.id,
    version: v3.version,
    entry: v3.entry,
    nodes
  } as Plan;
  // 不再用 PlanSchema.verify 以允许最小字段集；后续在 runtime 侧基于 adjacency 驱动
  return plan;
}

export function loadPlan(raw: unknown): PlanContext {
  // 1) 先尝试旧版（children）
  const v1 = PlanSchema.safeParse(raw);
  if (v1.success) {
    const plan = v1.data;
    const nodeMap = buildNodeMap(plan);
    const adjacency = buildAdjacency(plan, nodeMap);
    return { plan, nodeMap, adjacency };
  }
  // 2) 尝试 v3（nodes+edges），转为旧版结构供执行器使用
  const legacy = normalizeV3ToLegacy(raw);
  if (!legacy) {
    // 提取v1验证的详细错误信息（可能包含JSON Logic错误）
    if (v1.error && v1.error.issues.length > 0) {
      const firstIssue = v1.error.issues[0];
      if (firstIssue && firstIssue.message.includes("JSON Logic 表达式解析失败")) {
        throw new Error(firstIssue.message);
      }
    }
    // 回落到原错误消息（更友好）：
    throw new Error(`计划结构无效：不符合 v1(children) 或 v3(edges) 契约`);
  }
  const nodeMap = buildNodeMap(legacy);
  const adjacency = buildAdjacency(legacy, nodeMap);
  return { plan: legacy, nodeMap, adjacency };
}

export async function loadPlanFromFile(filePath: string): Promise<PlanContext> {
  const absolute = path.resolve(filePath);
  const content = await readFile(absolute, "utf-8");
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (error) {
    throw new Error(`计划文件不是有效 JSON (${absolute})`, { cause: error });
  }
  return loadPlan(json);
}
