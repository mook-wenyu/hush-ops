/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/ui/App";
import {
  appStore,
  setAppStoreEnabledForTests
} from "../../src/ui/state/appStore";
import type {
  ExecutionSnapshot,
  OrchestratorEventEnvelope,
  PendingApprovalEntry
} from "../../src/ui/types/orchestrator";
import type { SequenceGapInfo } from "../../src/ui/hooks/useBridgeConnection";

const originalFetch = global.fetch;
const originalConsoleError = console.error;
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

expect.extend(matchers);

vi.mock("../../src/ui/services", () => ({
  fetchExecutions: vi.fn(async () => []),
  fetchMcpServers: vi.fn(async () => []),
  fetchMcpTools: vi.fn(async () => []),
  executePlan: vi.fn(async () => ({ executionId: "exec-plan", status: "pending", planId: "plan-plan" })),
  submitApprovalDecision: vi.fn(async () => {}),
  stopExecution: vi.fn(async () => {}),
  dryRunPlan: vi.fn(async () => ({ planId: "plan-plan", warnings: [] })),
  callMcpTool: vi.fn(async () => ({})),
  requestApproval: vi.fn(async () => {}),
  fetchExecutionToolStreamSummaries: vi.fn(async () => []),
  fetchExecutionToolStreamChunks: vi.fn(async () => []),
  replayExecutionToolStream: vi.fn(async () => {})
}));

let capturedOnEvent: ((envelope: OrchestratorEventEnvelope) => void) | undefined;
let capturedOnSequenceGap: ((info: SequenceGapInfo) => void) | undefined;

vi.mock("../../src/ui/hooks/useBridgeConnection", () => {
  return {
    useBridgeConnection: (options: {
      onEvent: (envelope: OrchestratorEventEnvelope) => void;
      onSequenceGap?: (info: SequenceGapInfo) => void;
    }) => {
      capturedOnEvent = options.onEvent;
      capturedOnSequenceGap = options.onSequenceGap;
      return { reconnect: vi.fn() };
    }
  };
});

vi.mock("../../src/ui/components/BridgeStatus", () => ({
  BridgeStatus: () => <div data-testid="bridge-status" />
}));

vi.mock("../../src/ui/components/ExecutionList", () => ({
  ExecutionList: ({ executions }: { executions?: unknown[] }) => (
    <div data-testid="execution-list" data-length={executions?.length ?? 0} />
  )
}));

vi.mock("../../src/ui/components/PendingApprovals", () => ({
  PendingApprovals: () => <div data-testid="pending-approvals" />
}));


vi.mock("../../src/ui/components/PlanNodeEditor", () => ({
  PlanNodeEditor: () => <div data-testid="plan-node-editor" />
}));

vi.mock("../../src/ui/components/graph/PlanCanvas", () => ({
  PlanCanvas: () => <div data-testid="plan-canvas" />
}));

vi.mock("../../src/ui/components/PluginSidePanels", () => ({
  PluginSidePanels: () => <div data-testid="plugin-side-panels" />
}));

vi.mock("../../src/ui/plugins/runtime", () => ({
  PluginRuntimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}));

vi.mock("../../src/ui/utils/plugins", () => ({
  isPluginsDisabled: () => false
}));

