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
      const event: any = {
        toolName: invocation.toolName,
        correlationId,
        status,
        timestamp: new Date().toISOString(),
        message
      };
      if (nodeId) event.nodeId = nodeId;
      if (executionId) event.executionId = executionId;
      if (planId) event.planId = planId;
      if (typeof extras.result !== "undefined") event.result = extras.result;
      if (typeof extras.error === "string") event.error = extras.error;
      this.emit("tool-stream", event as ToolStreamEvent);
    };

    this.options.logger?.info("invoke tool start", logContext);
    emitToolEvent("start", `开始调用 ${invocation.toolName}`);

    {
      const payload: any = { toolName: invocation.toolName };
      if (nodeId) payload.nodeId = nodeId;
      if (typeof invocation.arguments !== "undefined") payload.arguments = invocation.arguments;
      hooks?.onToolInvoke?.(payload);
    }

    if (invocation.options?.riskLevel === "high") {
      const riskyPayload: any = {
        toolName: invocation.toolName,
        riskLevel: invocation.options.riskLevel
      };
      if (nodeId) riskyPayload.nodeId = nodeId;
      if (typeof invocation.arguments !== "undefined") riskyPayload.arguments = invocation.arguments;
      hooks?.onRiskyTool?.(riskyPayload);
    }

    const baseCallOptions: any = { meta: { correlationId } };
    if (executionId) (baseCallOptions.meta as any).executionId = executionId;
    if (planId) (baseCallOptions.meta as any).planId = planId;
    if (nodeId) (baseCallOptions.meta as any).nodeId = nodeId;
    if (invocation.options?.riskLevel) (baseCallOptions.meta as any).riskLevel = invocation.options.riskLevel;
    if (typeof invocation.options?.timeoutMs === "number") baseCallOptions.timeoutMs = invocation.options.timeoutMs;

    try {
      const callPayload: any = { tool: invocation.toolName };
      if (typeof invocation.arguments !== "undefined") callPayload.arguments = invocation.arguments;
      const result = await this.client.callTool(
        callPayload,
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
