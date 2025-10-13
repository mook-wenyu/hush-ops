/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPluginRuntime } from "../../../src/ui/plugins/runtime";
import { register as registerToolExplorer } from "../../../src/ui/plugins/builtins/mcp-tool-explorer/pluginModule";

describe("MCP 工具浏览器插件", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("展示工具列表并渲染结构化结果", async () => {
    const mockListTools = vi.fn(async () => [
      { name: "search_web", description: "搜索网页", riskLevel: "medium" as const },
      { name: "send_email", description: "发送邮件", riskLevel: "high" as const }
    ]);
    const mockCallTool = vi.fn(async (toolName: string) => {
      if (toolName === "search_web") {
        return [
          { title: "Example", url: "https://example.com", score: 0.95 },
          { title: "Docs", url: "https://docs.example.com", score: 0.87 }
        ];
      }
      return { ok: true, id: "email-001" };
    });

    const runtime = createPluginRuntime({
      descriptors: [],
      bridge: {
        listTools: mockListTools,
        callTool: mockCallTool
      }
    });
    await runtime.initialise();
    await registerToolExplorer(runtime, undefined as never);

    const panel = runtime.listPanels().find((item) => item.id === "core:mcp-tool-explorer");
    expect(panel).toBeDefined();

    const view = render(panel!.render());

    await screen.findByText("search_web");
    expect(mockListTools).toHaveBeenCalledTimes(1);

    const filterInput = screen.getByPlaceholderText("输入名称或描述关键字");
    fireEvent.change(filterInput, { target: { value: "email" } });
    await waitFor(() => {
      expect(screen.queryByText("search_web")).not.toBeInTheDocument();
      expect(screen.getByText("send_email")).toBeInTheDocument();
    });

    fireEvent.change(filterInput, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByText("search_web")).toBeInTheDocument();
    });

    const runButton = screen.getAllByRole("button", { name: "试运行" })[0]!;
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mockCallTool).toHaveBeenCalledWith("search_web", { input: "Hello from hush-ops" });
    });

    await screen.findByText("最新结果");
    expect(screen.getByText(/Example/)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/example.com/)).toBeInTheDocument();

    const now = new Date().toISOString();
    runtime.notifyBridgeOutput({
      toolName: "search_web",
      message: "增量输出 1",
      timestamp: now,
      status: "start"
    });
    await screen.findByText(/增量输出 1/);

    runtime.notifyBridgeOutput({
      toolName: "search_web",
      message: "调用完成",
      timestamp: new Date().toISOString(),
      status: "success",
      correlationId: "corr-1",
      result: { ok: true }
    });

    view.unmount();
    runtime.dispose();
  });

  it("加载历史流并触发重放", async () => {
    const mockListTools = vi.fn(async () => [
      { name: "search_web", description: "搜索网页", riskLevel: "medium" as const }
    ]);
    const mockListHistory = vi.fn(async () => [
      {
        correlationId: "corr-1",
        toolName: "search_web",
        executionId: "exec-1",
        planId: "plan-1",
        nodeId: "node-1",
        chunkCount: 2,
        latestSequence: 1,
        updatedAt: new Date().toISOString(),
        completed: true,
        hasError: false
      }
    ]);
    const mockFetchChunks = vi.fn(async () => [
      {
        toolName: "search_web",
        message: "历史摘要 1",
        timestamp: new Date().toISOString(),
        status: "start" as const,
        correlationId: "corr-1",
        executionId: "exec-1",
        sequence: 0,
        storedAt: new Date().toISOString()
      }
    ]);
    const mockReplay = vi.fn(async () => 2);

    const runtime = createPluginRuntime({
      descriptors: [],
      bridge: {
        listTools: mockListTools,
        callTool: vi.fn(async () => ({})),
        listToolStreamSummaries: mockListHistory,
        fetchToolStreamChunks: mockFetchChunks,
        replayToolStream: mockReplay
      }
    });
    await runtime.initialise();
    await registerToolExplorer(runtime, undefined as never);

    const panel = runtime.listPanels().find((item) => item.id === "core:mcp-tool-explorer");
    const view = render(panel!.render());

    await screen.findByText("search_web");

    runtime.notifyBridgeOutput({
      toolName: "search_web",
      message: "实时摘要",
      timestamp: new Date().toISOString(),
      status: "start",
      executionId: "exec-1"
    });

    const historyButton = await screen.findByRole("button", { name: "加载历史流" });
    await waitFor(() => expect(historyButton).not.toBeDisabled());
    fireEvent.click(historyButton);
    await waitFor(() => expect(mockListHistory).toHaveBeenCalledWith("exec-1"));

    const viewHistoryButton = await screen.findByRole("button", { name: "查看" });
    fireEvent.click(viewHistoryButton);
    await waitFor(() => expect(mockFetchChunks).toHaveBeenCalledWith("exec-1", "corr-1"));
    await screen.findByText(/历史输出 CID/);
    expect(screen.getByText(/历史摘要 1/)).toBeInTheDocument();

    const replayButton = await screen.findByRole("button", { name: "重放" });
    fireEvent.click(replayButton);
    await waitFor(() => expect(mockReplay).toHaveBeenCalledWith("exec-1", "corr-1"));

    view.unmount();
    runtime.dispose();
  });
});
