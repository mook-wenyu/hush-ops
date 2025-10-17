import { randomUUID } from "node:crypto";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { EventEmitter } from "node:events";
import pLimit from "p-limit";

import { loadPlan } from "../../orchestrator/plan/index.js";
import { createDefaultExecutionContext, dryRun } from "../../orchestrator/executor/executor.js";
import type { ExecutionResult } from "../../orchestrator/executor/types.js";
import type {
  RuntimeEventPayloads,
  RuntimeExecutionStatus,
  RuntimeBridgeMeta
} from "../../orchestrator/runtime/types.js";
import type { RuntimeToolStreamPayload, RuntimeToolStreamStatus } from "./types.js";
import { JsonCheckpointStore, MemoryCheckpointStore } from "../../orchestrator/state/checkpoint.js";
import { createDefaultAdapters } from "../../orchestrator/adapters/defaults.js";
import { OrchestratorRuntime } from "../../orchestrator/runtime/runtime.js";
import type { BridgeState, ToolInvocation, ToolStreamEvent } from "../../mcp/bridge/types.js";
import { BridgeClient } from "../../mcp/bridge/bridgeClient.js";
import type { BridgeSession } from "../../mcp/bridge/session.js";
import { BridgeSession as RealBridgeSession, type ToolDescriptor } from "../../mcp/bridge/session.js";
import { FileBridgeSessionRegistry } from "../../mcp/bridge/sessionRegistry.js";
import { ApprovalController, type ManualApprovalRequest } from "../../shared/approvals/controller.js";
import { ApprovalStore } from "../../shared/approvals/store.js";
import type {
  ApprovalStatus,
  CompletedApprovalEntry,
  PendingApprovalEntry
} from "../../shared/approvals/types.js";
import { ToolStreamStore, type ToolStreamChunk, type ToolStreamSummary } from "../../shared/persistence/toolStreamStore.js";
import { createLoggerFacade } from "../../shared/logging/logger.js";
import type { LoggerFacade } from "../../shared/logging/logger.js";
import { registerConfiguredAgents } from "../../agents/config/index.js";
import { getAgentPlugin } from "../../agents/registry.js";
import { createMockBridgeSession } from "../../cli/runtime/autoExecute.js";
import type { DryRunSummary } from "../../orchestrator/executor/types.js";
import {
  getMcpServerConfig,
  listMcpServers,
  type McpServerConfig
} from "../../mcp/config/loader.js";
import { getHushOpsStateDirectory } from "../../shared/environment/pathResolver.js";

export interface ExecutePlanRequest {
  readonly plan: unknown;
  readonly useMockBridge?: boolean;
  readonly databasePath?: string;
  readonly mcpServer?: string;
}

export interface ValidationRequest {
  readonly plan: unknown;
}

export interface BridgeRequestOptions {
  readonly useMockBridge?: boolean;
  readonly mcpServer?: string;
}

export interface OrchestratorControllerOptions {
  readonly databasePath?: string;
  readonly mcpServerName?: string;
  readonly defaultUseMockBridge?: boolean;
  readonly approvalStore?: ApprovalStore;
  readonly toolStreamStore?: ToolStreamStore;
  readonly maxConcurrency?: number; // 0/undefined 表示不限制
}

export interface ExecutionRecord {
  readonly id: string;
  readonly planId: string;
  readonly createdAt: string;
  readonly executorType: "mock" | "mcp";
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  startedAt?: string;
  finishedAt?: string;
  bridgeStates: BridgeState[];
  result?: ExecutionResult;
  error?: { message: string };
  pendingApprovals: PendingApprovalEntry[];
  executionStatus: RuntimeExecutionStatus;
  running: boolean;
  currentNodeId?: string | null;
  lastCompletedNodeId?: string | null;
  currentBridgeState?: BridgeState;
  bridgeMeta?: RuntimeBridgeMeta;
}

export interface ExecutionSnapshot {
  readonly executionId: string;
  readonly planId: string;
  readonly status: ExecutionRecord["status"];
  readonly executionStatus: RuntimeExecutionStatus;
  readonly running: boolean;
  readonly executorType: ExecutionRecord["executorType"];
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly currentNodeId?: string | null;
  readonly lastCompletedNodeId?: string | null;
  readonly pendingApprovals: PendingApprovalEntry[];
  readonly bridgeState?: BridgeState;
  readonly bridgeMeta?: RuntimeBridgeMeta;
  readonly result?: ExecutionResult;
  readonly error?: { message: string };
}