describe("App bridge event handlers", () => {
  beforeEach(() => {
    setAppStoreEnabledForTests(true);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      const [message] = args;
      if (typeof message === "string" && message.includes("Cannot update a component") && message.includes("while rendering a different component")) {
        return;
      }
      originalConsoleError(...(args as Parameters<typeof console.error>));
    });
    const state = appStore.getState();
    state.resetExecutions();
    state.resetApprovals();
    state.resetRuntime();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/plans/demo-mixed.json")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "demo-plan", nodes: [] })
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => ""
      } as Response;
    });
  });

  afterEach(() => {
    cleanup();
    const state = appStore.getState();
    state.resetExecutions();
    state.resetApprovals();
    state.resetRuntime();
    setAppStoreEnabledForTests(false);
    capturedOnEvent = undefined;
    capturedOnSequenceGap = undefined;
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = null;
    vi.clearAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  const renderApp = async () => {
    await act(async () => {
      render(<App />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("execution-list")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(typeof capturedOnEvent).toBe("function");
    });
    return capturedOnEvent!;
  };

  it("@ws-unit runtime.state-change 写入 runtime 快照", async () => {
    const onEvent = await renderApp();
    const pendingSummary = {
      id: "approval-pending",
      nodeId: "node-pending",
      nodeType: "task",
      riskLevel: "medium" as const,
      requiresApproval: true,
      requestedAt: new Date("2025-10-13T12:00:10Z").toISOString()
    };

    await act(async () => {
      onEvent({
        event: "runtime.state-change",
        executionId: "exec-runtime",
        timestamp: new Date().toISOString(),
        payload: {
          bridgeState: "connected",
          planId: "plan-1",
          executionStatus: "running",
          running: true,
          currentNodeId: "node-1",
          lastCompletedNodeId: "node-0",
          pendingApprovals: [pendingSummary]
        }
      });
    });

    await waitFor(() => {
      const state = appStore.getState();
      expect(state.runtime.snapshot.planId).toBe("plan-1");
      expect(state.runtime.snapshot.currentNodeId).toBe("node-1");
      expect(state.runtime.snapshot.completedNodeIds).toContain("node-0");
      expect(state.runtime.snapshot.pendingNodeIds).toContain("node-pending");
      expect(state.runtime.bridgeState).toBe("connected");
    });
  });

  it("@ws-unit execution.completed 清除待审批并写入结果", async () => {
    const onEvent = await renderApp();
    const approval: PendingApprovalEntry = {
      id: "approval-1",
      planId: "plan-1",
      nodeId: "node-1",
      nodeType: "task",
      riskLevel: "medium",
      requiresApproval: true,
      requestedAt: new Date().toISOString(),
      requestedBy: "Codex"
    };

    appStore.getState().applyExecutionSnapshot({
      executionId: "exec-complete",
      planId: "plan-1",
      status: "running",
      executionStatus: "running",
      running: true,
      executorType: "mock",
      createdAt: new Date("2025-10-13T12:05:00Z").toISOString(),
      pendingApprovals: [approval],
      bridgeState: "connected"
    });

    await act(async () => {
      onEvent({
        event: "execution.completed",
        executionId: "exec-complete",
        timestamp: new Date().toISOString(),
        payload: {
          status: "success",
          startedAt: new Date("2025-10-13T12:05:30Z").toISOString(),
          finishedAt: new Date("2025-10-13T12:06:30Z").toISOString(),
          outputs: { result: "ok" }
        }
      });
    });

    await waitFor(() => {
      const state = appStore.getState();
      const record = state.executions.byId["exec-complete"];
      expect(record?.status).toBe("success");
      expect(record?.running).toBe(false);
      expect(state.approvals.pendingById[approval.id]).toBeUndefined();
    });
  });

  it("@ws-unit approval 事件增减待审批", async () => {
    const onEvent = await renderApp();

    appStore.getState().applyExecutionSnapshot({
      executionId: "exec-approval",
      planId: "plan-2",
      status: "running",
      executionStatus: "running",
      running: true,
      executorType: "mock",
      createdAt: new Date("2025-10-13T12:10:00Z").toISOString(),
      pendingApprovals: [],
      bridgeState: "connected"
    });

    const pending: PendingApprovalEntry = {
      id: "approval-42",
      planId: "plan-2",
      nodeId: "node-42",
      nodeType: "tool",
      riskLevel: "high",
      requiresApproval: true,
      requestedAt: new Date().toISOString(),
      requestedBy: "Reviewer"
    };

    await act(async () => {
      onEvent({
        event: "approval.pending",
        executionId: "exec-approval",
        timestamp: new Date().toISOString(),
        payload: pending
      });
    });

    await waitFor(() => {
      const state = appStore.getState();
      expect(state.approvals.pendingById[pending.id]).toEqual(pending);
      expect(state.approvals.executionIndex[pending.id]).toBe("exec-approval");
    });

    await act(async () => {
      onEvent({
        event: "approval.updated",
        executionId: "exec-approval",
        timestamp: new Date().toISOString(),
        payload: { id: pending.id }
      });
    });

    await waitFor(() => {
      const state = appStore.getState();
      expect(state.approvals.pendingById[pending.id]).toBeUndefined();
      expect(state.approvals.executionIndex[pending.id]).toBeUndefined();
    });
  });

  it("@ws-unit approval.pending 重复事件不会重复写入待审批", async () => {
    const onEvent = await renderApp();

    appStore.getState().applyExecutionSnapshot({
      executionId: "exec-dup",
      planId: "plan-dup",
      status: "running",
      executionStatus: "running",
      running: true,
      executorType: "mock",
      createdAt: new Date("2025-10-13T12:12:00Z").toISOString(),
      pendingApprovals: [],
      bridgeState: "connected"
    });

    const duplicate: PendingApprovalEntry = {
      id: "approval-dup",
      planId: "plan-dup",
      nodeId: "node-dup",
      nodeType: "task",
      riskLevel: "low",
      requiresApproval: true,
      requestedAt: new Date().toISOString(),
      requestedBy: "Auto"
    };

    await act(async () => {
      onEvent({
        event: "approval.pending",
        executionId: "exec-dup",
        timestamp: new Date().toISOString(),
        payload: duplicate
      });
    });

    await waitFor(() => {
      const state = appStore.getState();
      expect(Object.keys(state.approvals.pendingById)).toHaveLength(1);
    });

    await act(async () => {
      onEvent({
        event: "approval.pending",
        executionId: "exec-dup",
        timestamp: new Date().toISOString(),
        payload: { ...duplicate, requestedBy: "Auto-B" }
      });
    });

    await waitFor(() => {
      const state = appStore.getState();
      expect(Object.keys(state.approvals.pendingById)).toHaveLength(1);
      expect(state.approvals.pendingById[duplicate.id]?.requestedBy).toBe("Auto-B");
    });
  });

  it("@ws-unit 序列缺口触发错误提示", async () => {
    await renderApp();

    expect(capturedOnSequenceGap).toBeDefined();

    capturedOnSequenceGap?.({
      executionId: "exec-gap",
      previous: 5,
      current: 7,
      envelope: {
        event: "execution.completed",
        timestamp: new Date().toISOString(),
        payload: { sequence: 7 },
        executionId: "exec-gap"
      }
    });

    await waitFor(() => {
      expect(appStore.getState().executions.error).toBe("检测到桥接事件序列缺口，已触发回退轮询。");
    });
  });
});
