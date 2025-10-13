import { readFile } from "node:fs/promises";
import path from "node:path";

import { PlanSchema } from "./schema.js";
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

export function loadPlan(raw: unknown): PlanContext {
  const plan = PlanSchema.parse(raw);
  const nodeMap = buildNodeMap(plan);
  const adjacency = buildAdjacency(plan, nodeMap);
  return { plan, nodeMap, adjacency };
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