export interface ManualApprovalRequestInput extends ManualApprovalRequest {
  executionId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export type ValidateResult = DryRunSummary;

interface BridgeSessionResult {
  session: BridgeSession;
  registry?: FileBridgeSessionRegistry;
}

function resolveStorageDirectory(databasePath?: string): string {
  if (!databasePath || databasePath.trim().length === 0) {
    return getHushOpsStateDirectory();
  }
  const absolute = resolvePath(databasePath);
  if (extname(absolute)) {
    return dirname(absolute);
  }
  return absolute;
}

async function resolveServerConfigForRequest(
  logger: LoggerFacade,
  request: BridgeRequestOptions,
  options: OrchestratorControllerOptions
): Promise<McpServerConfig> {
  if (request.mcpServer) {
    return getMcpServerConfig(request.mcpServer);
  }
  if (options.mcpServerName) {
    return getMcpServerConfig(options.mcpServerName);
  }
  const servers = await listMcpServers();
  if (servers.length === 0) {
    throw new Error("未在 .hush-ops/config/mcp.servers.json 配置任何 MCP server，无法建立桥接连接。");
  }
  const [first] = servers;
  if (!first) {
    throw new Error("未找到可用的 MCP server 配置。");
  }
  logger.info("[bridge] 未指定 MCP server，使用默认配置", {
    server: first.name
  });
  return first;
}

async function createBridgeSession(
  options: OrchestratorControllerOptions,
  request: BridgeRequestOptions,
  logger: LoggerFacade
): Promise<BridgeSessionResult> {
  if (request.useMockBridge ?? options.defaultUseMockBridge ?? true) {
    return { session: await createMockBridgeSession() };
  }

  const serverConfig = await resolveServerConfigForRequest(logger, request, options);
  const sessionRegistry = new FileBridgeSessionRegistry({
    directory: resolveStorageDirectory(options.databasePath)
  });

  const client = new BridgeClient({
    endpoint: serverConfig.endpoint,
    serverName: serverConfig.name,
    headers: serverConfig.headers,
    retry: serverConfig.retry,
    sessionRegistry,
    userId: serverConfig.session?.userId ?? "default",
    sessionMetadata: {
      serverName: serverConfig.name,
      endpoint: serverConfig.endpoint,
      ...(serverConfig.session?.metadata ?? {})
    }
  });

  const session = new RealBridgeSession(client, {
    logger: {
      info: (msg) => logger.info(`[bridge:${serverConfig.name}] ${msg}`),
      warn: (msg) => logger.warn(`[bridge:${serverConfig.name}] ${msg}`),
      error: (msg, error) => logger.error(`[bridge:${serverConfig.name}] ${msg}`, error)
    }
  });
  await session.connect();
  return { session, registry: sessionRegistry };
}

export class OrchestratorController extends EventEmitter {
  private readonly executions = new Map<string, ExecutionRecord>();

  private readonly executionRuntimes = new Map<string, OrchestratorRuntime>();

  // 计划级并发门控：记录当前正在运行的 planId -> executionId
  private readonly activePlanExecutions = new Map<string, string>();

  private readonly options: OrchestratorControllerOptions;

  private readonly approvalStore: ApprovalStore;

  private readonly toolStreamStore: ToolStreamStore;

  private readonly ownsToolStreamStore: boolean;

  // 全局并发门控（使用 p-limit）
  private readonly concurrencyLimit: ReturnType<typeof pLimit> | null;

  constructor(options: OrchestratorControllerOptions = {}) {
    super();
    this.options = options;
    const storageDirectory = resolveStorageDirectory(options.databasePath);
    this.approvalStore =
      options.approvalStore ?? new ApprovalStore({ directory: storageDirectory });
    if (options.toolStreamStore) {
      this.toolStreamStore = options.toolStreamStore;
      this.ownsToolStreamStore = false;
    } else {
      this.toolStreamStore = new ToolStreamStore({
        directory: storageDirectory
      });
      this.ownsToolStreamStore = true;
    }
    const envLimit = Number(process.env.ORCHESTRATOR_MAX_CONCURRENCY);
    const limitFromOptions = options.maxConcurrency;
    const computed = Number.isFinite(limitFromOptions as number)
      ? (limitFromOptions as number)
      : (Number.isFinite(envLimit) ? envLimit : 0);
    const maxConcurrency = computed > 0 ? Math.floor(computed) : 0;
    this.concurrencyLimit = maxConcurrency > 0 ? pLimit(maxConcurrency) : null;
  }

