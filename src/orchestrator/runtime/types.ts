import type { ExecutionResult, ExecutionContext, ExecutionStatus } from "../executor/types.js";
import type { PlanContext } from "../plan/index.js";
import type { BridgeSession } from "../../mcp/bridge/session.js";
import type { BridgeState } from "../../mcp/bridge/types.js";

export type RuntimeEvent =
  | "runtime:state-change"
  | "runtime:execution-start"
  | "runtime:execution-complete"
  | "runtime:error";

export type RuntimeExecutionStatus = ExecutionStatus | "idle" | "running";

export interface RuntimePendingApprovalSummary {
  id: string;
  nodeId: string;
  nodeType: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  requestedAt: string;
}

export interface RuntimeBridgeMeta {
  reason?: string | undefined;
  attempt?: number | undefined;
  delayMs?: number | undefined;
}

export interface RuntimeEventPayloads {
  "runtime:state-change": {
    bridgeState: BridgeState;
    bridgeMeta?: RuntimeBridgeMeta;
    planId: string;
    executionStatus: RuntimeExecutionStatus;
    running: boolean;
    currentNodeId?: string | null;
    lastCompletedNodeId?: string | null;
    pendingApprovals: RuntimePendingApprovalSummary[];
  };
  "runtime:execution-start": { planId: string };
  "runtime:execution-complete": { planId: string; result: ExecutionResult };
  "runtime:error": { planId: string; error: unknown };
}

export interface RuntimeOptions {
  autoReconnect?: boolean;
}

export interface RuntimeParams {
  planContext: PlanContext;
  executionContext: ExecutionContext;
  bridgeSession: BridgeSession;
  options?: RuntimeOptions;
}
