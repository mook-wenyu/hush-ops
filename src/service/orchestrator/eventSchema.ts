import { z } from "zod";

import { ORCHESTRATOR_EVENT_TOPICS } from "./types.js";

const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "必须是有效的 ISO 日期字符串");

const BridgeStateSchema = z.enum(["connecting", "connected", "disconnected", "reconnecting"]);

const RuntimeExecutionStatusSchema = z.enum(["idle", "running", "success", "failed", "cancelled"]);

const RiskLevelSchema = z.enum(["low", "medium", "high"]);

const RuntimeToolStreamStatusSchema = z.enum(["start", "success", "error"]);

const PendingApprovalEntrySchema = z.object({
  id: z.string(),
  planId: z.string(),
  planVersion: z.string(),
  nodeId: z.string(),
  nodeType: z.string(),
  riskLevel: RiskLevelSchema,
  requiresApproval: z.boolean(),
  requestedAt: isoDateString,
  requestedBy: z.string(),
  payload: z.record(z.unknown()).optional()
});

const CompletedApprovalEntrySchema = PendingApprovalEntrySchema.extend({
  status: z.enum(["approved", "rejected"]),
  decidedAt: isoDateString,
  decidedBy: z.string(),
  comment: z.string().optional()
});

const RuntimeToolStreamPayloadSchema = z.object({
  toolName: z.string(),
  message: z.string(),
  timestamp: isoDateString,
  status: RuntimeToolStreamStatusSchema,
  correlationId: z.string().optional(),
  executionId: z.string().optional(),
  planId: z.string().optional(),
  nodeId: z.string().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  sequence: z.number().optional(),
  replayed: z.boolean().optional(),
  storedAt: isoDateString.optional(),
  source: z.string().optional()
});

const ExecutionResultPayloadSchema = z.object({
  planId: z.string(),
  status: z.enum(["success", "failed", "cancelled"]),
  startedAt: isoDateString,
  finishedAt: isoDateString,
  lastNodeId: z.string().optional(),
  error: z.unknown().optional(),
  outputs: z.record(z.unknown())
});

const RuntimeBridgeMetaSchema = z
  .object({
    reason: z.string().optional(),
    attempt: z.number().optional(),
    delayMs: z.number().optional()
  })
  .partial();

const RuntimePendingApprovalSummarySchema = z.object({
  id: z.string(),
  nodeId: z.string().nullable().optional(),
  nodeType: z.string(),
  riskLevel: RiskLevelSchema,
  requiresApproval: z.boolean(),
  requestedAt: isoDateString
});

const RuntimeStateChangePayloadSchema = z.object({
  bridgeState: BridgeStateSchema,
  bridgeMeta: RuntimeBridgeMetaSchema.optional(),
  planId: z.string(),
  executionStatus: RuntimeExecutionStatusSchema,
  running: z.boolean(),
  currentNodeId: z.string().nullable().optional(),
  lastCompletedNodeId: z.string().nullable().optional(),
  pendingApprovals: z.array(RuntimePendingApprovalSummarySchema)
});

const RuntimeExecutionStartPayloadSchema = z.object({
  planId: z.string()
});

const RuntimeExecutionCompletePayloadSchema = z.object({
  planId: z.string(),
  result: ExecutionResultPayloadSchema
});

const RuntimeErrorPayloadSchema = z.object({
  planId: z.string(),
  error: z.unknown()
});

const ExecutionSnapshotPayloadSchema = z.object({
  executionId: z.string(),
  planId: z.string(),
  status: z.enum(["pending", "running", "success", "failed", "cancelled"]),
  executionStatus: z.enum(["idle", "running", "success", "failed", "cancelled"]),
  running: z.boolean(),
  executorType: z.enum(["mock", "mcp"]),
  createdAt: isoDateString,
  startedAt: isoDateString.optional(),
  finishedAt: isoDateString.optional(),
  currentNodeId: z.string().nullable().optional(),
  lastCompletedNodeId: z.string().nullable().optional(),
  pendingApprovals: z.array(PendingApprovalEntrySchema),
  bridgeState: BridgeStateSchema.optional(),
  bridgeMeta: RuntimeBridgeMetaSchema.optional(),
  result: ExecutionResultPayloadSchema.optional(),
  error: z
    .object({
      message: z.string()
    })
    .optional()
});

