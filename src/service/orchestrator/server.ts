import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import { OrchestratorController } from "./controller.js";
import type { ExecutePlanRequest, ValidationRequest, ManualApprovalRequestInput } from "./controller.js";
import {
  ORCHESTRATOR_EVENT_TOPICS,
  type OrchestratorEventTopic,
  type OrchestratorSubscriptionMessage
} from "./types.js";
import type { LogsAppendedPayload } from "../../shared/logging/events.js";
import { setLogEventPublisher, createLoggerFacade } from "../../shared/logging/logger.js";
import { listMcpServers } from "../../mcp/config/loader.js";
import {
  EventEnvelopeSchema,
  EventNameSchema,
  EventPayloadSchemaMap
} from "./eventSchema.js";
import type { EventName } from "./eventSchema.js";

export interface OrchestratorServiceOptions {
  readonly basePath?: string;
  readonly controller?: OrchestratorController;
  readonly controllerOptions?: ConstructorParameters<typeof OrchestratorController>[0];
}

interface ValidateBody {
  plan?: unknown;
}

interface ExecuteBody extends ValidateBody {
  useMockBridge?: boolean;
  databasePath?: string;
  mcpServer?: string;
}

interface ApprovalDecisionBody {
  decision?: string;
  comment?: string;
  decidedBy?: string;
}

interface McpQuery {
  useMockBridge?: string | boolean;
  mcpServer?: string;
}

interface McpCallBody {
  arguments?: Record<string, unknown>;
  nodeId?: string;
  riskLevel?: "low" | "medium" | "high";
  useMockBridge?: boolean;
  mcpServer?: string;
}

interface ToolStreamParams {
  id: string;
}

interface ToolStreamDetailParams extends ToolStreamParams {
  correlationId: string;
}

interface ClientConnection {
  readonly socket: WebSocket;
  readonly topics: Set<OrchestratorEventTopic>;
}

type TopicsInput = string | string[] | undefined;

const ALL_TOPICS = new Set<OrchestratorEventTopic>(ORCHESTRATOR_EVENT_TOPICS);
const eventLogger = createLoggerFacade("event-bus");
export const EVENT_BUS_MAX_BUFFER_BYTES = (() => {
  const configured = Number(process.env.EVENT_BUS_MAX_BUFFER_BYTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 262_144;
})();

function isValidTopic(value: string): value is OrchestratorEventTopic {
  return (ORCHESTRATOR_EVENT_TOPICS as readonly string[]).includes(value);
}

function parseBoolean(value: string | boolean | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") {
      return true;
    }
    if (value === "0" || value.toLowerCase() === "false") {
      return false;
    }
  }
  return undefined;
}

function parseTopicsParam(param: TopicsInput): Set<OrchestratorEventTopic> {
  if (!param) {
    return new Set(ALL_TOPICS);
  }
  const values = Array.isArray(param) ? param : param.split(",");
  const topics = new Set<OrchestratorEventTopic>();
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (isValidTopic(trimmed)) {
      topics.add(trimmed);
    }
  }
  return topics.size > 0 ? topics : new Set(ALL_TOPICS);
}

function resolveEventTopics(event: string): OrchestratorEventTopic[] {
  if (event === "runtime.state-change") {
    return ["runtime", "bridge"];
  }
  if (event.startsWith("runtime.")) {
    return ["runtime"];
  }
  if (event.startsWith("execution.")) {
    return ["execution"];
  }
  if (event.startsWith("approval.")) {
    return ["approvals"];
  }
  if (event.startsWith("bridge.")) {
    return ["bridge"];
  }
  if (event.startsWith("logs.")) {
    return ["logs"];
  }
  return ["system"];
}

type EventMessageResult =
  | { success: true; message: string; topics: OrchestratorEventTopic[]; eventName: EventName }
  | { success: false };

