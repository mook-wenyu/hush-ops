import type {
  ExecutionRecord,
  PendingApprovalEntry,
  RuntimeToolStreamPayload,
  ToolStreamSummary
} from "../types/orchestrator";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000/api/v1";

function getBaseUrl(): string {
  const value = import.meta.env.VITE_ORCHESTRATOR_BASE_URL;
  if (typeof value === "string" && value.trim().length > 0) {
    return value.replace(/\/$/, "");
  }
  return DEFAULT_BASE_URL;
}

export async function fetchExecutions(signal?: AbortSignal): Promise<ExecutionRecord[]> {
  const url = `${getBaseUrl()}/executions`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`获取执行列表失败 (${response.status})`);
  }
  const body = (await response.json()) as { executions: ExecutionRecord[] };
  return body.executions;
}

export function createWebSocket(topics: string[]): WebSocket {
  const baseUrl = getBaseUrl();
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.pathname = "/ws";
  if (topics.length > 0) {
    wsUrl.searchParams.set("topics", topics.join(","));
  }
  return new WebSocket(wsUrl);
}

interface DryRunResponse {
  planId: string;
  warnings: string[];
}

interface ExecuteResponse {
  executionId: string;
  status: string;
  planId: string;
}

export async function dryRunPlan(plan: unknown): Promise<DryRunResponse> {
  const response = await fetch(`${getBaseUrl()}/plans/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan })
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `dry-run 失败 (${response.status})`);
  }
  return (await response.json()) as DryRunResponse;
}

export async function executePlan(plan: unknown, serverName?: string): Promise<ExecuteResponse> {
  const response = await fetch(`${getBaseUrl()}/plans/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan,
      mcpServer: serverName
    })
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `执行计划失败 (${response.status})`);
  }
  return (await response.json()) as ExecuteResponse;
}

export async function submitApprovalDecision(
  id: string,
  decision: "approved" | "rejected",
  comment?: string
): Promise<void> {
  const response = await fetch(`${getBaseUrl()}/approvals/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, comment })
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `提交审批失败 (${response.status})`);
  }
}

export async function stopExecution(id: string): Promise<void> {
  const response = await fetch(`${getBaseUrl()}/executions/${encodeURIComponent(id)}/stop`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `停止执行失败 (${response.status})`);
  }
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
}

export interface McpServerSummary {
  name: string;
  description?: string;
}

export async function fetchMcpServers(): Promise<McpServerSummary[]> {
  const response = await fetch(`${getBaseUrl()}/mcp/servers`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `获取 MCP 配置列表失败 (${response.status})`);
  }
  const payload = (await response.json()) as { servers?: McpServerSummary[] };
  return payload.servers ?? [];
}

export async function fetchMcpTools(serverName?: string): Promise<McpToolDescriptor[]> {
  const url = new URL(`${getBaseUrl()}/mcp/tools`);
  if (serverName) {
    url.searchParams.set("mcpServer", serverName);
  }
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `获取 MCP 工具失败 (${response.status})`);
  }
  const payload = (await response.json()) as { tools: McpToolDescriptor[] };
  return payload.tools ?? [];
}

export async function callMcpTool(toolName: string, payload: unknown, serverName?: string): Promise<unknown> {
  const response = await fetch(`${getBaseUrl()}/mcp/tools/${encodeURIComponent(toolName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      arguments: payload,
      mcpServer: serverName
    })
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `调用 MCP 工具失败 (${response.status})`);
  }
  const result = (await response.json()) as { result: unknown };
  return result.result;
}

export interface RequestApprovalPayload {
  executionId?: string;
  planId?: string;
  planVersion?: string;
  nodeId?: string;
  nodeType?: string;
  riskLevel?: "low" | "medium" | "high";
  requiresApproval?: boolean;
  requestedBy?: string;
  metadata?: Record<string, unknown>;
  title?: string;
}

export async function requestApproval(payload: RequestApprovalPayload): Promise<PendingApprovalEntry> {
  const response = await fetch(`${getBaseUrl()}/approvals/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `创建审批请求失败 (${response.status})`);
  }
  const result = (await response.json()) as { approval: PendingApprovalEntry };
  return result.approval;
}

export async function fetchExecutionToolStreamSummaries(executionId: string): Promise<ToolStreamSummary[]> {
  const response = await fetch(`${getBaseUrl()}/executions/${encodeURIComponent(executionId)}/tool-streams`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `获取流式历史失败 (${response.status})`);
  }
  const payload = (await response.json()) as { streams?: ToolStreamSummary[] };
  return payload.streams ?? [];
}

export async function fetchExecutionToolStreamChunks(
  executionId: string,
  correlationId: string
): Promise<RuntimeToolStreamPayload[]> {
  const response = await fetch(
    `${getBaseUrl()}/executions/${encodeURIComponent(executionId)}/tool-streams/${encodeURIComponent(correlationId)}`
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `获取流式输出明细失败 (${response.status})`);
  }
  const payload = (await response.json()) as { chunks?: RuntimeToolStreamPayload[] };
  return payload.chunks ?? [];
}

export async function replayExecutionToolStream(executionId: string, correlationId: string): Promise<number> {
  const response = await fetch(
    `${getBaseUrl()}/executions/${encodeURIComponent(executionId)}/tool-streams/${encodeURIComponent(correlationId)}/replay`,
    {
      method: "POST"
    }
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `重放流式输出失败 (${response.status})`);
  }
  const payload = (await response.json()) as { replayed: number };
  return payload.replayed;
}
