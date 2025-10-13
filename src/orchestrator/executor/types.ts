import type { Plan, PlanContext, PlanNode } from "../plan/index.js";
import type { AdapterRegistry, ExecuteResult, PlanNodeAdapter } from "../adapters/base.js";
import type { CheckpointStore } from "../state/checkpoint.js";
import type { PendingApprovalEntry } from "../../shared/approvals/types.js";

export type ExecutionStatus = "success" | "failed" | "cancelled";

export interface ExecutionLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
}

export interface SharedStateStore {
  get(path: string): unknown;
  set(path: string, value: unknown): void;
  toJSON(): Record<string, unknown>;
}

export interface LangGraphRunner {
  start(plan: Plan, context: ExecutionContext): Promise<void>;
  beforeNode?(node: PlanNode, context: ExecutionContext): Promise<void>;
  afterNode?(result: ExecuteResult, context: ExecutionContext): Promise<void>;
  finish(status: ExecutionStatus, context: ExecutionContext): Promise<void>;
}

export interface ExecutionOptions {
  checkpointOnEachNode?: boolean;
}

export interface ExecutionContext {
  readonly planContext: PlanContext;
  readonly adapters: AdapterRegistry;
  readonly checkpointStore: CheckpointStore;
  readonly sharedState: SharedStateStore;
  readonly logger: ExecutionLogger;
  langGraphRunner?: LangGraphRunner;
  readonly approvalController?: {
    ensureApproval(planId: string, planVersion: string, node: PlanNode): Promise<void>;
    setOnPending?(
      handler: (entry: PendingApprovalEntry) => Promise<void> | void
    ): void;
    getStore?(): {
      listPending(): Promise<
        Array<
          Pick<
            PendingApprovalEntry,
            "id" | "nodeId" | "nodeType" | "riskLevel" | "requiresApproval" | "requestedAt"
          >
        >
      >;
    };
  };
  readonly options?: ExecutionOptions;
}

export interface ExecutionResult {
  readonly planId: string;
  readonly status: ExecutionStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly lastNodeId?: string;
  readonly error?: unknown;
  readonly outputs: Record<string, unknown>;
}

export interface DryRunSummary {
  readonly planId: string;
  readonly warnings: string[];
}

export interface AdapterResolver {
  resolve(node: PlanNode): PlanNodeAdapter;
}