export function buildEventMessage(
  event: string,
  payload: unknown,
  executionId?: string,
  topicsOverride?: OrchestratorEventTopic[]
): EventMessageResult {
  const topics = topicsOverride ?? resolveEventTopics(event);
  const eventNameResult = EventNameSchema.safeParse(event);
  if (!eventNameResult.success) {
    eventLogger.error("未知事件类型", {
      event,
      issues: eventNameResult.error.flatten()
    });
    return { success: false };
  }
  const eventName = eventNameResult.data as EventName;
  const payloadSchema = EventPayloadSchemaMap[eventName];
  const payloadResult = payloadSchema.safeParse(payload);
  if (!payloadResult.success) {
    eventLogger.error("事件 payload 校验失败", {
      event: eventName,
      executionId,
      issues: payloadResult.error.flatten()
    });
    return { success: false };
  }
  const envelopeResult = EventEnvelopeSchema.safeParse({
    event: eventName,
    payload: payloadResult.data,
    executionId,
    topics,
    timestamp: new Date().toISOString()
  });
  if (!envelopeResult.success) {
    eventLogger.error("事件 envelope 校验失败", {
      event: eventName,
      executionId,
      issues: envelopeResult.error.flatten()
    });
    return { success: false };
  }
  return {
    success: true,
    message: JSON.stringify(envelopeResult.data),
    topics: envelopeResult.data.topics,
    eventName
  };
}

function shouldDeliver(topics: OrchestratorEventTopic[], connection: ClientConnection): boolean {
  if (topics.includes("system")) {
    return true;
  }
  if (connection.topics.size === 0) {
    return false;
  }
  return topics.some((topic) => connection.topics.has(topic));
}

