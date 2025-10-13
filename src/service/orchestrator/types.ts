export const ORCHESTRATOR_EVENT_TOPICS = [
  "runtime",
  "execution",
  "bridge",
  "approvals",
  "logs",
  "system"
] as const;

export type OrchestratorEventTopic = (typeof ORCHESTRATOR_EVENT_TOPICS)[number];

export interface OrchestratorEventEnvelope<TPayload = unknown> {
  readonly event: string;
  readonly payload: TPayload;
  readonly executionId?: string;
  readonly timestamp: string;
  readonly topics: OrchestratorEventTopic[];
}

export type RuntimeToolStreamStatus = "start" | "success" | "error";

export interface RuntimeToolStreamPayload {
  readonly toolName: string;
  readonly message: string;
  readonly timestamp: string;
  readonly status: RuntimeToolStreamStatus;
  readonly correlationId?: string;
  readonly executionId?: string;
  readonly planId?: string;
  readonly nodeId?: string;
  readonly result?: unknown;
  readonly error?: string;
  readonly sequence?: number;
  readonly replayed?: boolean;
  readonly storedAt?: string;
  readonly source?: string;
}

export interface ToolStreamChunkPayload extends RuntimeToolStreamPayload {
  readonly sequence: number;
  readonly storedAt: string;
}

export interface ToolStreamSummaryPayload {
  readonly correlationId: string;
  readonly toolName: string;
  readonly executionId?: string;
  readonly planId?: string;
  readonly nodeId?: string;
  readonly chunkCount: number;
  readonly latestSequence: number;
  readonly updatedAt: string;
  readonly completed: boolean;
  readonly hasError: boolean;
}

export type OrchestratorSubscriptionMessage =
  | { readonly type: "subscribe"; readonly topics: OrchestratorEventTopic[] }
  | { readonly type: "unsubscribe"; readonly topics: OrchestratorEventTopic[] };
