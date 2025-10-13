import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadPlan } from "../../orchestrator/plan/index.js";
import { createDefaultExecutionContext } from "../../orchestrator/executor/executor.js";
import { JsonCheckpointStore } from "../../orchestrator/state/checkpoint.js";
import { BridgeClient } from "../../mcp/bridge/bridgeClient.js";
import { BridgeSession } from "../../mcp/bridge/session.js";
import type { BridgeState } from "../../mcp/bridge/types.js";
import { OrchestratorRuntime } from "../../orchestrator/runtime/runtime.js";
import { registerConfiguredAgents } from "../../agents/config/index.js";
import { getAgentPlugin } from "../../agents/registry.js";
import { createDefaultAdapters } from "../../orchestrator/adapters/defaults.js";
import { ApprovalController } from "../../shared/approvals/controller.js";
import { createLoggerFacade } from "../../shared/logging/logger.js";
import {
  getMcpServerConfig,
  listMcpServers,
  type McpServerConfig
} from "../../mcp/config/loader.js";

interface AutoExecuteLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface AutoExecuteOptions {
  planPath: string;
  databasePath?: string;
  useMockBridge?: boolean;
  mcpServer?: string;
  logger?: AutoExecuteLogger;
  onBridgeStateChange?: (state: BridgeState) => void;
  onExecutionComplete?: (payload: { status: string }) => void;
}

const autoExecLoggerFacade = createLoggerFacade("auto-exec");

const fallbackLogger: AutoExecuteLogger = {
  info: (message) => autoExecLoggerFacade.info(message),
  warn: (message) => autoExecLoggerFacade.warn(message),
  error: (message, error) => autoExecLoggerFacade.error(message, error)
};

class MockBridgeSession extends EventEmitter {
  private state: BridgeState = "connected";

  async listTools() {
    return [{ name: "mock.system.info", description: "Mock tool" }];
  }

  async invokeTool() {
    return { mock: true };
  }

  getState() {
    return this.state;
  }

  async connect() {
    this.state = "connected";
    this.emit("connected");
  }

  async disconnect() {
    this.state = "disconnected";
    this.emit("disconnected", { reason: "manual" });
  }
}

export async function createMockBridgeSession(): Promise<BridgeSession> {
  const mock = new MockBridgeSession();
  await mock.connect();
  return mock as unknown as BridgeSession;
}

function resolveCheckpointDirectory(databasePath?: string): string | null {
  if (!databasePath || databasePath.trim().length === 0) {
    return null;
  }
  const absolute = path.resolve(databasePath);
  if (path.extname(absolute)) {
    return path.dirname(absolute);
  }
  return absolute;
}

async function resolveServerConfig(preferred?: string): Promise<McpServerConfig> {
  if (preferred) {
    return getMcpServerConfig(preferred);
  }
  const servers = await listMcpServers();
  if (servers.length === 0) {
    throw new Error("未在 config/mcp.servers.json 配置任何 MCP server，无法建立桥接连接。");
  }
  const [first] = servers;
  if (!first) {
    throw new Error("未找到可用的 MCP server 配置。");
  }
  return first;
}

async function createBridgeSession(options: AutoExecuteOptions): Promise<BridgeSession> {
  if (options.useMockBridge) {
    return createMockBridgeSession();
  }
  const serverConfig = await resolveServerConfig(options.mcpServer);
  const bridgeLogger = options.logger ?? fallbackLogger;
  if (!options.mcpServer) {
    bridgeLogger.info(`[bridge] 未指定 --mcp-server，使用默认配置：${serverConfig.name}`);
  }
  const client = new BridgeClient({
    endpoint: serverConfig.endpoint,
    serverName: serverConfig.name,
    headers: serverConfig.headers,
    retry: serverConfig.retry,
    userId: serverConfig.session?.userId,
    sessionMetadata: {
      serverName: serverConfig.name,
      endpoint: serverConfig.endpoint,
      ...(serverConfig.session?.metadata ?? {})
    }
  });
  const session = new BridgeSession(client, {
    logger: {
      info: (msg) => bridgeLogger.info(`[bridge] ${msg}`),
      warn: (msg) => bridgeLogger.warn(`[bridge] ${msg}`),
      error: (msg, error) => bridgeLogger.error(`[bridge] ${msg}`, error)
    }
  });
  await session.connect();
  return session;
}

export async function runAutoExecution(options: AutoExecuteOptions) {
  const logger: AutoExecuteLogger = options.logger ?? fallbackLogger;

  const absolutePlan = path.resolve(options.planPath);
  const planRaw = JSON.parse(await readFile(absolutePlan, "utf-8"));
  const planContext = loadPlan(planRaw);

  await registerConfiguredAgents();
  getAgentPlugin("demand-analysis");

  const session = await createBridgeSession(options);
  const adapters = createDefaultAdapters(session);
  const approvalController = new ApprovalController();

  const checkpointDirectory = resolveCheckpointDirectory(options.databasePath);
  const checkpointStore = checkpointDirectory
    ? new JsonCheckpointStore(checkpointDirectory)
    : new JsonCheckpointStore();

  const executionContext = createDefaultExecutionContext({
    planContext,
    adapters,
    checkpointStore,
    loggerCategory: "auto-exec",
    approvalController
  });

  const runtime = new OrchestratorRuntime({
    planContext,
    executionContext,
    bridgeSession: session
  });

  runtime.on("runtime:state-change", ({ bridgeState }) => {
    options.onBridgeStateChange?.(bridgeState);
    logger.info(`[runtime] bridge state -> ${bridgeState}`);
  });
  runtime.on("runtime:execution-complete", ({ result }) => {
    options.onExecutionComplete?.({ status: result.status });
    logger.info(`[runtime] execution status: ${result.status}`);
  });

  try {
    const output = await runtime.start();
    return output;
  } finally {
    await session.disconnect?.();
  }
}
