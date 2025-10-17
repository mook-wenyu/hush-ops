/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { PlanActions } from "../../src/ui/components/PlanActions";
import { PluginRuntimeProvider } from "../../src/ui/plugins/runtime/context";
import type { PluginRuntimeOptions } from "../../src/ui/plugins/runtime/pluginRuntime";
import { parsePluginManifest } from "../../src/ui/plugins/runtime/manifest";

expect.extend(matchers);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  (globalThis as { __HUSH_OPS_DISABLE_PLUGINS?: boolean }).__HUSH_OPS_DISABLE_PLUGINS = false;
});
afterEach(() => {
  delete (globalThis as { __HUSH_OPS_DISABLE_PLUGINS?: boolean }).__HUSH_OPS_DISABLE_PLUGINS;
});

function renderWithRuntime(ui: ReactElement, options?: PluginRuntimeOptions) {
  return render(
    <PluginRuntimeProvider options={{ target: "web-ui", descriptors: [], ...options }}>
      {ui}
    </PluginRuntimeProvider>
  );
}

describe("PlanActions", () => {
  const baseProps = {
    planValue: "{\"id\":\"test\"}",
    onPlanChange: vi.fn(),
    onDryRun: vi.fn(),
    onExecute: vi.fn(),
    serverOptions: [{ name: "local" }] as const,
    selectedServer: "local",
    onServerChange: vi.fn(),
    serverError: null,
    warnings: [],
    message: null,
    busy: false,
    disabled: false,
    error: null
  };

  it("calls dry-run handler when button clicked", () => {
    const onDryRun = vi.fn().mockResolvedValue(undefined);
    renderWithRuntime(<PlanActions {...baseProps} onDryRun={onDryRun} />);
    fireEvent.click(screen.getByRole("button", { name: "dry-run" }));
    expect(onDryRun).toHaveBeenCalledTimes(1);
  });

  it("calls execute handler when button clicked", () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    renderWithRuntime(<PlanActions {...baseProps} onExecute={onExecute} />);
    fireEvent.click(screen.getByRole("button", { name: "执行计划" }));
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it("disables buttons when component busy", () => {
    renderWithRuntime(<PlanActions {...baseProps} busy={true} />);
    expect(screen.getByRole("button", { name: "dry-run 中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "执行中…" })).toBeDisabled();
  });

  it("disables buttons when actions disabled", () => {
    renderWithRuntime(<PlanActions {...baseProps} disabled={true} />);
    expect(screen.getByRole("button", { name: "dry-run" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "执行计划" })).toBeDisabled();
  });

  it("disables execute when MCP server 未选择", () => {
    renderWithRuntime(<PlanActions {...baseProps} selectedServer={null} />);
    expect(screen.getByRole("button", { name: "执行计划" })).toBeDisabled();
  });

  it("显示插件命令同步异常并打印日志", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const button = await renderWithCommand("test:command:sync-error", "测试命令", () => {
        throw new Error("同步异常");
    });

    fireEvent.click(button);

    await screen.findByText("命令 测试命令 触发异常：同步异常");
    expect(consoleError).toHaveBeenCalledWith("插件命令触发异常", {
      id: "test:command:sync-error",
      error: expect.any(Error)
    });
    consoleError.mockRestore();
  });

  it("显示插件命令异步失败并恢复按钮状态", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const button = await renderWithCommand("test:command:async-error", "测试命令", async () => {
        await Promise.resolve();
        throw new Error("异步失败");
    });

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent("执行中…"));
    await screen.findByText("命令 测试命令 执行失败：异步失败");
    await waitFor(() => expect(button).toHaveTextContent("测试命令"));
    expect(consoleError).toHaveBeenCalledWith("插件命令执行失败", {
      id: "test:command:async-error",
      error: expect.any(Error)
    });
    consoleError.mockRestore();
  });

  async function renderWithCommand(
    id: string,
    label: string,
    onClick: () => void | Promise<void>
  ) {
    const manifest = parsePluginManifest({
      id: "test.plugin",
      displayName: "测试插件",
      version: "1.0.0",
      entry: "./index.js",
      capabilities: ["command-launcher"],
      targets: ["web-ui"],
      requiredEvents: [],
      requiredMcpTools: []
    });

    renderWithRuntime(
      <PlanActions
        {...baseProps}
      />,
      {
        descriptors: [
          {
            manifest,
            loader: async () => ({
              register(runtime) {
                runtime.registerCommand({
                  id,
                  label,
                  onClick
                });
              }
            })
          }
        ]
      }
    );

    return await screen.findByRole("button", { name: label });
  }
});
