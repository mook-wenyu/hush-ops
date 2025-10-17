import type { RuntimeExecutionStatus, RuntimeBridgeMeta } from "../../orchestrator/runtime/types.js";

export type BridgeState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface PendingApprovalEntry {
  id: string;
  planId: string;
  planVersion?: string;
  nodeId: string;
  nodeType: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  requestedAt: string;
  requestedBy: string;
  payload?: Record<string, unknown>;
  comment?: string | null;
}

export interface ExecutionRecord {
  id: string;
  planId: string;
  createdAt: string;
  executorType: "mock" | "mcp";
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  startedAt?: string;
  finishedAt?: string;
  bridgeStates: BridgeState[];
  result?: unknown;
  error?: { message: string };
  pendingApprovals: PendingApprovalEntry[];
  executionStatus?: RuntimeExecutionStatus;
  running?: boolean;
  currentNodeId?: string | null;
  lastCompletedNodeId?: string | null;
  bridgeState?: BridgeState;
  bridgeMeta?: RuntimeBridgeMeta;
}

export interface ExecutionSnapshot {
  executionId: string;
  planId: string;
  status: ExecutionRecord["status"];
  executionStatus: RuntimeExecutionStatus;
  running: boolean;
  executorType: ExecutionRecord["executorType"];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  currentNodeId?: string | null;
  lastCompletedNodeId?: string | null;
  pendingApprovals: PendingApprovalEntry[];
  bridgeState?: BridgeState;
  bridgeMeta?: RuntimeBridgeMeta;
  result?: unknown;
  error?: { message: string };
}

export interface OrchestratorEventEnvelope {
  event: string;
  executionId?: string;
  payload?: unknown;
  topics?: string[];
  timestamp: string;
}

export interface RuntimeToolStreamPayload {
  toolName: string;
  message: string;
  timestamp: string;
  status?: "start" | "success" | "error";
  correlationId?: string;
  executionId?: string;
  planId?: string;
  nodeId?: string;
  result?: unknown;
  error?: string;
  sequence?: number;
  replayed?: boolean;
  storedAt?: string;
  source?: string;
}

export interface ToolStreamSummary {
  correlationId: string;
  toolName: string;
  executionId?: string;
  planId?: string;
  nodeId?: string;
  chunkCount: number;
  latestSequence: number;
  updatedAt: string;
  completed: boolean;
  hasError: boolean;
}
