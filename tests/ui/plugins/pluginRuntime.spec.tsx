/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import type { PendingApprovalEntry } from "../../../src/ui/types/orchestrator";
import { createPluginRuntime } from "../../../src/ui/plugins/runtime";
import { getPlanOverlayRegistry, resetPlanOverlayRegistryForTests } from "../../../src/ui/plugins/planOverlays";

describe("PluginRuntime", () => {
  beforeEach(() => {
    resetPlanOverlayRegistryForTests();
  });

  it("加载内置插件并注册 Plan overlay", async () => {
    const runtime = createPluginRuntime({ availableEvents: ["runtime:state-change"] });
    await runtime.initialise();
    const registry = getPlanOverlayRegistry();

    expect(registry.has("core:execution-trail")).toBe(true);
    expect(runtime.listManifests().some((manifest) => manifest.id === "com.hush.core.execution-trail")).toBe(true);

    runtime.dispose();
    expect(registry.list().length).toBe(0);
  });

  it("支持注册命令与侧边面板", async () => {
    const runtime = createPluginRuntime({ descriptors: [] });
    await runtime.initialise();

    const disposeCommand = runtime.registerCommand({
      id: "test:command",
      label: "测试命令",
      onClick: () => {}
    });
    const disposePanel = runtime.registerPanel({
      id: "test:panel",
      title: "测试面板",
      render: () => <div data-testid="plugin-panel">panel</div>
    });

    expect(runtime.listCommands().map((cmd) => cmd.id)).toContain("test:command");
    expect(runtime.listPanels().map((panel) => panel.id)).toContain("test:panel");

    disposeCommand();
    expect(runtime.listCommands().length).toBe(0);

    disposePanel();
    expect(runtime.listPanels().length).toBe(0);

    runtime.dispose();
    expect(runtime.listPanels().length).toBe(0);
    expect(runtime.listCommands().length).toBe(0);
  });

  it("加载 MCP 工具浏览器插件", async () => {
    const runtime = createPluginRuntime({
      availableMcpTools: ["search_web"],
      bridge: {
        listTools: async () => [{ name: "search_web", description: "Search the web" }],
        callTool: async () => ({ ok: true })
      }
    });
    await runtime.initialise();

    expect(runtime.listCommands().some((cmd) => cmd.id === "core:mcp-tool-explorer:refresh")).toBe(true);
    expect(runtime.listPanels().some((panel) => panel.id === "core:mcp-tool-explorer")).toBe(true);

    runtime.dispose();
  });

  it("支持请求审批", async () => {
    const runtime = createPluginRuntime({
      bridge: {
        requestApproval: async () => ({
          id: "APP-1",
          planId: "demo",
          planVersion: "manual",
          nodeId: "node-1",
          nodeType: "plugin_action",
          riskLevel: "medium",
          requiresApproval: true,
          requestedAt: new Date().toISOString(),
          requestedBy: "plugin",
          payload: { title: "Demo" }
        } satisfies PendingApprovalEntry)
      }
    });
    await runtime.initialise();
    const result = await runtime.requestApproval({ planId: "demo", nodeId: "node-1" });
    expect(result.id).toBe("APP-1");
    runtime.dispose();
  });

  it("在缺少 requestApproval 能力时抛出明确错误", async () => {
    const runtime = createPluginRuntime({ descriptors: [] });
    await runtime.initialise();
    await expect(
      runtime.requestApproval({ planId: "demo-plan", nodeId: "node-1" })
    ).rejects.toThrow("当前运行时未提供审批请求能力");
    runtime.dispose();
  });

  it("在缺少 replay 能力时抛出明确错误", async () => {
    const runtime = createPluginRuntime({ descriptors: [] });
    await runtime.initialise();
    await expect(runtime.replayToolStream("exec-1", "corr-1")).rejects.toThrow(
      "当前运行时未提供流式输出重放能力"
    );
    runtime.dispose();
  });
});
