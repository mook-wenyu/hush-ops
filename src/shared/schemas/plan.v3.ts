import { z } from "zod";

// 兼容现有 Base 节点定义，按需复用并为 v3 提供显式边
const JsonLogicRuleSchema = z.union([z.string().min(1), z.record(z.unknown())]);

export const BasePlanNodeSchemaV3 = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  requiresApproval: z.boolean().default(false),
  retryPolicy: z
    .object({
      maxAttempts: z.number().int().min(1).max(5).default(3),
      backoffSeconds: z.number().int().min(1).max(3600).default(30)
    })
    .optional(),
  timeoutSeconds: z.number().int().min(1).max(86400).optional(),
  metadata: z.record(z.unknown()).optional(),
  // UI 扩展位保持与现有结构一致
  ui: z
    .object({
      position: z
        .object({ x: z.number(), y: z.number() })
        .partial()
        .optional()
    })
    .partial()
    .optional()
});

export const SequenceNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("sequence")
});

export const ParallelNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("parallel")
});

export const ConditionalNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("conditional"),
  condition: z.object({ expression: JsonLogicRuleSchema }),
  whenTrue: z.array(z.string().min(1)).min(1),
  whenFalse: z.array(z.string().min(1)).optional().default([])
});

export const LoopNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("loop"),
  mode: z.enum(["while", "for-each"]),
  condition: JsonLogicRuleSchema.optional(),
  collectionPath: JsonLogicRuleSchema.optional(),
  body: z.array(z.string().min(1)).min(1),
  maxIterations: z.number().int().min(1).max(1000).default(20)
});

export const HumanApprovalNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("human_approval"),
  approvalId: z.string().min(1),
  message: z.string().min(1),
  timeoutSeconds: z.number().int().min(60).max(604800).default(86400)
});

export const LocalTaskNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("local_task"),
  driver: z.enum(["shell", "http", "file", "scheduled"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  request: z
    .object({
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(),
      timeoutMs: z.number().int().min(1000).max(120000).default(10000)
    })
    .optional(),
  schedule: z
    .object({ cron: z.string().regex(/^[^\s]+(\s[^\s]+){4}$/) })
    .optional(),
  effectScope: z.enum(["filesystem", "network", "process"]).default("filesystem")
});

export const AgentInvocationNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("agent_invocation"),
  agentName: z.string().min(1),
  input: z.record(z.unknown()).optional(),
  preferredApiMode: z.enum(["chat_completions", "responses"]).optional()
});

export const McpToolNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("mcp_tool"),
  server: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
  sharedSession: z.boolean().default(true),
  onRiskyTool: z.string().optional()
});

export const ExternalServiceNodeSchemaV3 = BasePlanNodeSchemaV3.extend({
  type: z.literal("external_service"),
  provider: z.string().min(1),
  endpoint: z.string().url(),
  authRef: z.string().optional(),
  payload: z.record(z.unknown()).optional()
});

export const PlanNodeSchemaV3 = z.discriminatedUnion("type", [
  SequenceNodeSchemaV3,
  ParallelNodeSchemaV3,
  ConditionalNodeSchemaV3,
  LoopNodeSchemaV3,
  HumanApprovalNodeSchemaV3,
  LocalTaskNodeSchemaV3,
  AgentInvocationNodeSchemaV3,
  McpToolNodeSchemaV3,
  ExternalServiceNodeSchemaV3
]);

export const PlanEdgeSchemaV3 = z.object({
  id: z.string().min(1).optional(),
  source: z.string().min(1),
  target: z.string().min(1)
});

export const PlanSchemaV3 = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^v\d+(?:\.\d+)*$/),
  entry: z.string().min(1),
  nodes: z.array(PlanNodeSchemaV3).min(1),
  edges: z.array(PlanEdgeSchemaV3).min(1),
  description: z.string().optional()
});

export type PlanV3 = z.infer<typeof PlanSchemaV3>;
export type PlanV3Node = z.infer<typeof PlanNodeSchemaV3>;
export type PlanV3Edge = z.infer<typeof PlanEdgeSchemaV3>;

// 简易迁移：children -> edges（用于过渡期工具/示例）
export function migrateChildrenToEdges(plan: { id: string; version?: string; entry: string; nodes: Array<{ id: string; children?: string[] }>; description?: string }): PlanV3 {
  const edges: PlanV3Edge[] = [];
  for (const n of plan.nodes) {
    if (Array.isArray(n.children)) {
      for (const c of n.children) {
        edges.push({ id: `${n.id}->${c}` , source: n.id, target: c });
      }
    }
  }
  return {
    id: plan.id,
    version: plan.version ?? "v3.0.0",
    entry: plan.entry,
    description: plan.description,
    nodes: plan.nodes as any,
    edges
  };
}
