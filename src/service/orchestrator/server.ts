
// TypeScript: enable strict typing; previously used @ts-nocheck for rapid iteration but now removed.
import fastify from "fastify";

import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
// 类型仅作开发期提示，不影响运行时

import type { WebSocket } from "ws";

import { OrchestratorController } from "./controller.js";
import type { ExecutePlanRequest, ValidationRequest } from "./controller.js";
import {
  ORCHESTRATOR_EVENT_TOPICS,
  type OrchestratorEventTopic,
  type OrchestratorSubscriptionMessage
} from "./types.js";
import type { LogsAppendedPayload } from "../../shared/logging/events.js";
import { setLogEventPublisher, createLoggerFacade } from "../../shared/logging/logger.js";
import {
  EventEnvelopeSchema,
  EventNameSchema,
  EventPayloadSchemaMap
} from "./eventSchema.js";
import type { EventName } from "./eventSchema.js";
import { join as pathJoin } from "node:path";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { joinConfigPath } from "../../shared/environment/pathResolver.js";

// 内建调度已删除：不再使用环境开关

export interface OrchestratorServiceOptions {
  readonly basePath?: string;
  readonly controller?: OrchestratorController;
  readonly controllerOptions?: ConstructorParameters<typeof OrchestratorController>[0];
  readonly plansDirectory?: string;
  readonly executionsDirectory?: string;
  readonly databasePath?: string;
}

interface ValidateBody {
  plan?: unknown;
}

interface ExecuteBody extends ValidateBody {
  useMockBridge?: boolean;
  databasePath?: string;
  mcpServer?: string;
}

// —— Request DTOs ——
interface DesignerCompileBody { graph?: { nodes: unknown[]; edges: unknown[] } }
interface DryRunBody { plan?: unknown; fromNode?: string }


interface ClientConnection {
  readonly socket: WebSocket;
  readonly topics: Set<OrchestratorEventTopic>;
}

type TopicsInput = string | string[] | undefined;

