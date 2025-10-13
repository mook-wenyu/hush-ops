import { EventEmitter } from "node:events";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolRequest, ClientCapabilities, ListToolsRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { createLoggerFacade } from "../../shared/logging/logger.js";
import type { BridgeSessionRecord, BridgeSessionRegistry } from "./sessionRegistry.js";
import type {
  BridgeEvent,
  BridgeEventPayloads,
  BridgeOptions,
  BridgeRetryOptions,
  BridgeState,
  JsonRpcResponse
} from "./types.js";

type ToolInvokePayload = {
  tool: string;
  arguments?: Record<string, unknown>;
};

type ClientCallOptions = Parameters<Client["callTool"]>[2];

interface CallToolOptionsInternal {
  meta?: Record<string, unknown>;
  onProgress?: (progress: Record<string, unknown>) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface InternalOptions extends BridgeOptions {
  retry: Required<BridgeRetryOptions>;
  headers: Record<string, string>;
  logger: NonNullable<BridgeOptions["logger"]>;
  capabilities?: ClientCapabilities;
  clientFactory?: (transport: Transport) => Client;
}

const DEFAULT_RETRY: Required<BridgeRetryOptions> = {
  initialDelayMs: 5000,
  multiplier: 2,
  maxDelayMs: 60000,
  maxAttempts: Number.POSITIVE_INFINITY
};

const EVENT_MAP: Record<BridgeState, BridgeEvent> = {
  connecting: "bridge:connecting",
  connected: "bridge:connected",
  disconnected: "bridge:disconnected",
  reconnecting: "bridge:reconnecting"
};


export class BridgeClient extends EventEmitter {
  private readonly endpointUrl: URL;

  private readonly serverKey: string;

  private readonly options: InternalOptions;

  private readonly sessionRegistry?: BridgeSessionRegistry;

  private readonly userId: string;

  private readonly sessionMetadata?: Record<string, unknown>;

  private sessionRecord: BridgeSessionRecord | null;

  private state: BridgeState = "disconnected";

  private transport?: Transport;

  private client?: Client;

  private reconnectTimer?: NodeJS.Timeout;

  private manualClose = false;

  private retryAttempt = 0;

  private connectingPromise: Promise<void> | null = null;

  constructor(options: BridgeOptions) {
    super();
    this.endpointUrl = new URL(options.endpoint);
    this.serverKey = options.serverName ?? this.endpointUrl.toString();
    const logger =
      options.logger ??
      createLoggerFacade("bridge-client", {
        endpoint: this.endpointUrl.toString(),
        server: options.serverName
      });
    const retry: Required<BridgeRetryOptions> = {
      ...DEFAULT_RETRY,
      ...(options.retry ?? {})
    };
    this.options = {
      ...options,
      logger,
      headers: options.headers ?? {},
      retry,
      capabilities: options.capabilities,
      clientFactory: options.clientFactory
    };
    this.sessionRegistry = options.sessionRegistry;
    this.userId = options.userId ?? "default";
    this.sessionMetadata = options.sessionMetadata;
    this.sessionRecord = this.sessionRegistry?.load(this.serverKey, this.userId) ?? null;
  }

  getState(): BridgeState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.state === "connected") {
      return;
    }
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.manualClose = false;
    this.clearReconnectTimer();
    this.setState("connecting");

    this.connectingPromise = this.establishConnection();
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  async disconnect(): Promise<void> {
    this.manualClose = true;
    this.clearReconnectTimer();
    const currentClient = this.client;
    this.client = undefined;
    const currentTransport = this.transport;
    this.transport = undefined;

    try {
      await currentClient?.close();
    } catch (error) {
      this.options.logger.warn("关闭 MCP client 时出现异常", { error });
    }

    if (currentTransport) {
      try {
        if ("terminateSession" in currentTransport && typeof currentTransport.terminateSession === "function") {
          await currentTransport.terminateSession();
        }
      } catch (error) {
        this.options.logger.warn("终止 MCP 会话失败", { error });
      }
      try {
        await currentTransport.close();
      } catch (error) {
        this.options.logger.warn("关闭 MCP transport 时出现异常", { error });
      }
    }

    this.setState("disconnected", { reason: "manual disconnect" });
  }

  async invoke(method: string, params?: unknown): Promise<unknown> {
    const client = await this.ensureClient();
    if (method === "tools.list") {
      return client.listTools(params as ListToolsRequest["params"]);
    }
    if (method === "tools.invoke" || method === "tools.call") {
      const payload = params as ToolInvokePayload | undefined;
      if (!payload?.tool) {
        throw new Error("工具调用缺少 tool 名称");
      }
      return client.callTool({
        name: payload.tool,
        arguments: payload.arguments ?? {}
      });
    }
    if (method === "tools.stream") {
      throw new Error("当前客户端不支持流式工具调用");
    }
    throw new Error(`不支持的 MCP 方法：${method}`);
  }

