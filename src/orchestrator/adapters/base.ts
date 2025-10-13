import type { PlanNode } from "../plan/index.js";
import type { ExecutionContext } from "../executor/types.js";

export interface DryRunResult {
  readonly nodeId: string;
  readonly warnings?: string[];
}

export interface ExecuteResult {
  readonly nodeId: string;
  readonly status: "success" | "failed" | "skipped";
  readonly output?: unknown;
  readonly error?: unknown;
}

export interface PlanNodeAdapter<TNode extends PlanNode = PlanNode> {
  readonly type: TNode["type"];
  dryRun?(node: TNode, context: ExecutionContext): Promise<DryRunResult | void>;
  execute(node: TNode, context: ExecutionContext): Promise<ExecuteResult>;
}

export type AdapterRegistry = Map<string, PlanNodeAdapter>;
