import { describe, expect, it, vi, beforeEach } from "vitest";

import { BridgeSession } from "../../src/mcp/bridge/session.js";
import type { ToolInvocation } from "../../src/mcp/bridge/types.js";

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

  beforeEach(() => {
    client = new MockBridgeClient();
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
});
