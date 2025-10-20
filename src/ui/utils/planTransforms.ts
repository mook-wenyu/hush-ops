import type { XYPosition } from "@xyflow/react";

import type { PlanJson, PlanNodeJson, PlanNodePositionUpdate } from "../components/graph/PlanCanvas";

function normalisePosition(position: XYPosition): XYPosition {
  const round = (value: number) => (Number.isFinite(value) ? Number(Number(value).toFixed(2)) : 0);
  return {
    x: round(position.x ?? 0),
    y: round(position.y ?? 0)
  };
}

function applyPosition(node: PlanNodeJson, position: XYPosition): PlanNodeJson {
  const currentUi = node.ui ?? {};
  return {
    ...node,
    ui: {
      ...currentUi,
      position: normalisePosition(position)
    }
  };
}

export function updatePlanWithNodePositions(
  plan: PlanJson,
  updates: readonly PlanNodePositionUpdate[]
): PlanJson {
  if (!Array.isArray(plan.nodes) || updates.length === 0) {
    return plan;
  }

  const updateMap = new Map<string, XYPosition>();
  for (const update of updates) {
    if (update.id && update.position) {
      updateMap.set(update.id, update.position);
    }
  }

  if (updateMap.size === 0) {
    return plan;
  }

  const nextNodes = plan.nodes.map((node) => {
    const nextPosition = updateMap.get(node.id);
    if (!nextPosition) {
      return node;
    }
    return applyPosition(node, nextPosition);
  });

  return {
    ...plan,
    nodes: nextNodes
  };
}

export function updatePlanInputWithNodePositions(
  planInput: string,
  updates: readonly PlanNodePositionUpdate[]
): string {
  if (!planInput.trim() || updates.length === 0) {
    return planInput;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(planInput);
  } catch (error) {
    throw new Error(`Plan JSON 解析失败：${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    return planInput;
  }

  const updatedPlan = updatePlanWithNodePositions(parsed as PlanJson, updates);
  return JSON.stringify(updatedPlan, null, 2);
}
