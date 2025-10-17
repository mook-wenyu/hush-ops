export {
  AgentInvocationNodeSchema,
  BasePlanNodeSchema as BaseNodeSchema,
  ConditionalNodeSchema,
  ExternalServiceNodeSchema,
  HumanApprovalNodeSchema,
  LocalTaskNodeSchema,
  LoopNodeSchema,
  McpToolNodeSchema,
  ParallelNodeSchema,
  PlanNodeSchema,
  PlanSchema,
  SequenceNodeSchema
} from "../../shared/schemas/plan.js";

export type { Plan, PlanNode, PlanNodeType as NodeType } from "../../shared/schemas/plan.js";

// v3 显式边版本（过渡期并行导出）
export { PlanSchemaV3 as PlanV3Schema, PlanEdgeSchemaV3 as PlanV3EdgeSchema } from "../../shared/schemas/plan.v3.js";
export type { PlanV3, PlanV3Node, PlanV3Edge } from "../../shared/schemas/plan.v3.js";