  private buildSnapshot(record: ExecutionRecord): ExecutionSnapshot {
    const bridgeState = record.currentBridgeState ?? record.bridgeStates.at(-1);
    return {
      executionId: record.id,
      planId: record.planId,
      status: record.status,
      executionStatus: record.executionStatus,
      running: record.running,
      executorType: record.executorType,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      currentNodeId: record.currentNodeId ?? null,
      lastCompletedNodeId: record.lastCompletedNodeId ?? null,
      pendingApprovals: [...record.pendingApprovals],
      bridgeState,
      bridgeMeta: record.bridgeMeta,
      result: record.result,
      error: record.error
    };
  }

  listExecutionSnapshots(): ExecutionSnapshot[] {
    return Array.from(this.executions.values()).map((record) => this.buildSnapshot(record));
  }

  getExecutionSnapshot(executionId: string): ExecutionSnapshot | undefined {
    const record = this.executions.get(executionId);
    return record ? this.buildSnapshot(record) : undefined;
  }

  listExecutions(): ExecutionRecord[] {
    return Array.from(this.executions.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  getExecution(id: string): ExecutionRecord | undefined {
    return this.executions.get(id);
  }

  async stopExecution(id: string): Promise<ExecutionRecord> {
    const record = this.executions.get(id);
    if (!record) {
      throw new Error(`找不到执行 ${id}`);
    }
    if (record.status !== "running") {
      // 如果未在运行中，直接取消
      record.status = "cancelled";
      record.executionStatus = "cancelled";
      record.running = false;
      record.finishedAt = new Date().toISOString();
      record.error = undefined;
      record.pendingApprovals = [];
      const activeId2 = this.activePlanExecutions.get(record.planId);
      if (activeId2 === id) {
        this.activePlanExecutions.delete(record.planId);
      }
      this.emit("execution.cancelled", { executionId: id, planId: record.planId });
      this.emitSnapshot(id);
      return record;
    }

    const runtime = this.executionRuntimes.get(id);
    if (runtime) {
      await runtime.stop();
      this.executionRuntimes.delete(id);
    }
    record.status = "cancelled";
    record.executionStatus = "cancelled";
    record.running = false;
    record.finishedAt = new Date().toISOString();
    record.error = undefined;
    record.pendingApprovals = [];
    // 释放计划级并发占用
    const activeId = this.activePlanExecutions.get(record.planId);
    if (activeId === id) {
      this.activePlanExecutions.delete(record.planId);
    }
    this.emit("execution.cancelled", { executionId: id, planId: record.planId });
    this.emitSnapshot(id);
    return record;
  }

  async validate(request: ValidationRequest): Promise<ValidateResult> {
    // 统一入口：loader 支持 v1(children) 与 v3(edges)
    const planContext = loadPlan(request.plan);
    await registerConfiguredAgents();
    getAgentPlugin("demand-analysis");
    const mockSession = await createMockBridgeSession();
    try {
      const executionContext = createDefaultExecutionContext({
        planContext,
        adapters: createDefaultAdapters(mockSession),
        checkpointStore: new MemoryCheckpointStore(),
        loggerCategory: "orchestrator-service/validate"
      });
      return dryRun(planContext, executionContext);
    } finally {
      await mockSession.disconnect?.();
    }
  }

  async execute(request: ExecutePlanRequest): Promise<ExecutionRecord> {
    // 解析计划，并读取顶层调度并发策略（若存在）
    const rawPlan = request.plan as Record<string, unknown> | undefined;
    const planContext = loadPlan(request.plan);

    // 并发门控：当 schedule.concurrency === 'forbid' 时，如果已有同 planId 的运行中执行，则返回现有执行记录
    const planId = planContext.plan.id;
    const concurrencyPolicy = (rawPlan?.schedule as any)?.concurrency as
      | "allow"
      | "forbid"
      | undefined;

    if (concurrencyPolicy === "forbid") {
      // 优先返回已记录的运行中执行
      for (const record of this.executions.values()) {
        if (record.planId === planId && record.running) {
          return record;
        }
      }
    }

    await registerConfiguredAgents();
    getAgentPlugin("demand-analysis");

    const executionId = `exec-${randomUUID()}`;
    const useMockBridge = request.useMockBridge ?? this.options.defaultUseMockBridge ?? true;
    const executorType: ExecutionRecord["executorType"] = useMockBridge ? "mock" : "mcp";

    // 提前创建 ExecutionRecord，允许后续并发请求立即感知到正在运行的执行
    const initialRecord: ExecutionRecord = {
      id: executionId,
      planId,
      createdAt: new Date().toISOString(),
      executorType,
      status: "pending",
      bridgeStates: [],
      pendingApprovals: [],
      executionStatus: "idle",
      running: false,
      currentNodeId: null,
      lastCompletedNodeId: null,
      currentBridgeState: undefined,
      bridgeMeta: undefined
    };
    this.executions.set(executionId, initialRecord);
    this.emit("execution.created", { executionId, planId });
    this.emitSnapshot(executionId);

    const logger = createLoggerFacade("orchestrator-service", {
      executionId,
      planId
    });
    const { session, registry: sessionRegistry } = await createBridgeSession(
      this.options,
      { useMockBridge, mcpServer: request.mcpServer },
      logger
    );

    const handleToolStream = (event: ToolStreamEvent) => {
      const correlationId = event.correlationId ?? "unknown";
      const status = (event.status ?? "start") as RuntimeToolStreamStatus;

      const source = useMockBridge ? "mock" : event.source ?? "live";
      const storedChunk = this.toolStreamStore.appendChunk({
        toolName: event.toolName,
        message: event.message,
        status,
        correlationId,
        executionId,
        planId: planContext.plan.id,
        nodeId: event.nodeId,
        error: event.error,
        timestamp: event.timestamp,
        source
      });
      const payload: RuntimeToolStreamPayload = {
        toolName: storedChunk.toolName,
        message: storedChunk.message,
        timestamp: storedChunk.timestamp,
        status,
        correlationId: storedChunk.correlationId,
        executionId,
        planId: storedChunk.planId,
        nodeId: storedChunk.nodeId,
        result: event.result,
        error: storedChunk.error ?? undefined,
        sequence: storedChunk.sequence,
        storedAt: storedChunk.storedAt,
        replayed: false,
        source
      };
      logger.info("tool stream", {
        executionId,
        planId: planContext.plan.id,
        correlationId,
        status,
        message: event.message,
        error: event.error,
        sequence: storedChunk.sequence,
        source
      });
      this.emit("runtime.tool-stream", payload);
    };
    session.on("tool-stream", handleToolStream);

    const initialBridgeState = session.getState();
    const record = this.executions.get(executionId)!;
    record.bridgeStates = initialBridgeState ? [initialBridgeState] : [];
    record.currentBridgeState = initialBridgeState;

    const adapters = createDefaultAdapters(session);
    const checkpointStore = new JsonCheckpointStore(resolveStorageDirectory(this.options.databasePath));
    const approvalController = new ApprovalController({
      store: this.approvalStore,
      decidedBy: "orchestrator-service",
      onPending: (entry) => {
        this.handlePendingApproval(executionId, entry);
      }
    });

    const executionContext = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      approvalController,
      loggerCategory: "orchestrator-service/execution"
    });

    const runtime = new OrchestratorRuntime({
      planContext,
      executionContext,
      bridgeSession: session
    });

    this.executionRuntimes.set(executionId, runtime);

    runtime.on("runtime:state-change", (payload) => {
      this.handleRuntimeStateChange(executionId, payload);
    });
    runtime.on("runtime:execution-start", (payload) => {
      this.emit("runtime.execution-start", { executionId, ...payload });
    });
    runtime.on("runtime:execution-complete", (payload) => {
      this.emit("runtime.execution-complete", { executionId, ...payload });
    });
    runtime.on("runtime:error", (payload) => {
      this.emit("runtime.error", { executionId, ...payload });
    });

    const startNow = async () => {
      record.status = "running";
      record.startedAt = new Date().toISOString();
      record.executionStatus = "running";
      record.running = true;

      if (concurrencyPolicy === "forbid") {
        this.activePlanExecutions.set(planId, executionId);
      }

      this.emit("execution.started", { executionId, planId });
      this.emitSnapshot(executionId);

      try {
        const result = await runtime.start();
        record.status = result.status;
        record.finishedAt = result.finishedAt.toISOString();
        record.result = result;
        record.executionStatus = result.status;
        record.running = false;
        this.emit("execution.completed", { executionId, result });
        this.emitSnapshot(executionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        record.status = "failed";
        record.finishedAt = new Date().toISOString();
        record.error = { message };
        record.executionStatus = "failed";
        record.running = false;
        this.emit("execution.failed", { executionId, error: message });
        this.emitSnapshot(executionId);
      } finally {
        session.off("tool-stream", handleToolStream);
        await session.disconnect?.();
        sessionRegistry?.close();
        this.executionRuntimes.delete(executionId);
        if (concurrencyPolicy === "forbid") {
          const current = this.activePlanExecutions.get(planId);
          if (current === executionId) {
            this.activePlanExecutions.delete(planId);
          }
        }
      }
    };

    // 使用 p-limit 控制并发
    if (this.concurrencyLimit) {
      this.concurrencyLimit(startNow).catch(() => {});
    } else {
      startNow();
    }

    return record;
  }

  async listPendingApprovals(): Promise<PendingApprovalEntry[]> {
    return this.approvalStore.listPending();
  }

  async recordApprovalDecision(params: {
    id: string;
    decision: Exclude<ApprovalStatus, "pending">;
    comment?: string;
    decidedBy?: string;
  }): Promise<CompletedApprovalEntry> {
    const controller = new ApprovalController({
      store: this.approvalStore,
      decidedBy: params.decidedBy ?? "orchestrator-service-ui"
    });
    const completed = await controller.recordDecision(params.id, params.decision, params.comment);
    let executionId: string | undefined;
    for (const record of this.executions.values()) {
      if (record.pendingApprovals.some((entry) => entry.id === params.id)) {
        record.pendingApprovals = record.pendingApprovals.filter((entry) => entry.id !== params.id);
        executionId = record.id;
      }
    }
    this.emit("approval.updated", { executionId, entry: completed });
    if (executionId) {
      this.emitSnapshot(executionId);
    }
    return completed;
  }

  async listMcpTools(options: BridgeRequestOptions = {}): Promise<ToolDescriptor[]> {
    const logger = createLoggerFacade("orchestrator-service/mcp-tools", {});
    const { session, registry } = await createBridgeSession(this.options, options, logger);
    try {
      return await session.listTools();
    } finally {
      await session.disconnect?.();
      registry?.close();
    }
  }

  async callMcpTool(params: {
    toolName: string;
    arguments?: Record<string, unknown>;
    nodeId?: string;
    riskLevel?: "low" | "medium" | "high";
  } & BridgeRequestOptions): Promise<unknown> {
    if (!params.toolName) {
      throw new Error("toolName 不能为空");
    }
    const { toolName, arguments: toolArgs, nodeId, riskLevel, ...bridgeOptions } = params;
    const logger = createLoggerFacade("orchestrator-service/mcp-call", { toolName });
    const { session, registry } = await createBridgeSession(this.options, bridgeOptions, logger);
    try {
      const invocation: ToolInvocation = {
        toolName,
        arguments: (toolArgs ?? {}) as Record<string, unknown>,
        options: { nodeId, riskLevel }
      };
      return await session.invokeTool(invocation);
    } finally {
      await session.disconnect?.();
      registry?.close();
    }
  }

  async requestApproval(params: ManualApprovalRequestInput): Promise<PendingApprovalEntry> {
    const { executionId, title, metadata, ...rest } = params;
    const record = executionId ? this.executions.get(executionId) : undefined;
    const planId = rest.planId ?? record?.planId ?? "plugin";
    const planVersion = rest.planVersion ?? "manual";
    const nodeId = rest.nodeId ?? `plugin:${randomUUID()}`;
    const approvalController = new ApprovalController({
      store: this.approvalStore,
      decidedBy: "orchestrator-service",
      requestedBy: rest.requestedBy ?? "plugin"
    });
    const entry = await approvalController.createManualApproval({
      planId,
      planVersion,
      nodeId,
      nodeType: rest.nodeType ?? "plugin_action",
      riskLevel: rest.riskLevel ?? "medium",
      requiresApproval: rest.requiresApproval ?? true,
      requestedBy: rest.requestedBy ?? "plugin",
      payload: {
        title: title ?? nodeId,
        metadata: metadata ?? {}
      }
    });
    if (executionId && record) {
      this.handlePendingApproval(executionId, entry);
    } else {
      this.emit("approval.pending", { executionId: undefined, entry });
    }
    return entry;
  }

  listToolStreamSummaries(executionId: string): ToolStreamSummary[] {
    return this.toolStreamStore.listSummariesByExecution(executionId);
  }

  // 全局：按可选 executionId 过滤，支持 onlyErrors/分页由调用方处理
  listAllToolStreamSummaries(options?: { executionId?: string }): ToolStreamSummary[] {
    return this.toolStreamStore.listSummariesAll(options?.executionId);
  }

  getToolStreamChunks(executionId: string, correlationId: string): ToolStreamChunk[] {
    return this.toolStreamStore
      .listChunks(correlationId)
      .filter((chunk) => chunk.executionId === executionId);
  }

  // 全局：直接依据 correlationId 取回全部 chunk
  getAllToolStreamChunks(correlationId: string): ToolStreamChunk[] {
    return this.toolStreamStore.listChunks(correlationId);
  }

  // 公开：允许外部（如 Agents/ChatKit 路由）写入全局工具流审计，不要求 executionId
  appendGlobalToolStreamChunk(input: {
    correlationId: string;
    toolName: string;
    message: string;
    status?: string;
    executionId?: string;
    planId?: string;
    nodeId?: string;
    error?: string;
    source?: string;
    timestamp?: string;
  }) {
    const timestamp = input.timestamp ?? new Date().toISOString();
    return this.toolStreamStore.appendChunk({
      correlationId: input.correlationId,
      toolName: input.toolName,
      executionId: input.executionId,
      planId: input.planId,
      nodeId: input.nodeId,
      status: input.status ?? "start",
      message: input.message,
      error: input.error,
      source: input.source ?? "agent",
      timestamp
    });
  }

  replayToolStream(executionId: string, correlationId: string): number {
    const chunks = this.getToolStreamChunks(executionId, correlationId);
    if (chunks.length === 0) {
      return 0;
    }
    for (const chunk of chunks) {
      const payload: RuntimeToolStreamPayload = {
        toolName: chunk.toolName,
        message: chunk.message,
        timestamp: chunk.timestamp,
        status: chunk.status as RuntimeToolStreamPayload["status"],
        correlationId: chunk.correlationId,
        executionId,
        planId: chunk.planId,
        nodeId: chunk.nodeId,
        error: chunk.error ?? undefined,
        sequence: chunk.sequence,
        storedAt: chunk.storedAt,
        replayed: true,
        source: chunk.source ?? "replay"
      };
      this.emit("runtime.tool-stream", payload);
    }
    return chunks.length;
  }

  close(): void {
    if (this.ownsToolStreamStore) {
      this.toolStreamStore.close();
    }
  }

  private emitSnapshot(executionId: string) {
    const record = this.executions.get(executionId);
    if (!record) {
      return;
    }
    const snapshot = this.buildSnapshot(record);
    this.emit("runtime.snapshot", { executionId, snapshot });
  }

  private handleRuntimeStateChange(
    executionId: string,
    payload: RuntimeEventPayloads["runtime:state-change"]
  ) {
    const record = this.executions.get(executionId);
    if (!record) {
      return;
    }
    record.executionStatus = payload.executionStatus;
    record.running = payload.running;
    record.currentNodeId = payload.currentNodeId ?? null;
    record.lastCompletedNodeId = payload.lastCompletedNodeId ?? null;
    record.currentBridgeState = payload.bridgeState;
    record.bridgeMeta = payload.bridgeMeta;
    if (payload.bridgeState) {
      record.bridgeStates.push(payload.bridgeState);
      this.emit("bridge.state-change", {
        executionId,
        state: payload.bridgeState,
        meta: payload.bridgeMeta
      });
    }
    this.emit("runtime.state-change", { executionId, payload });
    this.emitSnapshot(executionId);
  }

  private handlePendingApproval(executionId: string, entry: PendingApprovalEntry) {
    const record = this.executions.get(executionId);
    if (!record) {
      return;
    }
    record.pendingApprovals = record.pendingApprovals
      .filter((existing) => existing.id !== entry.id)
      .concat(entry);
    this.emit("approval.pending", { executionId, entry });
    this.emitSnapshot(executionId);
  }
}