  private async establishConnection(): Promise<void> {
    this.destroyCurrentConnection();

    const transport = this.createTransport();
    this.transport = transport;

    transport.onclose = () => {
      this.options.logger.warn("MCP transport 已关闭", {
      endpoint: this.endpointUrl.toString()
    });
      this.handleDisconnect("transport closed");
    };
    transport.onerror = (error) => {
      this.emit("bridge:error", { error });
      this.options.logger.error("MCP transport 错误", error, {
        endpoint: this.endpointUrl.toString()
      });
    };
    transport.onmessage = (message) => {
      this.emit("bridge:message", message as JsonRpcResponse);
    };

    const client = this.createClient(transport);

    client.onclose = () => {
      this.options.logger.warn("MCP client 已关闭", {
        endpoint: this.endpointUrl.toString()
      });
      this.handleDisconnect("client closed");
    };
    client.onerror = (error) => {
      this.emit("bridge:error", { error });
      this.options.logger.error("MCP client 错误", error, {
        endpoint: this.endpointUrl.toString()
      });
    };
    client.fallbackNotificationHandler = async (notification) => {
      this.emit("bridge:message", notification);
    };

    try {
      await client.connect(transport);
    } catch (error) {
      this.options.logger.error("MCP 连接失败", error);
      this.handleDisconnect("connect error");
      throw error;
    }

    this.client = client;
    this.retryAttempt = 0;
    this.setState("connected");
    if (transport instanceof StreamableHTTPClientTransport) {
      this.persistSession({
        sessionId: transport.sessionId,
        metadata: this.sessionMetadata
      });
    } else {
      this.persistSession({ metadata: this.sessionMetadata });
    }
  }

  private createTransport(): Transport {
    if (this.options.transportFactory) {
      return this.options.transportFactory(this.endpointUrl);
    }

    const transport = new StreamableHTTPClientTransport(this.endpointUrl, {
      fetch: this.options.fetch,
      requestInit: {
        headers: this.options.headers
      },
      sessionId: this.sessionRecord?.sessionId
    });
    return transport;
  }

  private createClient(transport: Transport): Client {
    if (this.options.clientFactory) {
      return this.options.clientFactory(transport);
    }

    const capabilities = this.options.capabilities ?? {};
    const client = new Client(
      {
        name: "hush-ops-bridge",
        version: "1.0.0"
      },
      {
        capabilities
      }
    );
    return client;
  }

  private buildRequestOptions(options?: CallToolOptionsInternal): ClientCallOptions | undefined {
    if (!options) {
      return undefined;
    }
    const requestOptions: ClientCallOptions = {};
    let hasOption = false;
    if (typeof options.timeoutMs === "number") {
      requestOptions.timeout = options.timeoutMs;
      hasOption = true;
    }
    if (options.signal) {
      requestOptions.signal = options.signal;
      hasOption = true;
    }
    if (options.onProgress) {
      requestOptions.onprogress = options.onProgress;
      requestOptions.resetTimeoutOnProgress = true;
      hasOption = true;
    }
    return hasOption ? requestOptions : undefined;
  }

  async callTool(payload: ToolInvokePayload, options?: CallToolOptionsInternal): Promise<unknown> {
    const client = await this.ensureClient();
    const params: CallToolRequest["params"] = {
      name: payload.tool,
      arguments: payload.arguments ?? {}
    };
    const metaEntries = options?.meta
      ? Object.entries(options.meta).filter(([, value]) => value !== undefined && value !== null)
      : [];
    if (metaEntries.length > 0) {
      params._meta = Object.fromEntries(metaEntries);
    }
    const requestOptions = this.buildRequestOptions(options);
    return client.callTool(params, undefined, requestOptions);
  }

  private setState(next: BridgeState, payload?: BridgeEventPayloads[BridgeEvent]) {
    if (this.state === next) {
      return;
    }
    this.state = next;
    const event = EVENT_MAP[next];
    this.emit(event, payload as unknown);
  }

  private handleDisconnect(reason?: string) {
    this.destroyCurrentConnection();
    if (this.manualClose) {
      this.setState("disconnected", { reason });
      if (this.sessionRecord?.sessionId) {
        this.persistSession({});
      }
      return;
    }
    this.setState("disconnected", { reason });
    if (this.sessionRecord?.sessionId) {
      this.persistSession({});
    }
    this.scheduleReconnect();
  }

  private destroyCurrentConnection() {
    if (this.transport) {
      this.transport.onclose = undefined;
      this.transport.onerror = undefined;
      this.transport.onmessage = undefined;
    }
    if (this.client) {
      this.client.onclose = undefined;
      this.client.onerror = undefined;
      this.client.fallbackNotificationHandler = undefined;
    }
    this.transport = undefined;
    this.client = undefined;
  }

  private persistSession(update: Partial<BridgeSessionRecord>) {
    if (!this.sessionRegistry) {
      return;
    }
    const sessionId = update.sessionId ?? this.sessionRecord?.sessionId;
    if (!sessionId) {
      return;
    }
    const record: BridgeSessionRecord = {
      serverName: this.serverKey,
      userId: this.userId,
      sessionId,
      lastEventId: update.lastEventId ?? this.sessionRecord?.lastEventId,
      metadata: update.metadata ?? this.sessionRecord?.metadata ?? this.sessionMetadata,
      updatedAt: new Date().toISOString()
    };
    this.sessionRegistry.save(record);
    this.sessionRecord = record;
  }

  private scheduleReconnect() {
    if (this.manualClose) {
      return;
    }
    const { initialDelayMs, multiplier, maxDelayMs, maxAttempts } = this.options.retry;
    if (this.retryAttempt >= maxAttempts) {
      this.options.logger.warn("达到最大重连次数，停止重试", {
      endpoint: this.endpointUrl.toString(),
      attempts: this.retryAttempt
    });
      return;
    }
    const delay = Math.min(initialDelayMs * Math.pow(multiplier, this.retryAttempt), maxDelayMs);
    this.retryAttempt += 1;

    this.setState("reconnecting", { attempt: this.retryAttempt, delayMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.options.logger.error("重连 MCP 失败，将继续重试", error);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private async ensureClient(): Promise<Client> {
    if (!this.client) {
      await this.connect();
    }
    if (!this.client) {
      throw new Error("MCP Bridge 尚未连接");
    }
    return this.client;
  }
}