const ExecutionCreatedPayloadSchema = z.object({
  planId: z.string()
});

const ExecutionStartedPayloadSchema = z.object({
  planId: z.string()
});

const ExecutionCompletedPayloadSchema = ExecutionResultPayloadSchema;

const ExecutionFailedPayloadSchema = z.object({
  message: z.string()
});

const ExecutionCancelledPayloadSchema = z.object({
  planId: z.string()
});

const BridgeStateChangePayloadSchema = z.object({
  state: BridgeStateSchema,
  meta: RuntimeBridgeMetaSchema.optional()
});

const LogsAppendedPayloadSchema = z.object({
  category: z.literal("app"),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  context: z.record(z.unknown()).optional()
});

const TopicSchema = z.enum(ORCHESTRATOR_EVENT_TOPICS);

const ServiceConnectedPayloadSchema = z.object({
  message: z.string(),
  topics: z.array(TopicSchema)
});

const ServiceTopicsUpdatedPayloadSchema = z.object({
  topics: z.array(TopicSchema)
});

const ServiceErrorPayloadSchema = z.object({
  message: z.string()
});

const BaseEnvelopeSchema = {
  executionId: z.string().optional(),
  timestamp: isoDateString,
  topics: z.array(TopicSchema)
};

export const EventEnvelopeSchemas = [
  z.object({
    event: z.literal("runtime.state-change"),
    payload: RuntimeStateChangePayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("runtime.execution-start"),
    payload: RuntimeExecutionStartPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("runtime.execution-complete"),
    payload: RuntimeExecutionCompletePayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("runtime.error"),
    payload: RuntimeErrorPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("runtime.snapshot"),
    payload: ExecutionSnapshotPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("runtime.tool-stream"),
    payload: RuntimeToolStreamPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("execution.created"),
    payload: ExecutionCreatedPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("execution.started"),
    payload: ExecutionStartedPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("execution.completed"),
    payload: ExecutionCompletedPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("execution.failed"),
    payload: ExecutionFailedPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("execution.cancelled"),
    payload: ExecutionCancelledPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("approval.pending"),
    payload: PendingApprovalEntrySchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("approval.updated"),
    payload: CompletedApprovalEntrySchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("bridge.state-change"),
    payload: BridgeStateChangePayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("logs.appended"),
    payload: LogsAppendedPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("service.connected"),
    payload: ServiceConnectedPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("service.topics-updated"),
    payload: ServiceTopicsUpdatedPayloadSchema,
    ...BaseEnvelopeSchema
  }),
  z.object({
    event: z.literal("service.error"),
    payload: ServiceErrorPayloadSchema,
    ...BaseEnvelopeSchema
  })
] as const;

export const EventEnvelopeSchema = z.discriminatedUnion("event", EventEnvelopeSchemas);

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const EventNameSchema = z.enum(
  EventEnvelopeSchemas.map((schema) => schema.shape.event.value) as [
    "runtime.state-change",
    "runtime.execution-start",
    "runtime.execution-complete",
    "runtime.error",
    "runtime.snapshot",
    "runtime.tool-stream",
    "execution.created",
    "execution.started",
    "execution.completed",
    "execution.failed",
    "execution.cancelled",
    "approval.pending",
    "approval.updated",
    "bridge.state-change",
    "logs.appended",
    "service.connected",
    "service.topics-updated",
    "service.error"
  ]
);

export type EventName = z.infer<typeof EventNameSchema>;

export const EventPayloadSchemaMap = EventEnvelopeSchemas.reduce<Record<EventName, z.ZodTypeAny>>(
  (acc, schema) => {
    const eventLiteral = schema.shape.event;
    const eventName = eventLiteral.value as EventName;
    acc[eventName] = schema.shape.payload;
    return acc;
  },
  {} as Record<EventName, z.ZodTypeAny>
);

export const EventSchemaVersion = "2025-10-12";
