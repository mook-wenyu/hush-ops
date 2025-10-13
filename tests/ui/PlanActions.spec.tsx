/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { PlanActions } from "../../src/ui/components/PlanActions";
import { PluginRuntimeProvider } from "../../src/ui/plugins/runtime/context";
import type { PluginRuntimeOptions } from "../../src/ui/plugins/runtime/pluginRuntime";

expect.extend(matchers);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithRuntime(ui: ReactElement, options?: PluginRuntimeOptions) {
  return render(
    <PluginRuntimeProvider options={{ target: "headless", descriptors: [], ...options }}>
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

});
