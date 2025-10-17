/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/ui/App";

expect.extend(matchers);

// Mock network + orchestrator API
vi.mock("../../src/ui/services", () => ({
  fetchExecutions: vi.fn(async () => []),
  fetchMcpServers: vi.fn(async () => []),
  fetchMcpTools: vi.fn(async () => []),
  executePlan: vi.fn(async () => ({ executionId: "exec", status: "pending", planId: "plan" })),
  submitApprovalDecision: vi.fn(async () => {}),
  stopExecution: vi.fn(async () => {}),
  simulateDryRun: vi.fn(async () => ({ warnings: [] })),
  callMcpTool: vi.fn(async () => ({})),
  requestApproval: vi.fn(async () => {}),
  fetchExecutionToolStreamSummaries: vi.fn(async () => []),
  fetchExecutionToolStreamChunks: vi.fn(async () => []),
  replayExecutionToolStream: vi.fn(async () => {})
}));

// Stub bridge hook; we only need initial render
vi.mock("../../src/ui/hooks/useBridgeConnection", () => ({
  useBridgeConnection: () => ({ reconnect: vi.fn() })
}));

// Minimal component stubs to reduce noise
vi.mock("../../src/ui/components/BridgeStatus", () => ({
  BridgeStatus: () => <div data-testid="bridge-status" />
}));
vi.mock("../../src/ui/components/ExecutionList", () => ({
  ExecutionList: () => <div data-testid="execution-list" />
}));
vi.mock("../../src/ui/components/PendingApprovals", () => ({
  PendingApprovals: () => <div data-testid="pending-approvals" />
}));
vi.mock("../../src/ui/components/PlanActions", () => ({
  PlanActions: () => <div data-testid="plan-actions" />
}));
vi.mock("../../src/ui/components/PlanNodeEditor", () => ({
  PlanNodeEditor: () => <div data-testid="plan-node-editor" />
}));
vi.mock("../../src/ui/components/graph/PlanCanvas", () => ({
  PlanCanvas: () => <div data-testid="plan-canvas" />
}));

// Enable plugins in UI
vi.mock("../../src/ui/utils/plugins", () => ({
  isPluginsDisabled: () => false
}));

// Optional: provide a predictable lazy chunk content once loaded
vi.mock("../../src/ui/components/PluginSidePanels", () => ({
  PluginSidePanels: () => <div data-testid="plugin-side-panels" />
}));

describe("P2: 插件侧栏惰性加载", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
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
    vi.clearAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  it("默认不挂载插件侧栏，点击后再加载", async () => {
    await act(async () => {
      render(<App />);
    });

    // 首屏：宿主容器与侧栏均不存在
    expect(screen.queryByTestId("plugin-panels-host")).toBeNull();
    expect(screen.queryByTestId("plugin-side-panels")).toBeNull();

    // 点击打开按钮后，应出现宿主容器与侧栏标记
    const toggle = await waitFor(() => screen.getByTestId("toggle-plugin-panels"));
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-panels-host")).toBeInTheDocument();
    });
  });
});
