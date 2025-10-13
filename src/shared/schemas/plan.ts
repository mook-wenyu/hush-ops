import { z } from "zod";

const JsonLogicRuleSchema = z.union([
  z
    .string()
    .min(1)
    .superRefine((value, ctx) => {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          JSON.parse(trimmed);
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `JSON Logic 表达式解析失败: ${(error as Error).message}`
          });
        }
      }
    }),
  z.record(z.unknown())
]);

export const BasePlanNodeSchema = z.object({
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
  metadata: z.record(z.unknown()).optional()
});

export const SequenceNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("sequence"),
  children: z.array(z.string().min(1)).min(1)
});

export const ParallelNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("parallel"),
  children: z.array(z.string().min(1)).min(1)
});

export const ConditionalNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("conditional"),
  condition: z.object({ expression: JsonLogicRuleSchema }),
  whenTrue: z.array(z.string().min(1)).min(1),
  whenFalse: z.array(z.string().min(1)).optional().default([])
});

export const LoopNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("loop"),
  mode: z.enum(["while", "for-each"]),
  condition: JsonLogicRuleSchema.optional(),
  collectionPath: JsonLogicRuleSchema.optional(),
  body: z.array(z.string().min(1)).min(1),
  maxIterations: z.number().int().min(1).max(1000).default(20)
});

export const HumanApprovalNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("human_approval"),
  approvalId: z.string().min(1),
  message: z.string().min(1),
  timeoutSeconds: z.number().int().min(60).max(604800).default(86400)
});

export const LocalTaskNodeSchema = BasePlanNodeSchema.extend({
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

export const AgentInvocationNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("agent_invocation"),
  agentName: z.string().min(1),
  input: z.record(z.unknown()).optional(),
  preferredApiMode: z.enum(["chat_completions", "responses"]).optional()
});

export const McpToolNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("mcp_tool"),
  server: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
  sharedSession: z.boolean().default(true),
  onRiskyTool: z.string().optional()
});

export const ExternalServiceNodeSchema = BasePlanNodeSchema.extend({
  type: z.literal("external_service"),
  provider: z.string().min(1),
  endpoint: z.string().url(),
  authRef: z.string().optional(),
  payload: z.record(z.unknown()).optional()
});

export const PlanNodeSchema = z.discriminatedUnion("type", [
  SequenceNodeSchema,
  ParallelNodeSchema,
  ConditionalNodeSchema,
  LoopNodeSchema,
  HumanApprovalNodeSchema,
  LocalTaskNodeSchema,
  AgentInvocationNodeSchema,
  McpToolNodeSchema,
  ExternalServiceNodeSchema
]);

export const PlanSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^v\d+(?:\.\d+)*$/),
  entry: z.string().min(1),
  nodes: z.array(PlanNodeSchema).min(1)
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanNode = z.infer<typeof PlanNodeSchema>;
export type PlanNodeType = PlanNode["type"];
