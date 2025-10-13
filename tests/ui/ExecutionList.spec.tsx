/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionList } from "../../src/ui/components/ExecutionList";
import type { ExecutionRecord } from "../../src/ui/types/orchestrator";

expect.extend(matchers);
afterEach(cleanup);

describe("ExecutionList", () => {
  const baseExecution: ExecutionRecord = {
    id: "exec-1",
    planId: "plan-1",
    createdAt: new Date("2025-10-10T03:00:00Z").toISOString(),
    executorType: "mock",
    status: "running",
    bridgeStates: ["connected"],
    pendingApprovals: []
  };

  it("renders stop button for running execution when handler提供", () => {
    const onStop = vi.fn();
    render(
      <ExecutionList
        executions={[baseExecution]}
        loading={false}
        disabled={false}
        onRefresh={vi.fn()}
        onStop={(id) => onStop(id)}
      />
    );
    const button = screen.getByRole("button", { name: "停止执行" });
    fireEvent.click(button);
    expect(onStop).toHaveBeenCalledWith("exec-1");
  });

  it("隐藏停止按钮当 disabled", () => {
    render(
      <ExecutionList
        executions={[baseExecution]}
        loading={false}
        disabled={true}
        onRefresh={vi.fn()}
        onStop={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "停止执行" })).not.toBeInTheDocument();
  });
});