function parseSubscriptionMessage(raw: string): OrchestratorSubscriptionMessage | null {
  try {
    const candidate = JSON.parse(raw) as Partial<OrchestratorSubscriptionMessage>;
    if (
      candidate &&
      (candidate.type === "subscribe" || candidate.type === "unsubscribe") &&
      Array.isArray(candidate.topics) &&
      candidate.topics.every((value) => typeof value === "string")
    ) {
      const topics = candidate.topics.filter((value): value is OrchestratorEventTopic =>
        isValidTopic(value)
      );
      return {
        type: candidate.type,
        topics
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function createOrchestratorService(
  options: OrchestratorServiceOptions = {}
): Promise<{
  app: FastifyInstance;
  controller: OrchestratorController;
  publishLogEvent: (payload: LogsAppendedPayload) => void;
}> {
  const basePath = options.basePath ?? "/api/v1";
  const app = Fastify({ logger: false });
  await app.register(websocket);

  const controller =
    options.controller ?? new OrchestratorController(options.controllerOptions ?? {});

  const clients = new Set<ClientConnection>();
  (app as unknown as { __eventBusClients?: Set<ClientConnection> }).__eventBusClients = clients;

  const broadcast = (
    event: string,
    payload: unknown,
    executionId?: string,
    topicsOverride?: OrchestratorEventTopic[]
  ) => {
    const result = buildEventMessage(event, payload, executionId, topicsOverride);
    if (!result.success) {
      return;
    }
    const { message, topics, eventName } = result;
    for (const connection of clients) {
      if (!shouldDeliver(topics, connection) || connection.socket.readyState !== connection.socket.OPEN) {
        continue;
      }
      if (connection.socket.bufferedAmount > EVENT_BUS_MAX_BUFFER_BYTES) {
        recordBackpressureDrop(eventName, connection.socket.bufferedAmount, executionId);
        continue;
      }
      connection.socket.send(message);
    }
  };

  const publishLogEvent = (payload: LogsAppendedPayload) => {
    broadcast("logs.appended", payload, undefined, ["logs"]);
  };

  setLogEventPublisher(publishLogEvent);

  const recordBackpressureDrop = (eventName: EventName, bufferedBytes: number, executionId?: string) => {
    eventLogger.warn("事件被丢弃：背压阈值超出", {
      event: eventName,
      executionId,
      bufferedBytes,
      threshold: EVENT_BUS_MAX_BUFFER_BYTES
    });
  };

  const sendToClient = (
    connection: ClientConnection,
    event: string,
    payload: unknown,
    executionId?: string,
    topicsOverride?: OrchestratorEventTopic[]
  ) => {
    if (connection.socket.readyState !== connection.socket.OPEN) {
      return;
    }
    const result = buildEventMessage(event, payload, executionId, topicsOverride);
    if (!result.success) {
      return;
    }
    if (connection.socket.bufferedAmount > EVENT_BUS_MAX_BUFFER_BYTES) {
      recordBackpressureDrop(result.eventName, connection.socket.bufferedAmount, executionId);
      return;
    }
    connection.socket.send(result.message);
  };

  controller.on("runtime.state-change", ({ executionId, payload }) =>
    broadcast("runtime.state-change", payload, executionId)
  );
  controller.on("runtime.execution-start", ({ executionId, planId }) =>
    broadcast("runtime.execution-start", { planId }, executionId)
  );
  controller.on("runtime.execution-complete", ({ executionId, result }) =>
    broadcast("runtime.execution-complete", result, executionId)
  );
  controller.on("runtime.error", ({ executionId, error }) =>
    broadcast("runtime.error", error, executionId)
  );
  controller.on("runtime.snapshot", ({ executionId, snapshot }) =>
    broadcast("runtime.snapshot", snapshot, executionId)
  );
  controller.on("runtime.tool-stream", ({ executionId, ...payload }) => {
    broadcast("runtime.tool-stream", payload, executionId);
  });
  controller.on("execution.created", ({ executionId, planId }) =>
    broadcast("execution.created", { planId }, executionId)
  );
  controller.on("execution.started", ({ executionId, planId }) =>
    broadcast("execution.started", { planId }, executionId)
  );
  controller.on("execution.completed", ({ executionId, result }) =>
    broadcast("execution.completed", result, executionId)
  );
  controller.on("execution.failed", ({ executionId, error }) =>
    broadcast("execution.failed", { message: error }, executionId)
  );
  controller.on("execution.cancelled", ({ executionId, planId }) =>
    broadcast("execution.cancelled", { planId }, executionId)
  );
  controller.on("approval.pending", ({ executionId, entry }) =>
    broadcast("approval.pending", entry, executionId)
  );
  controller.on("approval.updated", ({ executionId, entry }) =>
    broadcast("approval.updated", entry, executionId)
  );
  controller.on("bridge.state-change", ({ executionId, state, meta }) =>
    broadcast("bridge.state-change", { state, meta }, executionId)
  );

  const validateRoute = `${basePath}/plans/validate`;
  const executeRoute = `${basePath}/plans/execute`;
  const executionsRoute = `${basePath}/executions`;
  const approvalsRoute = `${basePath}/approvals`;
  const stopRoute = `${executionsRoute}/:id/stop`;
  const toolStreamsRoute = `${executionsRoute}/:id/tool-streams`;
  const mcpServersRoute = `${basePath}/mcp/servers`;
  const mcpToolsRoute = `${basePath}/mcp/tools`;

  app.get(mcpServersRoute, async () => {
    const servers = await listMcpServers().catch(() => []);
    return {
      servers: servers.map((server) => ({
        name: server.name,
        description: server.description ?? undefined
      }))
    };
  });

  app.get(mcpToolsRoute, async (request, reply) => {
    const query = request.query as McpQuery | undefined;
    const useMockBridge = parseBoolean(query?.useMockBridge);
    try {
      const tools = await controller.listMcpTools({
        useMockBridge,
        mcpServer: typeof query?.mcpServer === "string" ? query.mcpServer : undefined
      });
      return { tools };
    } catch (error) {
      reply.code(502);
      const message = error instanceof Error ? error.message : String(error);
      return { error: { code: "mcp_list_failed", message } };
    }
  });

  app.post(`${mcpToolsRoute}/:toolName`, async (request, reply) => {
    const { toolName } = request.params as { toolName: string };
    const body = request.body as McpCallBody | undefined;
    try {
      const result = await controller.callMcpTool({
        toolName,
        arguments: body?.arguments,
        nodeId: body?.nodeId,
        riskLevel: body?.riskLevel,
        useMockBridge: body?.useMockBridge,
        mcpServer: body?.mcpServer
      });
      return { result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.code(502);
      return { error: { code: "mcp_call_failed", message } };
    }
  });

  app.post(validateRoute, async (request, reply) => {
    const body = request.body as ValidateBody;
    if (!body?.plan) {
      reply.code(400);
      return { error: { code: "bad_request", message: "plan 字段必填" } };
    }
    try {
      const result = await controller.validate({ plan: body.plan } as ValidationRequest);
      return result;
    } catch (error) {
      reply.code(422);
      const message = error instanceof Error ? error.message : String(error);
      return { error: { code: "plan_validation_failed", message } };
    }
  });

  app.post(executeRoute, async (request, reply) => {
    const body = request.body as ExecuteBody;
    if (!body?.plan) {
      reply.code(400);
      return { error: { code: "bad_request", message: "plan 字段必填" } };
    }
    try {
      const record = await controller.execute(body as ExecutePlanRequest);
      return {
        executionId: record.id,
        status: record.status,
        planId: record.planId
      };
    } catch (error) {
      reply.code(500);
      const message = error instanceof Error ? error.message : String(error);
      return { error: { code: "execution_failed", message } };
    }
  });

  app.get(executionsRoute, async () => {
    return { executions: controller.listExecutions() };
  });

  app.post(stopRoute, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const record = await controller.stopExecution(id);
      return { execution: record };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("找不到执行")) {
        reply.code(404);
        return { error: { code: "execution_not_found", message } };
      }
      reply.code(422);
      return { error: { code: "execution_stop_failed", message } };
    }
  });

  app.get(`${executionsRoute}/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = controller.getExecution(id);
    if (!record) {
      reply.code(404);
      return { error: { code: "execution_not_found", message: `未找到执行 ${id}` } };
    }
    return record;
  });

  app.get(toolStreamsRoute, async (request, reply) => {
    const { id } = request.params as ToolStreamParams;
    const record = controller.getExecution(id);
    if (!record) {
      reply.code(404);
      return { error: { code: "execution_not_found", message: `未找到执行 ${id}` } };
    }
    const streams = controller.listToolStreamSummaries(id).map((stream) => ({
      correlationId: stream.correlationId,
      toolName: stream.toolName,
      executionId: stream.executionId ?? undefined,
      planId: stream.planId ?? undefined,
      nodeId: stream.nodeId ?? undefined,
      chunkCount: stream.chunkCount,
      latestSequence: stream.latestSequence,
      updatedAt: stream.updatedAt,
      completed: stream.completed,
      hasError: stream.hasError
    }));
    return { streams };
  });

  app.get(`${toolStreamsRoute}/:correlationId`, async (request, reply) => {
    const { id, correlationId } = request.params as ToolStreamDetailParams;
    const record = controller.getExecution(id);
    if (!record) {
      reply.code(404);
      return { error: { code: "execution_not_found", message: `未找到执行 ${id}` } };
    }
    const chunks = controller.getToolStreamChunks(id, correlationId).map((chunk) => ({
      toolName: chunk.toolName,
      message: chunk.message,
      timestamp: chunk.timestamp,
      status: chunk.status,
      correlationId: chunk.correlationId,
      executionId: chunk.executionId ?? undefined,
      planId: chunk.planId ?? undefined,
      nodeId: chunk.nodeId ?? undefined,
      error: chunk.error ?? undefined,
      sequence: chunk.sequence,
      storedAt: chunk.storedAt,
      source: chunk.source ?? undefined
    }));
    return { chunks };
  });

  app.post(`${toolStreamsRoute}/:correlationId/replay`, async (request, reply) => {
    const { id, correlationId } = request.params as ToolStreamDetailParams;
    const record = controller.getExecution(id);
    if (!record) {
      reply.code(404);
      return { error: { code: "execution_not_found", message: `未找到执行 ${id}` } };
    }
    const replayed = controller.replayToolStream(id, correlationId);
    if (replayed === 0) {
      reply.code(404);
      return { error: { code: "tool_stream_not_found", message: `未找到流式输出 ${correlationId}` } };
    }
    return { replayed };
  });

  app.get(`${basePath}/status`, async () => {
    const snapshots = controller.listExecutionSnapshots();
    const latest = snapshots[0] ?? null;
    return {
      status: "ok",
      executions: snapshots.length,
      latestSnapshot: latest,
      snapshots
    };
  });

  app.get(`${approvalsRoute}/pending`, async () => {
    const approvals = await controller.listPendingApprovals();
    return { approvals };
  });

  app.post(`${approvalsRoute}/request`, async (request, reply) => {
    const body = request.body as ManualApprovalRequestInput | undefined;
    if (!body) {
      reply.code(400);
      return { error: { code: "bad_request", message: "请求体不能为空" } };
    }
    if (!body.executionId && (!body.planId || !body.nodeId)) {
      reply.code(400);
      return {
        error: {
          code: "bad_request",
          message: "缺少 executionId 或 planId/nodeId 信息"
        }
      };
    }
    try {
      const approval = await controller.requestApproval(body);
      reply.code(201);
      return { approval };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.code(500);
      return { error: { code: "approval_request_failed", message } };
    }
  });

  app.post(`${approvalsRoute}/:id/decision`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as ApprovalDecisionBody | undefined;
    const decision = body?.decision;
    if (decision !== "approved" && decision !== "rejected") {
      reply.code(400);
      return { error: { code: "bad_request", message: "decision 必须为 approved 或 rejected" } };
    }
    try {
      const approval = await controller.recordApprovalDecision({
        id,
        decision,
        comment: body?.comment,
        decidedBy: body?.decidedBy ?? "web-ui"
      });
      return { approval };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("找不到待审批项")) {
        reply.code(404);
        return { error: { code: "approval_not_found", message } };
      }
      reply.code(422);
      return { error: { code: "approval_update_failed", message } };
    }
  });

  app.get("/ws", { websocket: true }, (socketConnection, request) => {
    const clientSocket = socketConnection.socket as WebSocket;
    const query = (request as FastifyRequest).query as { topics?: TopicsInput } | undefined;
    const topics = parseTopicsParam(query?.topics);
    const connection: ClientConnection = {
      socket: clientSocket,
      topics
    };
    clients.add(connection);
    sendToClient(connection, "service.connected", {
      message: "connected",
      topics: Array.from(connection.topics)
    }, undefined, ["system"]);
    clientSocket.on("message", (buffer) => {
      const message = parseSubscriptionMessage(buffer.toString());
      if (!message) {
        sendToClient(connection, "service.error", {
          message: "无法解析订阅指令"
        }, undefined, ["system"]);
        return;
      }
      if (message.topics.length === 0) {
        sendToClient(connection, "service.error", {
          message: "订阅主题列表为空或无效"
        }, undefined, ["system"]);
        return;
      }
      if (message.type === "subscribe") {
        for (const topic of message.topics) {
          connection.topics.add(topic);
        }
      } else {
        for (const topic of message.topics) {
          connection.topics.delete(topic);
        }
      }
      sendToClient(connection, "service.topics-updated", {
        topics: Array.from(connection.topics)
      }, undefined, ["system"]);
    });
    clientSocket.on("close", () => {
      clients.delete(connection);
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: {
        code: error.code ?? "internal_error",
        message: error.message
      }
    });
  });

  app.addHook("onClose", async () => {
    controller.close();
  });

  return { app, controller, publishLogEvent };
}
