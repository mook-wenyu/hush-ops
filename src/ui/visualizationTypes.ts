import type { BridgeState } from "./types/orchestrator";

export const EXECUTION_VISUALIZATION_STATUSES = [
  "idle",
  "pending",
  "running",
  "success",
  "failed",
  "cancelled"
] as const;

export type ExecutionVisualizationStatus = (typeof EXECUTION_VISUALIZATION_STATUSES)[number];

export function isExecutionVisualizationStatus(value: string | null | undefined): value is ExecutionVisualizationStatus {
  if (!value) {
    return false;
  }
  return (EXECUTION_VISUALIZATION_STATUSES as readonly string[]).includes(value);
}

export type PlanNodeState = "default" | "active" | "completed";

export type PlanNodeEventType = "entered" | "completed" | "approval:queued" | "approval:resolved";

export interface PlanNodeEvent {
  readonly type: PlanNodeEventType;
  readonly timestamp: number;
  readonly source: "runtime" | "approvals";
}

export interface PlanNodeOverlayRenderContext {
  readonly planId: string | null;
  readonly planVersion: string | null;
  readonly executionStatus?: ExecutionVisualizationStatus;
  readonly bridgeState: BridgeState;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly nodeSubtitle?: string;
  readonly nodeDescription?: string;
  readonly nodeRiskLevel?: string;
  readonly nodeState: PlanNodeState;
  readonly pendingApproval: boolean;
  readonly events: readonly PlanNodeEvent[];
}
