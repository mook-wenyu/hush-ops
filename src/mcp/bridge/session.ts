import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import type { BridgeSecurityHooks, ToolInvocation, BridgeLogger, ToolStreamEvent } from "./types.js";
import type { BridgeClient } from "./bridgeClient.js";
import { createLoggerFacade } from "../../shared/logging/logger.js";

interface BridgeSessionOptions {
  securityHooks?: BridgeSecurityHooks;
  logger?: BridgeLogger;
}

export interface ToolDescriptor {
  name: string;
  description?: string;
  riskLevel?: "low" | "medium" | "high";
}

export class BridgeSession extends EventEmitter {
  constructor(private readonly client: BridgeClient, private readonly options: BridgeSessionOptions = {}) {
    super();
    this.options.logger = this.options.logger ?? createLoggerFacade("bridge-session");
    this.client.on("bridge:connected", () => this.emit("connected"));
    this.client.on("bridge:disconnected", (payload) => this.emit("disconnected", payload));
    this.client.on("bridge:reconnecting", (payload) => this.emit("reconnecting", payload));
    this.client.on("bridge:error", (payload) => this.emit("error", payload));
    this.client.on("bridge:message", (payload) => this.emit("message", payload));
  }

  async listTools(): Promise<ToolDescriptor[]> {
    const result = await this.client.invoke("tools.list");
    if (!result || typeof result !== "object") {
      return [];
    }
    const tools = (result as { tools?: ToolDescriptor[] }).tools;
    this.options.logger?.info("list tools", { count: tools?.length ?? 0 });
    return Array.isArray(tools) ? tools : [];
  }

  async invokeTool(invocation: ToolInvocation): Promise<unknown> {
    const hooks = this.options.securityHooks;
    const correlationId = invocation.options?.correlationId ?? randomUUID();
    const nodeId = invocation.options?.nodeId;
    const executionId = invocation.options?.executionId;
    const planId = invocation.options?.planId;

    const logContext = {
      toolName: invocation.toolName,
      nodeId,
      riskLevel: invocation.options?.riskLevel ?? "low",
      correlationId,
      executionId,
      planId
    } satisfies Record<string, unknown>;

    const emitToolEvent = (
      status: ToolStreamEvent["status"],
      message: string,
      extras: { result?: unknown; error?: string } = {}
    ) => {
      const event: ToolStreamEvent = {
        toolName: invocation.toolName,
        correlationId,
        status,
        timestamp: new Date().toISOString(),
        message,
        nodeId,
        executionId,
        planId,
        result: extras.result,
        error: extras.error
      };
      this.emit("tool-stream", event);
    };

    this.options.logger?.info("invoke tool start", logContext);
    emitToolEvent("start", `开始调用 ${invocation.toolName}`);

    hooks?.onToolInvoke?.({
      toolName: invocation.toolName,
      nodeId,
      arguments: invocation.arguments
    });

    if (invocation.options?.riskLevel === "high") {
      hooks?.onRiskyTool?.({
        toolName: invocation.toolName,
        nodeId,
        arguments: invocation.arguments,
        riskLevel: invocation.options.riskLevel
      });
    }

    const baseCallOptions = {
      meta: {
        correlationId,
        executionId,
        planId,
        nodeId,
        riskLevel: invocation.options?.riskLevel
      },
      timeoutMs: invocation.options?.timeoutMs
    };

    try {
      const result = await this.client.callTool(
        {
          tool: invocation.toolName,
          arguments: invocation.arguments
        },
        baseCallOptions
      );
      const summary = this.formatResultSummary(result) ?? "工具调用完成";
      emitToolEvent("success", summary, { result });
      this.options.logger?.info("invoke tool success", logContext);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitToolEvent("error", message, { error: message });
      this.options.logger?.error("invoke tool failed", error, logContext);
      throw error;
    }
  }

  private formatResultSummary(result: unknown): string | null {
    if (result === null || typeof result === "undefined") {
      return "(无返回结果)";
    }
    if (typeof result === "string") {
      return result;
    }
    if (typeof result === "number" || typeof result === "boolean") {
      return String(result);
    }
    try {
      return JSON.stringify(result, null, 2);
    } catch (error) {
      return `[无法序列化结果]: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  getState() {
    return this.client.getState();
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}
