/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PlanCanvas } from "../../src/ui/components/graph/PlanCanvas";
import type { PlanJson } from "../../src/ui/components/graph/PlanCanvas";

expect.extend(matchers);

afterEach(cleanup);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  // React Flow 依赖 ResizeObserver，jsdom 默认未实现。
  (globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
});

afterAll(() => {
  delete (globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }).ResizeObserver;
});

describe("PlanCanvas", () => {
  const demoPlan: PlanJson = {
    id: "demo",
    version: "v1",
    entry: "start",
    nodes: [
      {
        id: "start",
        type: "sequence",
        children: ["task"],
        description: "入口节点"
      },
      {
        id: "task",
        type: "local_task",
        riskLevel: "low",
        requiresApproval: false,
        children: ["end"],
        effectScope: "filesystem"
      },
      {
        id: "end",
        type: "agent_invocation"
      }
    ]
  };

  it("renders plan graph节点与状态标记", () => {
    const pendingNodes = new Set(["task"]);
    const completedNodes = new Set(["start"]);
    render(
      <PlanCanvas
        plan={demoPlan}
        bridgeState="connected"
        pendingNodeIds={pendingNodes}
        currentNodeId="task"
        completedNodeIds={completedNodes}
        executionStatus="running"
      />
    );

    expect(screen.getByText("Plan 画布")).toBeInTheDocument();
    expect(screen.getByText(/·\s*版本\s*v1/)).toBeInTheDocument();
    expect(screen.getByText("执行中")).toBeInTheDocument();

    const taskNode = screen.getByText("task").closest("article");
    const startNode = screen.getByText("start").closest("article");

    expect(taskNode).not.toBeNull();
    expect(taskNode).toHaveClass("card");
    expect(taskNode?.className).toContain("_pending_");
    expect(taskNode?.className).toContain("_active_");
    expect(startNode).not.toBeNull();
    expect(startNode).toHaveClass("card");
    expect(startNode?.className).toContain("_completed_");

    expect(screen.getByText("作用域：filesystem")).toBeInTheDocument();
  });

  it("renders empty state when plan 无效", () => {
    render(<PlanCanvas plan={null} bridgeState="disconnected" pendingNodeIds={new Set()} />);
    expect(screen.getByText(/当前没有可视化数据/)).toBeInTheDocument();
  });
});
