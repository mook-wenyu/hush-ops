import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BridgeSession } from "../../src/mcp/bridge/session.js";
import type { ToolInvocation } from "../../src/mcp/bridge/types.js";
import { setLogEventPublisher } from "../../src/shared/logging/logger.js";
import type { LogsAppendedPayload } from "../../src/shared/logging/events.js";

class MockBridgeClient {
  state: "connected" | "disconnected" = "connected";
  invocations: { method: string; params?: unknown }[] = [];
  listeners: Record<string, ((payload?: unknown) => void)[]> = {};

  on(event: string, handler: (payload?: unknown) => void) {
    this.listeners[event] = this.listeners[event] ?? [];
    this.listeners[event]?.push(handler);
  }

  emit(event: string, payload?: unknown) {
    for (const handler of this.listeners[event] ?? []) {
      handler(payload);
    }
  }

  async connect() {
    this.state = "connected";
  }

  async disconnect() {
    this.state = "disconnected";
  }

  getState() {
    return this.state;
  }

  async invoke(method: string, params?: unknown): Promise<unknown> {
    this.invocations.push({ method, params });
    if (method === "tools.list") {
      return { tools: [{ name: "demo" }] };
    }
    if (method === "tools.invoke") {
      return { output: "ok" };
    }
    return null;
  }

  async callTool(payload: { tool: string; arguments?: Record<string, unknown> }, options?: unknown) {
    this.invocations.push({ method: "tools.call", params: { payload, options } });
    return this.invoke("tools.invoke", { tool: payload.tool, arguments: payload.arguments });
  }
}

describe("BridgeSession", () => {
  let client: MockBridgeClient;
  const capturedLogs: LogsAppendedPayload[] = [];

  beforeEach(() => {
    client = new MockBridgeClient();
    capturedLogs.length = 0;
    setLogEventPublisher((payload) => {
      capturedLogs.push(payload);
    });
  });

  afterEach(() => {
    setLogEventPublisher(null);
  });

  it("invokes tool with security hooks", async () => {
    const onInvoke = vi.fn();
    const onRisky = vi.fn();
    const session = new BridgeSession(client as unknown as any, {
      securityHooks: {
        onToolInvoke: onInvoke,
        onRiskyTool: onRisky
      }
    });

    const invocation: ToolInvocation = {
      toolName: "filesystem.remove",
      arguments: { path: "/tmp/demo" },
      options: { nodeId: "n-1", riskLevel: "high" }
    };

    const result = await session.invokeTool(invocation);
    expect(result).toEqual({ output: "ok" });
    expect(onInvoke).toHaveBeenCalledWith({
      toolName: "filesystem.remove",
      nodeId: "n-1",
      arguments: { path: "/tmp/demo" }
    });
    expect(onRisky).toHaveBeenCalledWith({
      toolName: "filesystem.remove",
      nodeId: "n-1",
      arguments: { path: "/tmp/demo" },
      riskLevel: "high"
    });
  });

  it("lists tools via bridge client", async () => {
    const session = new BridgeSession(client as unknown as any);
    const tools = await session.listTools();
    expect(tools).toEqual([{ name: "demo" }]);
  });

  it("forwards bridge events", () => {
    const session = new BridgeSession(client as unknown as any);
    const handler = vi.fn();
    session.on("connected", handler);
    session.on("message", handler);

    client.emit("bridge:connected");
    client.emit("bridge:message", { method: "ping" });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("记录工具调用失败日志并包含上下文", async () => {
    const session = new BridgeSession(client as unknown as any);
    client.callTool = vi.fn(async () => {
      throw new Error("工具执行失败");
    });

    const invocation: ToolInvocation = {
      toolName: "filesystem.remove",
      arguments: { path: "/tmp/demo" },
      options: { nodeId: "n-1", riskLevel: "high", planId: "plan-1", executionId: "exec-1" }
    };

    await expect(session.invokeTool(invocation)).rejects.toThrow("工具执行失败");

    const errorLog = capturedLogs.find((entry) => entry.message === "invoke tool failed");

    expect(errorLog?.category).toBe("app");
    expect(errorLog?.context).toMatchObject({
      toolName: "filesystem.remove",
      executionId: "exec-1",
      planId: "plan-1"
    });
  });
});
