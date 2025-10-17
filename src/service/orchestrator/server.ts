
// TypeScript: enable strict typing; previously used @ts-nocheck for rapid iteration but now removed.
import fastify from "fastify";

import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
// 类型仅作开发期提示，不影响运行时

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
import { join as pathJoin, dirname, basename as pathBasename } from "node:path";
import { readdir, readFile, writeFile, mkdir, stat, unlink, rm } from "node:fs/promises";
import { watch } from "node:fs";
import { joinConfigPath } from "../../shared/environment/pathResolver.js";
import { Cron } from "croner";

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

// McpQuery接口已移除：使用内联类型注解以避免未使用警告

interface McpCallBody {
  arguments?: Record<string, unknown>;
  nodeId?: string;
  riskLevel?: "low" | "medium" | "high";
  useMockBridge?: boolean;
  mcpServer?: string;
}

// —— Request DTOs ——
interface DesignerCompileBody { graph?: { nodes: unknown[]; edges: unknown[] } }
interface DryRunBody { plan?: unknown; fromNode?: string }

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

import { registerAgentRoutes } from "./agents/routes.js";

export async function createOrchestratorService(
  options: OrchestratorServiceOptions = {}
): Promise<{
  app: any;
  controller: OrchestratorController;
  publishLogEvent: (payload: LogsAppendedPayload) => void;
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
    scheduleLastRun.set(planId, { executionId, status: "running", startedAt: new Date().toISOString() });
    broadcast("runtime.execution-start", { planId }, executionId);
  });
  controller.on("runtime.execution-complete", ({ executionId, result }) => {
    scheduleLastRun.set(result.planId, { executionId, status: result.status, startedAt: result.startedAt?.toISOString?.() ?? undefined, finishedAt: result.finishedAt?.toISOString?.() ?? undefined });
    broadcast("runtime.execution-complete", result, executionId);
  });
  controller.on("runtime.error", ({ executionId, error }) => {
    // 在错误情况下无法可靠获知 planId，这里仅广播
    broadcast("runtime.error", error, executionId);
  });
  controller.on("execution.failed", ({ executionId }) => {
    const record = controller.getExecution(executionId);
    if (record) {
      scheduleLastRun.set(record.planId, { executionId, status: "failed", startedAt: record.startedAt, finishedAt: record.finishedAt });
    }
  });
  controller.on("execution.cancelled", ({ executionId, planId }) => {
    const record = controller.getExecution(executionId);
    scheduleLastRun.set(planId, { executionId, status: "cancelled", startedAt: record?.startedAt, finishedAt: record?.finishedAt });
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
  const plansRoute = `${basePath}/plans`;
  const executionsRoute = `${basePath}/executions`;
  const approvalsRoute = `${basePath}/approvals`;
  const stopRoute = `${executionsRoute}/:id/stop`;
  const toolStreamsRoute = `${executionsRoute}/:id/tool-streams`;
  const toolStreamsGlobalRoute = `${basePath}/tool-streams`;
  const mcpServersRoute = `${basePath}/mcp/servers`;
  const mcpToolsRoute = `${basePath}/mcp/tools`;
  const examplesRoute = `${basePath}/plans/examples`;
  const fsRoute = `${basePath}/fs`;
  const designerCompileRoute = `${basePath}/designer/compile`;
  const planDryRunRoute = `${basePath}/plans/dry-run`;
  const systemEventBusRoute = `${basePath}/system/event-bus`;

  // —— Agents & ChatKit（feature flags） ——
  const AGENTS_ENABLED = String(process.env.AGENTS_ENABLED || "0");
  const CHATKIT_ENABLED = String(process.env.CHATKIT_ENABLED || "0");

  // —— Plans Store（配置目录 .hush-ops/config/plans）——
  async function getPlansDir(): Promise<string> {
    const dir = joinConfigPath("plans");
    await mkdir(dir, { recursive: true });
    return dir;
  }
  function sanitizeId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  }
  async function readPlanFile(filePath: string): Promise<unknown> {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  }
  async function writePlanFile(filePath: string, plan: unknown): Promise<void> {
    const json = JSON.stringify(plan, null, 2);
    await writeFile(filePath, json, "utf-8");
  }
  async function fileExists(filePath: string): Promise<boolean> {
    try { const s = await stat(filePath); return s.isFile(); } catch { return false; }
  }

  // —— 通用 FS 辅助（后端统一包装，前端只发起调用）——
  type FSScope = 'plansRepo' | 'plansConfig' | 'state' | 'archives' | 'logs';

  async function resolveScopeDir(scope: FSScope): Promise<string> {
    switch (scope) {
      case 'plansRepo': return pathJoin(process.cwd(), 'plans');
      case 'plansConfig': return getPlansDir();
      case 'state': return joinConfigPath('..', 'state');
      case 'archives': return pathJoin(joinConfigPath('..', 'state'), 'archives');
      case 'logs': return joinConfigPath('..', 'logs');
      default: return getPlansDir();
    }
  }

  async function resolvePathWithin(scope: FSScope, relPath: string): Promise<{abs: string, base: string}> {
    const base = await resolveScopeDir(scope);
    const abs = pathJoin(base, relPath || '.');
    const normBase = base.replace(/\\/g,'/');
    const normAbs = abs.replace(/\\/g,'/');
    if (!normAbs.startsWith(normBase)) {
      throw new Error('路径越界');
    }
    return { abs, base };
  }

  // 注册 Agents 路由（默认关闭，通过环境变量开启）
  if (AGENTS_ENABLED === "1" || CHATKIT_ENABLED === "1") {
    try { registerAgentRoutes(app as any, basePath, controller); } catch {}
  }

  app.get(mcpServersRoute, async () => {
    const servers = await listMcpServers().catch(() => []);
    return {
      servers: servers.map((server) => ({
        name: server.name,
        description: server.description ?? undefined
      }))
    };
  });

  app.get(mcpToolsRoute, async (
    request: { query?: { useMockBridge?: string | boolean; mcpServer?: string } },
    reply: any
  ) => {
    const query = request.query;
    const useMockBridge = parseBoolean(query?.useMockBridge as any);
    try {
      const tools = await controller.listMcpTools({
        useMockBridge,
        mcpServer: typeof query?.mcpServer === "string" ? (query.mcpServer as string) : undefined
      });
      return { tools };
    } catch (error) {
      reply.code(502);
      const message = error instanceof Error ? error.message : String(error);
      return { error: { code: "mcp_list_failed", message } };
    }
  });

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

  app.post(`${mcpToolsRoute}/:toolName`, async (
    request: { params: { toolName: string }; body?: McpCallBody },
    reply: any
  ) => {
    const { toolName } = request.params;
    const body = request.body;
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

  // —— FS（后端统一包装文件/目录操作）——
  app.get(`${fsRoute}/list`, async (
    request: { query?: { scope?: FSScope; path?: string } },
    reply: any
  ) => {
    const q = request.query;
    const scope = (q?.scope ?? 'plansConfig') as FSScope;
    const { abs } = await resolvePathWithin(scope, q?.path ?? '.');
    let s: Awaited<ReturnType<typeof stat>>;
    try { s = await stat(abs); } catch { reply.code(404); return { error: { code: 'not_found', message: '路径不存在' } }; }
    if (!s.isDirectory()) { reply.code(400); return { error: { code: 'not_directory', message: '路径不是目录' } }; }
    const names = await readdir(abs);
    const entries = [] as Array<{ name: string; type: 'file'|'dir'; size: number; modifiedAt: string }>;
    for (const name of names) {
      try {
        const info = await stat(pathJoin(abs, name));
        entries.push({ name, type: info.isDirectory() ? 'dir' : 'file', size: Number(info.size ?? 0), modifiedAt: new Date(info.mtimeMs).toISOString() });
      } catch {}
    }
    return { entries };
  });

  app.get(`${fsRoute}/read`, async (
    request: { query?: { scope?: FSScope; path?: string; download?: string } },
    reply: any
  ) => {
    const q = request.query;
    const scope = (q?.scope ?? 'plansConfig') as FSScope;
    const rel = q?.path ?? '';
    const { abs } = await resolvePathWithin(scope, rel);
    try {
      const s = await stat(abs);
      if (!s.isFile()) { reply.code(400); return { error: { code: 'not_file', message: '目标不是文件' } }; }
      const text = await readFile(abs, 'utf-8');
      const downloading = (q?.download ?? '0') === '1';
      if (downloading) {
        reply.header('Content-Type', 'application/json; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="${rel.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`);
        return reply.send(text);
      }
      return { path: rel, content: text };
    } catch (e) {
      reply.code(404); return { error: { code: 'read_failed', message: (e as Error).message } };
    }
  });

  app.post(`${fsRoute}/write`, async (request: any, reply: any) => {
    const body = request.body as { scope?: FSScope; path?: string; content?: string; overwrite?: boolean } | undefined;
    const scope = (body?.scope ?? 'plansConfig') as FSScope;
    const rel = body?.path ?? '';
    const { abs } = await resolvePathWithin(scope, rel);
    try {
      // Windows 设备名防护（同时适用于多数平台）：CON/PRN/AUX/NUL/COM1..9/LPT1..9（允许扩展名变体）
      const base = pathBasename(abs);
      if (/^(?:(?:CON|PRN|AUX|NUL)|(?:COM[1-9])|(?:LPT[1-9]))(?:\..*)?$/i.test(base)) {
        reply.code(400);
        return { error: { code: 'invalid_name', message: '保留设备名不可用' } };
      }
      const dir = dirname(abs); await mkdir(dir, { recursive: true });
      const exists = await stat(abs).then(s=>s.isFile()).catch(()=>false);
      if (exists && body?.overwrite === false) { reply.code(409); return { error: { code: 'exists', message: '文件已存在' } }; }
      await writeFile(abs, body?.content ?? '', 'utf-8');
      return { saved: true };
    } catch (e) {
      reply.code(422); return { error: { code: 'write_failed', message: (e as Error).message } };
    }
  });

  app.post(`${fsRoute}/mkdir`, async (
    request: { body?: { scope?: FSScope; path?: string } },
    _reply: any
  ) => {
    const body = request.body as { scope?: FSScope; path?: string } | undefined;
    const scope = (body?.scope ?? 'plansConfig') as FSScope;
    const { abs } = await resolvePathWithin(scope, body?.path ?? '');
    await mkdir(abs, { recursive: true });
    return { created: true };
  });

  app.post(`${fsRoute}/move`, async (
    request: { body?: { scope?: FSScope; from?: string; to?: string } },
    reply: any
  ) => {
    const body = request.body as { scope?: FSScope; from?: string; to?: string } | undefined;
    const scope = (body?.scope ?? 'plansConfig') as FSScope;
    const { abs: fromAbs } = await resolvePathWithin(scope, body?.from ?? '');
    const { abs: toAbs } = await resolvePathWithin(scope, body?.to ?? '');
    try {
      const dir = dirname(toAbs); await mkdir(dir, { recursive: true });
      await writeFile(toAbs, await readFile(fromAbs));
      await unlink(fromAbs).catch(()=>{});
      return { moved: true };
    } catch (e) {
      reply.code(422); return { error: { code: 'move_failed', message: (e as Error).message } };
    }
  });

  app.delete(`${fsRoute}/delete`, async (
    request: { body?: { scope?: FSScope; path?: string; recursive?: boolean } },
    reply: any
  ) => {
    const body = request.body as { scope?: FSScope; path?: string; recursive?: boolean } | undefined;
    const scope = (body?.scope ?? 'plansConfig') as FSScope;
    const { abs } = await resolvePathWithin(scope, body?.path ?? '');
    try {
      const s = await stat(abs);
      if (s.isDirectory()) {
        await rm(abs, { recursive: !!body?.recursive, force: true });
      } else {
        await unlink(abs);
      }
      return { deleted: true };
    } catch (e) {
      reply.code(422); return { error: { code: 'delete_failed', message: (e as Error).message } };
    }
  });

  // —— Plans CRUD ——
  app.get(plansRoute, async (request: { query?: { limit?: string; offset?: string } }) => {
    const dir = await getPlansDir();
    let files = await readdir(dir).catch(() => []);
    // 若没有任何计划文件，自动创建一个默认空计划 plans.json
    if (!files.some((n) => n.toLowerCase().endsWith('.json'))) {
      const defaultPlan = { id: 'plans', description: '空计划', nodes: [] } as const;
      await writePlanFile(pathJoin(dir, 'plans.json'), defaultPlan).catch(() => void 0);
      files = await readdir(dir).catch(() => []);
    }
    const summaries: Array<{ id: string; description?: string; version?: string }> = [];
    for (const name of files) {
      if (!name.endsWith('.json')) continue;
      const id = name.replace(/\.json$/i, '');
      try {
        const plan = (await readPlanFile(pathJoin(dir, name))) as { id?: string; description?: string; version?: string };
        summaries.push({ id: plan.id ?? id, description: plan.description, version: plan.version });
      } catch {
        summaries.push({ id });
      }
    }
    const q = request.query as { limit?: string; offset?: string } | undefined;
    const limit = Math.max(0, Math.min(1000, Number(q?.limit ?? '0') || 0));
    const offset = Math.max(0, Number(q?.offset ?? '0') || 0);
    const total = summaries.length;
    const plans = limit > 0 ? summaries.slice(offset, offset + limit) : summaries;
    return { total, plans };
  });

  app.get(`${plansRoute}/:id`, async (
    request: { params: { id: string } },
    reply: any
  ) => {
    const { id } = request.params;
    const dir = await getPlansDir();
    const safeId = sanitizeId(id);
    const filePath = pathJoin(dir, `${safeId}.json`);
    if (!(await fileExists(filePath))) {
      reply.code(404);
      return { error: { code: 'plan_not_found', message: `未找到计划 ${safeId}` } };
    }
    try {
      const plan = await readPlanFile(filePath);
      return plan;
    } catch (error) {
      reply.code(500);
      return { error: { code: 'plan_read_failed', message: (error as Error).message } };
    }
  });

  app.post(plansRoute, async (
    request: { body?: { plan?: unknown } },
    reply: any
  ) => {
    const body = request.body as { plan?: unknown } | undefined;
    if (!body?.plan) { reply.code(400); return { error: { code: 'bad_request', message: 'plan 字段必填' } }; }
    try {
      // 可选：校验 Plan 结构
      const parsed = body.plan; // 若需严格校验，可启用 PlanSchema.parse
      const id = (parsed as any)?.id ? sanitizeId(String((parsed as any).id)) : `plan-${Date.now()}`;
      (parsed as any).id = id;
      const dir = await getPlansDir();
      const filePath = pathJoin(dir, `${id}.json`);
      await writePlanFile(filePath, parsed);
      reply.code(201);
      return { id };
    } catch (error) {
      reply.code(422);
      return { error: { code: 'plan_create_failed', message: (error as Error).message } };
    }
  });

  // 计划导入（上传文本版；由后端写入 plansConfig，前端不触碰文件系统）
  app.post(`${plansRoute}/import`, async (
    request: { body?: { filename?: string; content?: string } },
    reply: any
  ) => {
    const body = request.body as { filename?: string; content?: string } | undefined;
    if (!body?.content) { reply.code(400); return { error: { code: 'bad_request', message: 'content 必填（计划 JSON 文本）' } }; }
    try {
      const plan = JSON.parse(body.content);
      const id = (plan?.id && typeof plan.id === 'string') ? sanitizeId(plan.id) : (body.filename ? sanitizeId(body.filename.replace(/\.json$/i,'')) : `plan-${Date.now()}`);
      plan.id = id;
      const dir = await getPlansDir();
      await writePlanFile(pathJoin(dir, `${id}.json`), plan);
      reply.code(201);
      return { id };
    } catch (e) {
      reply.code(422); return { error: { code: 'plan_import_failed', message: (e as Error).message } };
    }
  });

  // 计划上传（multipart）
  app.post(`${plansRoute}/upload`, async (request: any, reply: any) => {
    try {
      const parts = request.parts();
      let imported = 0; const ids: string[] = [];
      for await (const part of parts) {
        if (part.type !== 'file') continue;
        const filename = typeof part.filename === 'string' ? part.filename : `plan-${Date.now()}.json`;
        const content = await part.toBuffer();
        try {
          const json = JSON.parse(content.toString('utf-8')) as any;
          const id = (json?.id && typeof json.id === 'string') ? sanitizeId(json.id) : sanitizeId(filename.replace(/\.json$/i,''));
          json.id = id;
          const dir = await getPlansDir();
          await writePlanFile(pathJoin(dir, `${id}.json`), json);
          ids.push(id); imported++;
        } catch {
          // 单个文件失败不影响其他
        }
      }
      if (imported === 0) { reply.code(422); return { error: { code: 'upload_empty', message: '未解析到任何有效计划' } }; }
      reply.code(201); return { imported, ids };
    } catch (e) {
      reply.code(422); return { error: { code: 'upload_failed', message: (e as Error).message } };
    }
  });

  app.put(`${plansRoute}/:id`, async (
    request: { params: { id: string }; body?: { plan?: unknown } },
    reply: any
  ) => {
    const { id } = request.params;
    const body = request.body as { plan?: unknown } | undefined;
    if (!body?.plan) { reply.code(400); return { error: { code: 'bad_request', message: 'plan 字段必填' } }; }
    try {
      const dir = await getPlansDir();
      const safeId = sanitizeId(id);
      const filePath = pathJoin(dir, `${safeId}.json`);
      const parsed = body.plan; (parsed as any).id = safeId;
      await writePlanFile(filePath, parsed);
      return { id: safeId };
    } catch (error) {
      reply.code(422);
      return { error: { code: 'plan_update_failed', message: (error as Error).message } };
    }
  });

  // 触发指定计划执行（按 id 加载，支持仓库 plans/ 与配置 plans/）
  app.post(`${plansRoute}/:id/execute`, async (
    request: { params: { id: string }; body?: { mcpServer?: string } },
    reply: any
  ) => {
    const { id } = request.params;
    const safeId = sanitizeId(id);
    const repoPlansDir = pathJoin(process.cwd(), "plans");
    const configPlansDir = await getPlansDir();
    const candidates = [pathJoin(configPlansDir, `${safeId}.json`), pathJoin(repoPlansDir, `${safeId}.json`)];
    let plan: unknown | null = null;
    for (const candidate of candidates) {
      try {
        const s = await stat(candidate);
        if (s.isFile()) {
          plan = await readPlanFile(candidate);
          break;
        }
      } catch {
        // ignore
      }
    }
    if (!plan) {
      reply.code(404);
      return { error: { code: 'plan_not_found', message: `未找到计划 ${safeId}` } };
    }
    try {
      const body = request.body as { mcpServer?: string } | undefined;
      const record = await controller.execute({ plan, mcpServer: body?.mcpServer });
      return { executionId: record.id, status: record.status, planId: record.planId };
    } catch (error) {
      reply.code(500);
      return { error: { code: 'execution_failed', message: (error as Error).message } };
    }
  });

  app.delete(`${plansRoute}/:id`, async (
    request: { params: { id: string } },
    reply: any
  ) => {
    const { id } = request.params;
    const dir = await getPlansDir();
    const safeId = sanitizeId(id);
    const filePath = pathJoin(dir, `${safeId}.json`);
    if (!(await fileExists(filePath))) { reply.code(404); return { error: { code: 'plan_not_found', message: `未找到计划 ${safeId}` } }; }
    await unlink(filePath).catch(() => {});
    reply.code(204);
    return null as any;
  });

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

  app.get(executionsRoute, async (request: { query?: { limit?: string; offset?: string } }) => {
    const q = request.query;
    const limit = Math.max(0, Math.min(1000, Number(q?.limit ?? '0') || 0));
    const offset = Math.max(0, Number(q?.offset ?? '0') || 0);
    const all = controller.listExecutions();
    const total = all.length;
    const executions = limit > 0 ? all.slice(offset, offset + limit) : all;
    return { total, executions };
  });

  app.post(stopRoute, async (
    request: { params: { id: string } },
    reply: any
  ) => {
    const { id } = request.params;
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

  app.get(`${executionsRoute}/:id`, async (
    request: { params: { id: string } },
    reply: any
  ) => {
    const { id } = request.params;
    const record = controller.getExecution(id);
    if (!record) {
      reply.code(404);
      return { error: { code: "execution_not_found", message: `未找到执行 ${id}` } };
    }
    return record;
  });

  app.get(toolStreamsRoute, async (
    request: { params: ToolStreamParams },
    reply: any
  ) => {
    const { id } = request.params;
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

  app.get(`${toolStreamsRoute}/:correlationId`, async (
    request: { params: ToolStreamDetailParams },
    reply: any
  ) => {
    const { id, correlationId } = request.params;
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

  // 导出工具流明细（由后端生成文件，前端仅下载）
  app.get(`${toolStreamsRoute}/:correlationId/export`, async (
    request: { params: ToolStreamDetailParams; query?: { format?: string; compress?: string } },
    reply: any
  ) => {
    const { id, correlationId } = request.params;
    const record = controller.getExecution(id);
    if (!record) {
      reply.code(404);
      return { error: { code: "execution_not_found", message: `未找到执行 ${id}` } };
    }
    const query = request.query;
    const fmt = (query?.format ?? 'json').toString(); // json|ndjson
    const compress = (query?.compress ?? '0').toString() === '1';
    const chunks = controller.getToolStreamChunks(id, correlationId);
    if (!chunks || chunks.length === 0) {
      reply.code(404);
      return { error: { code: 'tool_stream_not_found', message: `未找到流式输出 ${correlationId}` } };
    }
    const filenameBase = `toolstream-${id}-${correlationId}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
    let payload = '';
    if (fmt === 'ndjson') {
      payload = chunks.map((c)=> JSON.stringify(c)).join('\n') + '\n';
      reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filenameBase}.ndjson${compress?'.gz':''}"`);
    } else {
      payload = JSON.stringify({ executionId: id, correlationId, chunks }, null, 2) + '\n';
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

  app.post(`${toolStreamsRoute}/:correlationId/replay`, async (
    request: { params: ToolStreamDetailParams },
    reply: any
  ) => {
    const { id, correlationId } = request.params;
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

    doc.paths[`${basePath}/schedules`] = { get: { summary: 'List schedules', parameters: [stringParam('source','repo|config',["repo","config"]), integerParam('within','minutes window'), stringParam('sort','nextAsc|nextDesc',["nextAsc","nextDesc"]), integerParam('limit','Max items'), integerParam('offset','Start offset')], responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/schedules/export`] = { get: { summary: 'Export schedules', responses: { 200: { description: 'OK' }, ...problemResponses() } } };
    doc.paths[`${basePath}/schedules/reload`] = { post: { summary: 'Reload schedules', responses: { 200: { description: 'OK' }, ...problemResponses({ '500': { title: 'Reload failed', status: 500 } }) } } };

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
    doc.components.schemas.ScheduleItem = { type: 'object', properties: { planId: { type: 'string' }, cron: { type: 'string' }, source: { type: 'string' }, file: { type: 'string' }, dir: { type: 'string' }, nextRunISO: { type: 'string', nullable: true }, lastStatus: { type: 'string', nullable: true }, lastStartedAt: { type: 'string', nullable: true }, lastFinishedAt: { type: 'string', nullable: true } } };
    doc.components.schemas.DiagnosticsItem = { type: 'object', properties: { code: { type: 'string' }, severity: { type: 'string', enum: ['error','warning','info'] }, message: { type: 'string' }, nodeId: { type: 'string' }, edgeId: { type: 'string' } } };
    doc.components.schemas.Graph = { type: 'object', properties: { nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } }, required: ['nodes','edges'] };
    doc.components.schemas.TimelineEvent = { type: 'object', properties: { t: { type: 'string' }, status: { type: 'string' }, nodeId: { type: 'string' } } };

    return doc;
  });

  // 计划级调度：扫描 plans 目录并按 cron 设置定时执行
  const schedulerLogger = createLoggerFacade("plan-scheduler");
  type ScheduledMeta = { job: Cron; planId: string; cron: string; file: string; dir: string; source: 'repo' | 'config' };
  const scheduledJobs: ScheduledMeta[] = [];
  const scheduleLastRun = new Map<string, { executionId: string; status: string; startedAt?: string; finishedAt?: string }>();

  async function stopAllSchedules() {
    for (const entry of scheduledJobs) {
      try { entry.job.stop(); } catch {}
    }
    scheduledJobs.length = 0;
  }

  async function reloadPlanScheduler() {
    try {
      await stopAllSchedules();
      // 同时扫描仓库 plans 与配置目录 .hush-ops/config/plans
      const repoPlansDir = pathJoin(process.cwd(), "plans");
      const configPlansDir = await getPlansDir();
      const candidateDirs: Array<{ dir: string; source: 'repo' | 'config' }> = [
        { dir: repoPlansDir, source: 'repo' },
        { dir: configPlansDir, source: 'config' }
      ];

      for (const { dir: plansDir, source } of candidateDirs) {
        let statInfo: Awaited<ReturnType<typeof stat>> | null = null;
        try {
          statInfo = await stat(plansDir);
        } catch {
          schedulerLogger.warn("未发现计划目录，跳过该路径", { plansDir });
          continue;
        }
        if (!statInfo || !statInfo.isDirectory()) {
          schedulerLogger.warn("路径不是目录，跳过该路径", { plansDir });
          continue;
        }
        const files = await readdir(plansDir);
        for (const filename of files) {
          if (!filename.endsWith(".json")) continue;
          try {
            const raw = await readFile(pathJoin(plansDir, filename), "utf-8");
            const plan = JSON.parse(raw) as Record<string, unknown>;
            const schedule = (plan as any).schedule ?? {};
            if (!schedule || schedule.enabled !== true) continue;
            if (schedule.kind !== "cron" || typeof schedule.cron !== "string") continue;

            const options: ConstructorParameters<typeof Cron>[1] = { protect: true } as any;
            if (schedule.window?.startISO) (options as any).startAt = new Date(schedule.window.startISO);
            if (schedule.window?.endISO) (options as any).stopAt = new Date(schedule.window.endISO);

            const job = new Cron(schedule.cron, options, async () => {
              try {
                schedulerLogger.info("触发计划执行", { planId: (plan as any).id, file: filename, dir: plansDir });
                await controller.execute({ plan });
              } catch (error) {
                schedulerLogger.error("计划执行失败", {
                  planId: (plan as any).id,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            });
            scheduledJobs.push({ job, planId: (plan as any).id ?? filename.replace(/\.json$/i, ''), cron: schedule.cron, file: filename, dir: plansDir, source });
            schedulerLogger.info("已注册计划调度", { planId: (plan as any).id, cron: schedule.cron, file: filename, dir: plansDir, source });
          } catch (error) {
            schedulerLogger.warn("读取或解析计划失败，已跳过", { file: filename, dir: plansDir, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
      return scheduledJobs.length;
    } catch (error) {
      schedulerLogger.error("初始化/重载计划调度时发生错误", { error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  }

  // 启动时初始化调度
  await reloadPlanScheduler();

  // 可选：监控计划目录变更并自动重载（设置环境变量 ORCHESTRATOR_SCHEDULE_WATCH=1 开启）
  const watchers: Array<ReturnType<typeof watch>> = [];
  const shouldWatch = process.env.ORCHESTRATOR_SCHEDULE_WATCH === '1';
  if (shouldWatch) {
    const repoPlansDir = pathJoin(process.cwd(), "plans");
    const configPlansDir = await getPlansDir();
    const debounce = (fn: () => void, ms: number) => {
      let t: NodeJS.Timeout | null = null;
      return () => { if (t) clearTimeout(t); t = setTimeout(() => fn(), ms); };
    };
    const onChange = debounce(() => {
      schedulerLogger.info("检测到计划文件变更，准备重载...");
      void reloadPlanScheduler();
    }, Number(process.env.ORCHESTRATOR_RELOAD_DEBOUNCE_MS ?? 1000));
    for (const dir of [repoPlansDir, configPlansDir]) {
      try {
        const s = await stat(dir);
        if (!s.isDirectory()) continue;
        const w = watch(dir, { persistent: true }, (_event, filename) => {
          if (filename && filename.toString().toLowerCase().endsWith('.json')) onChange();
        });
        watchers.push(w);
        schedulerLogger.info("已开启计划目录监听", { dir });
      } catch { /* ignore */ }
    }
  }

  // 关闭时：停止全部任务与文件监听
  app.addHook("onClose", async () => {
    await stopAllSchedules();
    for (const w of watchers) { try { w.close(); } catch {} }
  });

  // 关闭时停止全部已注册的调度任务
  app.addHook("onClose", async () => {
    await stopAllSchedules();
  });

  // Schedules 列表（只读，支持服务端筛选/分页）
  app.get(`${basePath}/schedules`, async (request: any) => {
    const q = (request as any).query as { source?: string; within?: string; sort?: string; limit?: string; offset?: string } | undefined;
    const source = (q?.source ?? '').toString();
    const withinMin = Number(q?.within ?? '');
    const sort = (q?.sort ?? 'nextAsc').toString(); // nextAsc|nextDesc
    const limit = Math.max(0, Math.min(1000, Number(q?.limit ?? '0') || 0));
    const offset = Math.max(0, Number(q?.offset ?? '0') || 0);
    const now = Date.now();
    const windowMs = Number.isFinite(withinMin) && withinMin > 0 ? withinMin * 60_000 : null;
    let items = scheduledJobs.map((entry) => {
      const last = scheduleLastRun.get(entry.planId);
      return {
        planId: entry.planId,
        cron: entry.cron,
        file: entry.file,
        dir: entry.dir,
        source: entry.source,
        nextRunISO: entry.job.nextRun()?.toISOString() ?? null,
        lastRun: last ?? null
      };
    });
    if (source === 'repo' || source === 'config') items = items.filter(i => i.source === source);
    if (windowMs) items = items.filter(i => i.nextRunISO && (new Date(i.nextRunISO).getTime() - now) <= windowMs && new Date(i.nextRunISO).getTime() >= now);
    const score = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);
    items.sort((a,b)=> sort === 'nextAsc' ? (score(a.nextRunISO) - score(b.nextRunISO)) : (score(b.nextRunISO) - score(a.nextRunISO)));
    const total = items.length;
    const sliced = limit > 0 ? items.slice(offset, offset + limit) : items;
    return { total, schedules: sliced };
  });

  // Schedules 导出（json|csv）
  app.get(`${basePath}/schedules/export`, async (request: any, reply: any) => {
    const q = (request as any).query as { format?: string } | undefined;
    const format = (q?.format ?? 'json').toString();
    const items = scheduledJobs.map((entry) => {
      const last = scheduleLastRun.get(entry.planId);
      return {
        planId: entry.planId,
        cron: entry.cron,
        source: entry.source,
        file: entry.file,
        dir: entry.dir,
        nextRunISO: entry.job.nextRun()?.toISOString() ?? null,
        lastStatus: last?.status ?? null,
        lastStartedAt: last?.startedAt ?? null,
        lastFinishedAt: last?.finishedAt ?? null
      };
    });
    // 为了稳定导出顺序，按 planId 升序排序，避免不同来源（repo/config）加载顺序影响
    items.sort((a, b) => String(a.planId).localeCompare(String(b.planId)));
    if (format === 'csv') {
      const header = ['planId','cron','source','file','dir','nextRunISO','lastStatus','lastStartedAt','lastFinishedAt'];
      const csvEscape = (val: unknown): string => {
        let s = String(val ?? "");
        if (s.includes('"')) s = s.replace(/"/g, '""');
        const needsQuote = /[",\r\n]/.test(s);
        return needsQuote ? `"${s}"` : s;
      };
      const rows: string[] = [];
      rows.push(header.join(','));
      for (const it of items) {
        const cols = header.map(h => csvEscape((it as any)[h]));
        rows.push(cols.join(','));
      }
      const csv = rows.join('\r\n') + '\r\n';
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="schedules-${new Date().toISOString().replace(/[:.]/g,'-')}.csv"`);
      return reply.send(csv);
    }
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="schedules-${new Date().toISOString().replace(/[:.]/g,'-')}.json"`);
    return reply.send(JSON.stringify({ schedules: items }, null, 2));
  });

  // 手动重载调度
  app.post(`${basePath}/schedules/reload`, async () => {
    const count = await reloadPlanScheduler();
    return { reloaded: true, count };
  });

  app.get(`${approvalsRoute}/pending`, async () => {
    const approvals = await controller.listPendingApprovals();
    return { approvals };
  });

  app.post(`${approvalsRoute}/request`, async (request: any, reply: any) => {
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

  app.post(`${approvalsRoute}/:id/decision`, async (request: any, reply: any) => {
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
  });

  return { app, controller, publishLogEvent };
}
