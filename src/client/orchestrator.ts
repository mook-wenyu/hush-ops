import { EventEmitter } from "node:events";
import { URL } from "node:url";

import WebSocket from "ws";

import type { ExecutionRecord, ExecutionSnapshot } from "../service/orchestrator/controller.js";
import type {
  OrchestratorEventTopic,
  OrchestratorEventEnvelope,
  OrchestratorSubscriptionMessage,
  ToolStreamSummaryPayload,
  RuntimeToolStreamPayload
} from "../service/orchestrator/types.js";

export interface OrchestratorClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly WebSocketImpl?: typeof WebSocket;
}

export interface ExecutePlanPayload {
  readonly plan: unknown;
  readonly useMockBridge?: boolean;
  readonly databasePath?: string;
  readonly mcpServer?: string;
}

export interface ExecutePlanResponse {
  readonly executionId: string;
  readonly status: string;
  readonly planId: string;
}

export interface ValidatePlanResponse {
  readonly planId: string;
  readonly warnings: string[];
}

export interface EventStream {
  readonly emitter: EventEmitter;
  subscribe(topics: OrchestratorEventTopic[]): void;
  unsubscribe(topics: OrchestratorEventTopic[]): void;
  close(): void;
}

export interface ConnectEventsOptions {
  readonly topics?: OrchestratorEventTopic[];
}

export interface ServiceStatusSummary {
  readonly status: string;
  readonly executions: number;
  readonly latestSnapshot: ExecutionSnapshot | null;
  readonly snapshots: ExecutionSnapshot[];
}

export type ToolStreamSummary = ToolStreamSummaryPayload;

export type ToolStreamChunk = RuntimeToolStreamPayload;

export class OrchestratorClient {
  private readonly baseUrl: string;

  private readonly fetchImpl: typeof fetch;

  private readonly WebSocketImpl: typeof WebSocket;

  constructor(options: OrchestratorClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  }

  async validatePlan(plan: unknown): Promise<ValidatePlanResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/plans/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan })
    });
    if (!response.ok) {
      throw new Error(`Plan 校验失败 (${response.status})`);
    }
    return (await response.json()) as ValidatePlanResponse;
  }

  async executePlan(payload: ExecutePlanPayload): Promise<ExecutePlanResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/plans/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(body.error?.message ?? `执行计划失败 (${response.status})`);
    }
    return (await response.json()) as ExecutePlanResponse;
  }

  async getExecution(id: string): Promise<ExecutionRecord> {
    const response = await this.fetchImpl(`${this.baseUrl}/executions/${id}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(body.error?.message ?? `获取执行失败 (${response.status})`);
    }
    return (await response.json()) as ExecutionRecord;
  }

  async listExecutions(): Promise<ExecutionRecord[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/executions`);
    if (!response.ok) {
      throw new Error(`获取执行列表失败 (${response.status})`);
    }
    const body = (await response.json()) as { executions: ExecutionRecord[] };
    return body.executions;
  }

  async getStatusSummary(): Promise<ServiceStatusSummary> {
    const response = await this.fetchImpl(`${this.baseUrl}/status`);
    if (!response.ok) {
      throw new Error(`获取服务状态失败 (${response.status})`);
    }
    return (await response.json()) as ServiceStatusSummary;
  }

  async stopExecution(id: string): Promise<ExecutionRecord> {
    const response = await this.fetchImpl(`${this.baseUrl}/executions/${encodeURIComponent(id)}/stop`, {
      method: "POST"
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `停止执行失败 (${response.status})`);
    }
    const body = (await response.json()) as { execution: ExecutionRecord };
    return body.execution;
  }

  async listToolStreams(executionId: string): Promise<ToolStreamSummary[]> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/executions/${encodeURIComponent(executionId)}/tool-streams`
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `获取流式输出摘要失败 (${response.status})`);
    }
    const payload = (await response.json()) as { streams?: ToolStreamSummary[] };
    return payload.streams ?? [];
  }

  async getToolStreamChunks(executionId: string, correlationId: string): Promise<ToolStreamChunk[]> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/executions/${encodeURIComponent(executionId)}/tool-streams/${encodeURIComponent(correlationId)}`
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `获取流式输出明细失败 (${response.status})`);
    }
    const payload = (await response.json()) as { chunks?: ToolStreamChunk[] };
    return payload.chunks ?? [];
  }

  async replayToolStream(executionId: string, correlationId: string): Promise<number> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/executions/${encodeURIComponent(executionId)}/tool-streams/${encodeURIComponent(correlationId)}/replay`,
      { method: "POST" }
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `重放流式输出失败 (${response.status})`);
    }
    const payload = (await response.json()) as { replayed: number };
    return payload.replayed;
  }

  connectEvents(options: ConnectEventsOptions = {}): EventStream {
    const wsUrl = new URL(this.baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.pathname = "/ws";
    if (options.topics?.length) {
      wsUrl.searchParams.set("topics", options.topics.join(","));
    }
    const socket = new (this.WebSocketImpl as typeof WebSocket)(wsUrl.toString());
    const emitter = new EventEmitter();
    socket.on("message", (data) => {
      try {
        const envelope = JSON.parse(data.toString()) as OrchestratorEventEnvelope;
        emitter.emit(envelope.event, envelope.payload, envelope);
      } catch (error) {
        emitter.emit("error", error);
      }
    });
    socket.on("error", (error) => emitter.emit("error", error));
    socket.on("close", () => emitter.emit("close"));
    return {
      emitter,
      subscribe(topics) {
        if (!topics.length) {
          return;
        }
        const message: OrchestratorSubscriptionMessage = { type: "subscribe", topics };
        socket.send(JSON.stringify(message));
      },
      unsubscribe(topics) {
        if (!topics.length) {
          return;
        }
        const message: OrchestratorSubscriptionMessage = { type: "unsubscribe", topics };
        socket.send(JSON.stringify(message));
      },
      close() {
        socket.close();
      }
    };
  }
}
