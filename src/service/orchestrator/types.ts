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
  readonly correlationId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly planId?: string | undefined;
  readonly nodeId?: string | undefined;
  readonly result?: unknown;
  readonly error?: string | undefined;
  readonly sequence?: number | undefined;
  readonly replayed?: boolean | undefined;
  readonly storedAt?: string | undefined;
  readonly source?: string | undefined;
}

export interface ToolStreamChunkPayload extends RuntimeToolStreamPayload {
  readonly sequence: number;
  readonly storedAt: string;
}

export interface ToolStreamSummaryPayload {
  readonly correlationId: string;
  readonly toolName: string;
  readonly executionId?: string | undefined;
  readonly planId?: string | undefined;
  readonly nodeId?: string | undefined;
  readonly chunkCount: number;
  readonly latestSequence: number;
  readonly updatedAt: string;
  readonly completed: boolean;
  readonly hasError: boolean;
}

export type OrchestratorSubscriptionMessage =
  | { readonly type: "subscribe"; readonly topics: OrchestratorEventTopic[] }
  | { readonly type: "unsubscribe"; readonly topics: OrchestratorEventTopic[] };
