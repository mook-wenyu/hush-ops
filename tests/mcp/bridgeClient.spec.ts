import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import { BridgeClient } from "../../src/mcp/bridge/bridgeClient.js";
import type { BridgeOptions } from "../../src/mcp/bridge/types.js";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  JSONRPCMessage,
  CallToolResult,
  ListToolsResult
} from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

class StubTransport implements Transport {
  onclose?: () => void;

  onerror?: (error: Error) => void;

  onmessage?: (message: JSONRPCMessage) => void;

  sessionId?: string;

  readonly sent: JSONRPCMessage[] = [];

  started = false;

  closed = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    this.sent.push(message);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.onclose?.();
  }
}

class StubClient implements Partial<Client> {
  public onclose?: () => void;

  public onerror?: (error: Error) => void;

  public fallbackNotificationHandler?: Client["fallbackNotificationHandler"];

  readonly connectCalls: Transport[] = [];

  readonly notifications: JSONRPCMessage[] = [];

  private readonly listToolsResult: ListToolsResult = {
    tools: [
      {
        name: "demo",
        description: "Demo tool",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ]
  };

  private readonly toolCallResult: CallToolResult = {
    content: [
      {
        type: "text",
        text: "ok"
      }
    ]
  };

  connect = vi.fn(async (transport: Transport) => {
    this.connectCalls.push(transport);
  });

  close = vi.fn(async () => {
    /* noop */
  });

  listTools = vi.fn(async () => this.listToolsResult);

  callTool = vi.fn(async () => this.toolCallResult);
}

function createOptions(overrides: Partial<BridgeOptions> = {}) {
  const transports: StubTransport[] = [];
  const clients: StubClient[] = [];
  const transportFactory = () => {
    const transport = new StubTransport();
    transports.push(transport);
    return transport;
  };
  const clientFactory = (_transport: Transport) => {
    const client = new StubClient();
    clients.push(client);
    return client as unknown as Client;
  };
  return {
    options: {
      endpoint: "http://localhost:8080/mcp",
      transportFactory,
      clientFactory,
      retry: {
        initialDelayMs: 10,
        multiplier: 2,
        maxDelayMs: 100,
        maxAttempts: 3
      }
    } as BridgeOptions,
    transports,
    clients
  };
}

describe("BridgeClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects and lists tools via injected client", async () => {
    const { options, transports, clients } = createOptions();
    const bridge = new BridgeClient(options);

    await bridge.connect();
    expect(bridge.getState()).toBe("connected");
    expect(transports).toHaveLength(1);
    expect(clients).toHaveLength(1);
    const transport = transports[0];
    const client = clients[0];
    expect(transport).toBeDefined();
    expect(client).toBeDefined();
    if (!transport || !client) {
      throw new Error("预期桥接工厂创建传输与客户端实例");
    }
    expect(client.connect).toHaveBeenCalledWith(transport);

    const result = await bridge.invoke("tools.list");
    expect(result).toEqual({
      tools: [
        {
          name: "demo",
          description: "Demo tool",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ]
    });
    expect(client.listTools).toHaveBeenCalledTimes(1);
  });

  it("maps tool invocation to callTool", async () => {
    const { options, clients } = createOptions();
    const bridge = new BridgeClient(options);

    await bridge.connect();
    const payload = { tool: "demo-tool", arguments: { foo: "bar" } };
    const result = await bridge.invoke("tools.invoke", payload);
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "ok"
        }
      ]
    });
    const client = clients[0];
    expect(client).toBeDefined();
    if (!client) {
      throw new Error("预期桥接工厂创建客户端实例");
    }
    expect(client.callTool).toHaveBeenCalledWith({
      name: "demo-tool",
      arguments: { foo: "bar" }
    });
  });

  it("emits bridge:message when transport receives notification", async () => {
    const { options, transports } = createOptions();
    const bridge = new BridgeClient(options);
    const handler = vi.fn();
    bridge.on("bridge:message", handler);

    await bridge.connect();
    const notification = { jsonrpc: "2.0", method: "notifications/ping" } as JSONRPCMessage;
    const transport = transports[0];
    expect(transport).toBeDefined();
    if (!transport) {
      throw new Error("预期桥接工厂创建传输实例");
    }
    transport.onmessage?.(notification);
    expect(handler).toHaveBeenCalledWith({ jsonrpc: "2.0", method: "notifications/ping" });
  });

  it("schedules reconnect when transport closes unexpectedly", async () => {
    vi.useFakeTimers();
    const { options, transports } = createOptions();
    const bridge = new BridgeClient(options);
    await bridge.connect();

    const transport = transports[0];
    expect(transport).toBeDefined();
    if (!transport) {
      throw new Error("预期桥接工厂创建传输实例");
    }
    transport.onclose?.();
    expect(bridge.getState()).toBe("reconnecting");

    vi.advanceTimersByTime(10);
    expect(bridge.getState()).toBe("connecting");
  });
});
