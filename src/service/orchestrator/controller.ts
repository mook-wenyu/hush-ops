import { randomUUID } from "node:crypto";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { EventEmitter } from "node:events";

import { loadPlan } from "../../orchestrator/plan/index.js";
import type { Plan } from "../../orchestrator/plan/index.js";
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
import { PlanSchema } from "../../shared/schemas/plan.js";
import type { DryRunSummary } from "../../orchestrator/executor/types.js";
import {
  getMcpServerConfig,
  listMcpServers,
  type McpServerConfig
} from "../../mcp/config/loader.js";

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
    return resolvePath("state");
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
    throw new Error("未在 config/mcp.servers.json 配置任何 MCP server，无法建立桥接连接。");
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

  private readonly options: OrchestratorControllerOptions;

  private readonly approvalStore: ApprovalStore;

  private readonly toolStreamStore: ToolStreamStore;

  private readonly ownsToolStreamStore: boolean;

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
    this.emit("execution.cancelled", { executionId: id, planId: record.planId });
    this.emitSnapshot(id);
    return record;
  }

  async validate(request: ValidationRequest): Promise<ValidateResult> {
    const parsedPlan = PlanSchema.parse(request.plan);
    const planContext = loadPlan(parsedPlan);
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
    const parsedPlan = PlanSchema.parse(request.plan as Plan);
    const planContext = loadPlan(parsedPlan);
    await registerConfiguredAgents();
    getAgentPlugin("demand-analysis");

    const executionId = `exec-${randomUUID()}`;
    const useMockBridge = request.useMockBridge ?? this.options.defaultUseMockBridge ?? true;
    const executorType: ExecutionRecord["executorType"] = useMockBridge ? "mock" : "mcp";

    const logger = createLoggerFacade("orchestrator-service", {
      executionId,
      planId: planContext.plan.id
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
    const record: ExecutionRecord = {
      id: executionId,
      planId: planContext.plan.id,
      createdAt: new Date().toISOString(),
      executorType,
      status: "pending",
      bridgeStates: initialBridgeState ? [initialBridgeState] : [],
      pendingApprovals: [],
      executionStatus: "idle",
      running: false,
      currentNodeId: null,
      lastCompletedNodeId: null,
      currentBridgeState: initialBridgeState,
      bridgeMeta: undefined
    };
    this.executions.set(executionId, record);
    this.emit("execution.created", { executionId, planId: planContext.plan.id });
    this.emitSnapshot(executionId);
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

    record.status = "running";
    record.startedAt = new Date().toISOString();
    record.executionStatus = "running";
    record.running = true;
    this.emit("execution.started", { executionId, planId: planContext.plan.id });
    this.emitSnapshot(executionId);

    (async () => {
      try {
        const result = await runtime.start();
        if (record.status !== "cancelled") {
          record.status = result.status;
          record.finishedAt = result.finishedAt.toISOString();
          record.result = result;
          record.executionStatus = result.status;
          record.running = false;
          this.emit("execution.completed", { executionId, result });
          this.emitSnapshot(executionId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (record.status !== "cancelled") {
          record.status = "failed";
          record.finishedAt = new Date().toISOString();
          record.error = { message };
          record.executionStatus = "failed";
          record.running = false;
          this.emit("execution.failed", { executionId, error: message });
          this.emitSnapshot(executionId);
        }
      } finally {
        session.off("tool-stream", handleToolStream);
        await session.disconnect?.();
        sessionRegistry?.close();
        this.executionRuntimes.delete(executionId);
      }
    })().catch((error) => {
      session.off("tool-stream", handleToolStream);
      const message = error instanceof Error ? error.message : String(error);
      record.status = "failed";
      record.finishedAt = new Date().toISOString();
      record.error = { message };
      record.executionStatus = "failed";
      record.running = false;
      this.emit("execution.failed", { executionId, error: message });
      this.emitSnapshot(executionId);
    });

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

  getToolStreamChunks(executionId: string, correlationId: string): ToolStreamChunk[] {
    return this.toolStreamStore
      .listChunks(correlationId)
      .filter((chunk) => chunk.executionId === executionId);
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