const ALL_TOPICS = new Set<OrchestratorEventTopic>(ORCHESTRATOR_EVENT_TOPICS);
const eventLogger = createLoggerFacade("event-bus");
// metrics removed per requirement
export const EVENT_BUS_MAX_BUFFER_BYTES = (() => {
  const configured = Number(process.env.EVENT_BUS_MAX_BUFFER_BYTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 262_144;
})();

// WebSocket 心跳参数（文档约定：15s ping、45s 超时）
export const WS_PING_INTERVAL_MS = 15_000;
export const WS_IDLE_TIMEOUT_MS = 45_000;

// 背压统计（进程级），用于本地/内部可观测
let EVENT_BUS_DROPPED_COUNT = 0;
export function getEventBusStats() {
  return { dropped: EVENT_BUS_DROPPED_COUNT, bufferBytesLimit: EVENT_BUS_MAX_BUFFER_BYTES };
}

function isValidTopic(value: string): value is OrchestratorEventTopic {
  return (ORCHESTRATOR_EVENT_TOPICS as readonly string[]).includes(value);
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

import { registerAgentRoutes } from "./agents/routes.js";
import { plansPlugin } from "./plugins/plans.plugin.js";
import { executionsPlugin } from "./plugins/executions.plugin.js";
import { fsPlugin } from "./plugins/fs.plugin.js";
import { mcpPlugin } from "./plugins/mcp.plugin.js";
import { approvalsPlugin } from "./plugins/approvals.plugin.js";
import { fastifyAwilixPlugin } from "@fastify/awilix";
import { createOrchestratorContainer, resolveController } from "./di/container.js";
import type { AwilixContainer } from "awilix";
import type { OrchestratorCradle } from "./di/container.js";

export async function createOrchestratorService(
  options: OrchestratorServiceOptions = {}
): Promise<{
  app: any;
  controller: OrchestratorController;
  publishLogEvent: (payload: LogsAppendedPayload) => void;
  container: AwilixContainer<OrchestratorCradle>;
}> {
  const basePath = options.basePath ?? "/api/v1";
  const app: any = (fastify as any)({ logger: false });
  await app.register(websocket, {
    options: {
      perMessageDeflate: false,  // 禁用压缩以避免内存碎片化
      maxPayload: 10 * 1024 * 1024,  // 限制最大消息 10MB
      clientTracking: true
    }
  });
  await app.register(multipart);

  // 创建DI容器并传递目录选项（仅在已定义时设置，避免 exactOptionalPropertyTypes 冲突）
  const containerOpts: Parameters<typeof createOrchestratorContainer>[0] = {
    controllerOptions: options.controllerOptions ?? {}
  };
  if (options.plansDirectory !== undefined) {
    (containerOpts as any).plansDirectory = options.plansDirectory;
  }
  if (options.executionsDirectory !== undefined) {
    (containerOpts as any).executionsDirectory = options.executionsDirectory;
  }
  if (options.databasePath !== undefined) {
    (containerOpts as any).databasePath = options.databasePath;
  }
  const container = createOrchestratorContainer(containerOpts);

  // 注册fastify-awilix插件（可选，用于请求级scope）
  await app.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: false, // 我们暂时不需要请求级依赖
    asyncInit: false,
    asyncDispose: true,
    eagerInject: false
  });

  // 从DI容器解析Controller和Repositories
  const controller = options.controller ?? resolveController(container);
  const plansRepository = container.resolve("plansRepository");
  const executionsRepository = container.resolve("executionsRepository");

  // 注册 Plans、Executions、FS、MCP 和 Approvals 插件
  await app.register(plansPlugin, { repository: plansRepository });
  await app.register(executionsPlugin, { repository: executionsRepository, controller });
  await app.register(fsPlugin);
  await app.register(mcpPlugin, { controller });
  await app.register(approvalsPlugin, { controller });

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
    EVENT_BUS_DROPPED_COUNT += 1;
    eventLogger.warn("事件被丢弃：背压阈值超出", {
      event: eventName,
      executionId,
      bufferedBytes,
      threshold: EVENT_BUS_MAX_BUFFER_BYTES,
      droppedCount: EVENT_BUS_DROPPED_COUNT
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
  controller.on("runtime.execution-start", ({ executionId, planId }) => {
    broadcast("runtime.execution-start", { planId }, executionId);
  });
  controller.on("runtime.execution-complete", ({ executionId, result }) => {
    broadcast("runtime.execution-complete", result, executionId);
  });
  controller.on("runtime.error", ({ executionId, error }) => {
    // 在错误情况下无法可靠获知 planId，这里仅广播
    broadcast("runtime.error", error, executionId);
  });
  controller.on("execution.cancelled", ({ executionId, planId }) => {
    // 广播保留
    broadcast("execution.cancelled", { planId }, executionId);
  });
  controller.on("runtime.snapshot", ({ executionId, snapshot }) =>
    broadcast("runtime.snapshot", snapshot, executionId)
  );
  controller.on("runtime.tool-stream", ({ executionId, ...payload }) => {
    broadcast("runtime.tool-stream", payload, executionId);
  });
  controller.on("execution.created", ({ executionId, planId }) => {
    broadcast("execution.created", { planId }, executionId);
  });
  controller.on("execution.started", ({ executionId, planId }) =>
    broadcast("execution.started", { planId }, executionId)
  );
  controller.on("execution.completed", ({ executionId, result }) => {
    broadcast("execution.completed", result, executionId);
  });
  controller.on("execution.failed", ({ executionId, error }) => {
    broadcast("execution.failed", { message: error }, executionId);
  });
  controller.on("execution.cancelled", ({ executionId, planId }) => {
    broadcast("execution.cancelled", { planId }, executionId);
  });
  controller.on("approval.pending", ({ executionId, entry }) => {
    broadcast("approval.pending", entry, executionId);
  });
  controller.on("approval.updated", ({ executionId, entry }) => {
    broadcast("approval.updated", entry, executionId);
  });
  controller.on("bridge.state-change", ({ executionId, state, meta }) =>
    broadcast("bridge.state-change", { state, meta }, executionId)
  );

  const validateRoute = `${basePath}/plans/validate`;
  const executeRoute = `${basePath}/plans/execute`;
  const toolStreamsGlobalRoute = `${basePath}/tool-streams`;
  const examplesRoute = `${basePath}/plans/examples`;
  const designerCompileRoute = `${basePath}/designer/compile`;
  const planDryRunRoute = `${basePath}/plans/dry-run`;
  const systemEventBusRoute = `${basePath}/system/event-bus`;

  // —— Plans Store（配置目录 .hush-ops/config/plans）——
  async function getPlansDir(): Promise<string> {
    const dir = joinConfigPath("plans");
    await mkdir(dir, { recursive: true });
    return dir;
  }
  function sanitizeId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  }
  async function writePlanFile(filePath: string, plan: unknown): Promise<void> {
    const json = JSON.stringify(plan, null, 2);
    await writeFile(filePath, json, "utf-8");
  }

  // —— 通用 FS 辅助（已迁移至 plugins/fs.plugin.ts）——

  // 注册 Agents 路由
  try { registerAgentRoutes(app as any, basePath, controller); } catch {}

  // —— MCP 路由 —— (Migrated to plugins/mcp.plugin.ts)

  // —— Example Plans ——
  app.get(examplesRoute, async () => {
    const repoExamplesDir = pathJoin(process.cwd(), "plans", "examples");
    try {
      const files = await readdir(repoExamplesDir);
      const examples: Array<{ name: string; plan: unknown }> = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const raw = await readFile(pathJoin(repoExamplesDir, f), 'utf-8');
        try { examples.push({ name: f.replace(/\.json$/i, ''), plan: JSON.parse(raw) }); } catch {}
      }
      return { examples };
    } catch {
      return { examples: [] };
    }
  });

  app.post(`${examplesRoute}/:name/import`, async (
    request: { params: { name: string } },
    reply: any
  ) => {
    const { name } = request.params;
    const repoExamplesDir = pathJoin(process.cwd(), "plans", "examples");
    const filePath = pathJoin(repoExamplesDir, `${name}.json`);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const plan = JSON.parse(raw);
      const dir = await getPlansDir();
      const id = (plan?.id && typeof plan.id === 'string') ? plan.id : name;
      const safeId = sanitizeId(id);
      await writePlanFile(pathJoin(dir, `${safeId}.json`), { ...plan, id: safeId });
      reply.code(201);
      return { id: safeId };
    } catch (error) {
      reply.code(404);
      const message = error instanceof Error ? error.message : String(error);
      return { error: { code: 'example_not_found', message } };
    }
  });

  // —— Designer 编译（Graph -> Plan + 诊断）——
  app.post(designerCompileRoute, async (request: { body: DesignerCompileBody }, reply: any) => {
    try {
      const body = request.body;
      const graph = body?.graph;
      if (!graph || !Array.isArray((graph as any).nodes) || !Array.isArray((graph as any).edges)) {
        return { plan: {}, diagnostics: [{ severity: 'error', message: '图结构无效（缺少 nodes/edges）' }] };
      }
      const { graphToPlan } = await import("../../shared/designer/compiler.js");
      const result = graphToPlan(graph as any);
      return { plan: result.plan, diagnostics: result.diagnostics };
    } catch (e) {
      reply.code(500); return { error: { code: 'compile_failed', message: (e as Error).message } };
    }
  });

  // —— Plan dry-run（仅模拟，不触发外部副作用）——
  app.post(planDryRunRoute, async (request: { body: DryRunBody }, reply: any) => {
    try {
      const body = request.body;
      if (!body?.plan) { reply.code(400); return { error: { code: 'bad_request', message: 'plan 字段必填' } }; }
      // 最小模拟：返回静态 timeline（真实实现可接入执行器的 dryRun 分支）
      const now = Date.now();
      const timeline = [
        { t: new Date(now).toISOString(), status: 'start', nodeId: body.fromNode ?? 'entry' },
        { t: new Date(now + 50).toISOString(), status: 'ok', nodeId: body.fromNode ?? 'entry' }
      ];
      return { timeline, warnings: [] };
    } catch (e) {
      reply.code(500); return { error: { code: 'dry_run_failed', message: (e as Error).message } };
    }
  });

  // —— FS（后端统一包装文件/目录操作）—— (Migrated to plugins/fs.plugin.ts)

  // —— Plans CRUD —— (Migrated to plugins/plans.plugin.ts)

  // —— Validate/Execute ——
  app.post(validateRoute, async (
    request: { body?: ValidateBody },
    reply: any
  ) => {
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

  app.post(executeRoute, async (
    request: { body?: ExecuteBody },
    reply: any
  ) => {
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

  // —— Executions Routes —— (Migrated to plugins/executions.plugin.ts)

  // —— Global Tool Streams ——
  app.get(toolStreamsGlobalRoute, async (request: { query?: { executionId?: string; limit?: string; offset?: string; onlyErrors?: string; tool?: string; correlationPrefix?: string; updatedAfter?: string; updatedBefore?: string } }) => {
    const q = request.query ?? {} as any;
    const execId = q.executionId && String(q.executionId);
    const onlyErrors = (q.onlyErrors ?? '0').toString() === '1';
    const tool = (q.tool ?? '').toString().trim().toLowerCase();
    const correlationPrefix = (q.correlationPrefix ?? '').toString();
    const updatedAfter = q.updatedAfter ? new Date(String(q.updatedAfter)) : null;
    const updatedBefore = q.updatedBefore ? new Date(String(q.updatedBefore)) : null;
    const limit = Math.max(0, Math.min(1000, Number(q.limit ?? '0') || 0));
    const offset = Math.max(0, Number(q.offset ?? '0') || 0);
    let streams = controller.listAllToolStreamSummaries({ executionId: execId ?? undefined });
    if (onlyErrors) streams = streams.filter((s) => s.hasError);
    if (tool) streams = streams.filter((s) => (s.toolName ?? '').toLowerCase().includes(tool));
    if (correlationPrefix) streams = streams.filter((s) => s.correlationId.startsWith(correlationPrefix));
    if (updatedAfter && !isNaN(updatedAfter.getTime())) streams = streams.filter((s) => new Date(s.updatedAt) >= updatedAfter!);
    if (updatedBefore && !isNaN(updatedBefore.getTime())) streams = streams.filter((s) => new Date(s.updatedAt) <= updatedBefore!);
    const total = streams.length;
    const items = limit > 0 ? streams.slice(offset, offset + limit) : streams;
    return { total, streams: items };
  });

  app.get(`${toolStreamsGlobalRoute}/:correlationId`, async (request: { params: { correlationId: string } }, reply: any) => {
    const { correlationId } = request.params;
    const chunks = controller.getAllToolStreamChunks(correlationId);
    if (!chunks || chunks.length === 0) {
      reply.code(404);
      return { error: { code: 'tool_stream_not_found', message: `未找到流式输出 ${correlationId}` } };
    }
    return { chunks };
  });

  app.get(`${toolStreamsGlobalRoute}/:correlationId/export`, async (request: { params: { correlationId: string }; query?: { format?: string; compress?: string } }, reply: any) => {
    const { correlationId } = request.params;
    const query = request.query;
    const fmt = (query?.format ?? 'json').toString();
    const compress = (query?.compress ?? '0').toString() === '1';
    const chunks = controller.getAllToolStreamChunks(correlationId);
    if (!chunks || chunks.length === 0) { reply.code(404); return { error: { code: 'tool_stream_not_found', message: `未找到流式输出 ${correlationId}` } }; }
    const filenameBase = `toolstream-${correlationId}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
    let payload = '';
    if (fmt === 'ndjson') {
      payload = chunks.map((c)=> JSON.stringify(c)).join('\n') + '\n';
      reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filenameBase}.ndjson${compress?'.gz':''}"`);
    } else {
      payload = JSON.stringify({ correlationId, chunks }, null, 2) + '\n';
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filenameBase}.json${compress?'.gz':''}"`);
    }
    if (compress) {
      const zlib = await import('node:zlib');
      const gz = zlib.gzipSync(Buffer.from(payload, 'utf-8'));
      reply.header('Content-Encoding', 'gzip');
      return reply.send(gz);
    }
    return reply.send(payload);
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

  // metrics endpoints removed per requirement

  // OpenAPI 概要（简化，构造对象以降低语法风险）
  app.get(`${basePath}/openapi.json`, async () => {
    const doc: any = { openapi: "3.0.0", info: { title: "hush-ops API", version: "1.0.0" }, paths: {}, components: { schemas: {} } };
    const integerParam = (name: string, desc: string) => { const o: any = { name, description: desc, required: false, schema: { type: 'integer', minimum: 0 } }; o["in"] = 'query'; return o; };
    const stringParam = (name: string, desc: string, enumVals?: string[]) => { const o: any = { name, description: desc, required: false, schema: enumVals && enumVals.length ? { type: 'string', enum: enumVals } : { type: 'string' } }; o["in"] = 'query'; return o; };

    // RFC7807 Problem Details schema（文档用，运行时错误结构保持轻量实现）
    doc.components.schemas.Problem = {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'A URI reference that identifies the problem type' },
        title: { type: 'string' },
        status: { type: 'integer' },
        detail: { type: 'string' },
        instance: { type: 'string' }
      },
      required: ['title','status']
    };

    const problemResponses = (examples?: Partial<Record<string, any>>) => ({
      400: { description: 'Bad Request', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' }, examples: examples?.['400'] ? { ex: { value: examples['400'] } } : undefined } } },
      404: { description: 'Not Found', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' }, examples: examples?.['404'] ? { ex: { value: examples['404'] } } : undefined } } },
      422: { description: 'Unprocessable Entity', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' }, examples: examples?.['422'] ? { ex: { value: examples['422'] } } : undefined } } },
      500: { description: 'Internal Error', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' }, examples: examples?.['500'] ? { ex: { value: examples['500'] } } : undefined } } }
    });

    // —— paths ——
    doc.paths[`${basePath}/plans`] = {
      get: { summary: 'List plans', parameters: [integerParam('limit','Max items'), integerParam('offset','Start offset')], responses: { 200: { description: 'OK' }, ...problemResponses() } },
      post: { summary: 'Create plan', responses: { 201: { description: 'Created' }, ...problemResponses({ '400': { title: 'Invalid plan', status: 400, detail: 'plan 字段必填' }, '422': { title: 'Plan create failed', status: 422 } }) } }
    };
    doc.paths[`${basePath}/plans/{id}`] = {
      get: { summary: 'Get plan', responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Plan not found', status: 404 } }) } },
      put: { summary: 'Update plan', responses: { 200: { description: 'OK' }, ...problemResponses({ '400': { title: 'Invalid payload', status: 400 }, '422': { title: 'Plan update failed', status: 422 } }) } },
      delete: { summary: 'Delete plan', responses: { 204: { description: 'No Content' }, ...problemResponses({ '404': { title: 'Plan not found', status: 404 } }) } }
    };
    doc.paths[`${basePath}/plans/{id}/execute`] = { post: { summary: 'Execute plan by id', responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Plan not found', status: 404 }, '500': { title: 'Execution failed', status: 500 } }) } } };

    // 已移除内建调度：不再暴露 /schedules 相关路径

    doc.paths[`${basePath}/executions`] = { get: { summary: 'List executions', parameters: [integerParam('limit','Max items'), integerParam('offset','Start offset')], responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/executions/{id}`] = { get: { summary: 'Get execution', responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Execution not found', status: 404 } }) } } };
    doc.paths[`${basePath}/executions/{id}/tool-streams`] = { get: { summary: 'List tool streams', responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Execution not found', status: 404 } }) } } };
    doc.paths[`${basePath}/executions/{id}/tool-streams/{correlationId}`] = { get: { summary: 'Get tool stream chunks', responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Not found', status: 404 } }) } } };
    doc.paths[`${basePath}/executions/{id}/tool-streams/{correlationId}/export`] = { get: { summary: 'Export tool stream', parameters: [ stringParam('format','json|ndjson',["json","ndjson"]), integerParam('compress','0|1') ], responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Tool stream not found', status: 404 } }) } } };
    doc.paths[`${basePath}/executions/{id}/tool-streams/{correlationId}/replay`] = { post: { summary: 'Replay tool stream', responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Tool stream not found', status: 404 } }) } } };

    // Global Tool Streams
    doc.paths[`${basePath}/tool-streams`] = { get: { summary: 'List tool streams (global)', parameters: [ stringParam('executionId','filter by execution'), integerParam('limit','Max items'), integerParam('offset','Start offset'), stringParam('onlyErrors','1 to filter errors',['0','1']), stringParam('tool','contains tool name'), stringParam('correlationPrefix','prefix'), stringParam('updatedAfter','ISO-8601'), stringParam('updatedBefore','ISO-8601') ], responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/tool-streams/{correlationId}`] = { get: { summary: 'Get tool stream chunks (global)', responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Tool stream not found', status: 404 } }) } } };
    doc.paths[`${basePath}/tool-streams/{correlationId}/export`] = { get: { summary: 'Export tool stream (global)', parameters: [ stringParam('format','json|ndjson',["json","ndjson"]), integerParam('compress','0|1') ], responses: { 200: { description: 'OK' }, ...problemResponses({ '404': { title: 'Tool stream not found', status: 404 } }) } } };

    // Agents (实验)
    doc.paths[`${basePath}/agents/session/messages`] = { post: { summary: 'Send message to session (experimental)', responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/agents/session/thread`] = { get: { summary: 'Get session thread (experimental)', parameters: [ stringParam('sessionKey','key'), integerParam('limit','max messages') ], responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/agents/session/clear`] = { post: { summary: 'Clear session thread (experimental)', responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/agents/session/export`] = { get: { summary: 'Export session as JSONL (experimental)', parameters: [ stringParam('sessionKey','key') ], responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/agents/session/import`] = { post: { summary: 'Import JSONL to session (experimental)', responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/agents/tool-streams/report`] = { post: { summary: 'Report tool event (experimental)', responses: { 200: { description: 'OK' }, ...problemResponses() } } };

    // system/event-bus 观测端点（进程级背压统计）
    doc.paths[`${basePath}/system/event-bus`] = { get: { summary: 'Event bus stats', responses: { 200: { description: 'OK' }, ...problemResponses() } } };

    doc.paths[`${basePath}/designer/compile`] = { post: { summary: 'Compile graph to plan', responses: { 200: { description: 'OK' }, ...problemResponses({ '400': { title: 'Invalid graph', status: 400, detail: '图结构无效（缺少 nodes/edges）' }, '500': { title: 'Compile failed', status: 500 } }) } } };
    doc.paths[`${basePath}/plans/dry-run`] = { post: { summary: 'Dry-run plan (simulate)', responses: { 200: { description: 'OK' }, ...problemResponses({ '400': { title: 'Invalid plan', status: 400, detail: 'plan 字段必填' }, '500': { title: 'Dry-run failed', status: 500 } }) } } };

    doc.paths[`${basePath}/fs/list`] = { get: { summary: 'List directory', parameters: [ stringParam('scope','plansRepo|plansConfig|state|archives|logs'), stringParam('path','relative path') ], responses: { 200: { description: 'OK' }, ...problemResponses({ '400': { title: 'Not a directory', status: 400 }, '404': { title: 'Not found', status: 404 } }) } } };
    doc.paths[`${basePath}/fs/read`] = { get: { summary: 'Read file', parameters: [ stringParam('scope','scope'), stringParam('path','relative path'), integerParam('download','0|1') ], responses: { 200: { description: 'OK' }, ...problemResponses({ '400': { title: 'Not a file', status: 400 }, '404': { title: 'Not found', status: 404 } }) } } };
    doc.paths[`${basePath}/fs/write`] = { post: { summary: 'Write file', responses: { 200: { description: 'OK' }, ...problemResponses({ '409': { title: 'Exists', status: 409 }, '422': { title: 'Write failed', status: 422 } }) } } };
    doc.paths[`${basePath}/fs/mkdir`] = { post: { summary: 'Create directory', responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/fs/move`] = { post: { summary: 'Move file', responses: { 200: { description: 'OK' }, ...problemResponses({ '422': { title: 'Move failed', status: 422 } }) } } };
    doc.paths[`${basePath}/fs/delete`] = { delete: { summary: 'Delete file/dir', responses: { 200: { description: 'OK' }, ...problemResponses({ '422': { title: 'Delete failed', status: 422 } }) } } };

    // —— components.schemas （简化）——
    doc.components.schemas.PlanSummary = { type: 'object', properties: { id: { type: 'string' }, version: { type: 'string' }, entry: { type: 'string' } } };
    doc.components.schemas.ExecutionItem = { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, startedAt: { type: 'string', nullable: true }, finishedAt: { type: 'string', nullable: true } } };
    // 已移除内建调度：不再提供 ScheduleItem schema
    doc.components.schemas.DiagnosticsItem = { type: 'object', properties: { code: { type: 'string' }, severity: { type: 'string', enum: ['error','warning','info'] }, message: { type: 'string' }, nodeId: { type: 'string' }, edgeId: { type: 'string' } } };
    doc.components.schemas.Graph = { type: 'object', properties: { nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } }, required: ['nodes','edges'] };
    doc.components.schemas.TimelineEvent = { type: 'object', properties: { t: { type: 'string' }, status: { type: 'string' }, nodeId: { type: 'string' } } };

    return doc;
  });

  // 内建调度已移除：不再扫描计划目录、注册 Cron 任务或监听文件变更

  // 内建调度已移除：不再提供 /schedules 列表接口

  // 内建调度已移除：不再提供 /schedules/export 接口

  // 内建调度已移除：不再提供 /schedules/reload 接口

  // —— Approvals 路由 —— (Migrated to plugins/approvals.plugin.ts)

  // 内部复用的 WS 连接初始化与保活逻辑（测试可复用）
  function initWsConnection(socket: WebSocket, topicsParam?: TopicsInput) {
    const topics = parseTopicsParam(topicsParam);
    const connection: ClientConnection = { socket, topics };
    clients.add(connection);

    // 心跳与超时
    let lastPong = Date.now();
    const interval = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        try { (socket as any).ping?.(); } catch {}
      }
      if (Date.now() - lastPong > WS_IDLE_TIMEOUT_MS) {
        try { socket.close(4000, "idle timeout"); } catch {}
      }
    }, WS_PING_INTERVAL_MS);

    (socket as any).on?.("pong", () => { lastPong = Date.now(); });

    sendToClient(connection, "service.connected", { message: "connected", topics: Array.from(connection.topics) }, undefined, ["system"]);

    (socket as any).on?.("message", (buffer: any) => {
      const message = parseSubscriptionMessage(buffer.toString());
      if (!message) {
        sendToClient(connection, "service.error", { message: "无法解析订阅指令" }, undefined, ["system"]);
        return;
      }
      if (message.topics.length === 0) {
        sendToClient(connection, "service.error", { message: "订阅主题列表为空或无效" }, undefined, ["system"]);
        return;
      }
      if (message.type === "subscribe") {
        for (const topic of message.topics) connection.topics.add(topic);
      } else {
        for (const topic of message.topics) connection.topics.delete(topic);
      }
      sendToClient(connection, "service.topics-updated", { topics: Array.from(connection.topics) }, undefined, ["system"]);
    });

    (socket as any).on?.("close", () => {
      clients.delete(connection);
      clearInterval(interval);
    });

    return { connection };
  }

  // WebSocket 路由
  app.get("/ws", { websocket: true }, (socketConnection: any, request: any) => {
    const clientSocket = socketConnection.socket as WebSocket;
    const query = (request as any).query as { topics?: TopicsInput } | undefined;
    initWsConnection(clientSocket, query?.topics);
  });

  // 系统观测：事件总线背压统计
  app.get(systemEventBusRoute, async (_req: any, reply: any) => {
    reply.send({ stats: getEventBusStats() });
  });

  // 测试辅助：提供初始化函数以便在单元测试中模拟连接
  (app as any).__initWsConnectionForTest = (socket: WebSocket, topics?: TopicsInput) => initWsConnection(socket, topics);

  app.setErrorHandler((error: any, _request: any, reply: any) => {
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
    // 等待DI容器dispose所有资源
    await container.dispose();
  });

  return { app, controller, publishLogEvent, container };
}
