import type { RuntimeToolStreamPayload, ToolStreamSummary } from "../types/orchestrator.js";
import { getBaseUrl, requestJson } from "./core/http.js";

export function buildToolStreamExportUrl(
  executionId: string,
  correlationId: string,
  opts?: { format?: "json" | "ndjson"; compress?: boolean }
) {
  const base = getBaseUrl();
  const fmt = opts?.format ?? "json";
  const comp = opts?.compress ? "1" : "0";
  return `${base}/executions/${encodeURIComponent(executionId)}/tool-streams/${encodeURIComponent(
    correlationId
  )}/export?format=${fmt}&compress=${comp}`;
}

export function buildGlobalToolStreamExportUrl(
  correlationId: string,
  opts?: { format?: "json" | "ndjson"; compress?: boolean }
) {
  const base = getBaseUrl();
  const fmt = opts?.format ?? "json";
  const comp = opts?.compress ? "1" : "0";
  return `${base}/tool-streams/${encodeURIComponent(
    correlationId
  )}/export?format=${fmt}&compress=${comp}`;
}

export async function fetchExecutionToolStreamSummaries(
  executionId: string
): Promise<ToolStreamSummary[]> {
  const payload = await requestJson<{ streams?: ToolStreamSummary[] }>(
    "GET",
    `/executions/${encodeURIComponent(executionId)}/tool-streams`
  );
  return payload.streams ?? [];
}

export async function fetchGlobalToolStreamSummaries(params?: {
  executionId?: string;
  onlyErrors?: boolean;
  limit?: number;
  offset?: number;
  tool?: string;
  correlationPrefix?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}): Promise<{ total: number; streams: ToolStreamSummary[] }> {
  const payload = await requestJson<{ total?: number; streams?: ToolStreamSummary[] }>("GET", "/tool-streams", {
    query: {
      executionId: params?.executionId ?? undefined,
      onlyErrors: typeof params?.onlyErrors === "boolean" ? (params.onlyErrors ? 1 : 0) : undefined,
      limit: typeof params?.limit === "number" ? params.limit : undefined,
      offset: typeof params?.offset === "number" ? params.offset : undefined,
      tool: params?.tool ?? undefined,
      correlationPrefix: params?.correlationPrefix ?? undefined,
      updatedAfter: params?.updatedAfter ?? undefined,
      updatedBefore: params?.updatedBefore ?? undefined
    }
  });
  return { total: payload.total ?? payload.streams?.length ?? 0, streams: payload.streams ?? [] };
}

export async function fetchExecutionToolStreamChunks(
  executionId: string,
  correlationId: string
): Promise<RuntimeToolStreamPayload[]> {
  const payload = await requestJson<{ chunks?: RuntimeToolStreamPayload[] }>(
    "GET",
    `/executions/${encodeURIComponent(executionId)}/tool-streams/${encodeURIComponent(correlationId)}`
  );
  return payload.chunks ?? [];
}

export async function fetchGlobalToolStreamChunks(
  correlationId: string
): Promise<RuntimeToolStreamPayload[]> {
  const payload = await requestJson<{ chunks?: RuntimeToolStreamPayload[] }>(
    "GET",
    `/tool-streams/${encodeURIComponent(correlationId)}`
  );
  return payload.chunks ?? [];
}

export async function replayExecutionToolStream(
  executionId: string,
  correlationId: string
): Promise<number> {
  const payload = await requestJson<{ replayed: number }>(
    "POST",
    `/executions/${encodeURIComponent(executionId)}/tool-streams/${encodeURIComponent(correlationId)}/replay`
  );
  return payload.replayed;
}
