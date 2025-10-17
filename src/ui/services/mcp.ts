import { requestJson } from "./core/http";

export interface McpToolDescriptor {
  name: string;
  description?: string;
}
export interface McpServerSummary {
  name: string;
  description?: string;
}

export async function fetchMcpServers(): Promise<McpServerSummary[]> {
  const payload = await requestJson<{ servers?: McpServerSummary[] }>("GET", "/mcp/servers");
  return payload.servers ?? [];
}

export async function fetchMcpTools(serverName?: string): Promise<McpToolDescriptor[]> {
  const payload = await requestJson<{ tools: McpToolDescriptor[] }>("GET", "/mcp/tools", {
    query: { mcpServer: serverName ?? undefined }
  });
  return payload.tools ?? [];
}

export async function callMcpTool(toolName: string, payload: unknown, serverName?: string): Promise<unknown> {
  const res = await requestJson<{ result: unknown }>("POST", `/mcp/tools/${encodeURIComponent(toolName)}`, {
    body: { arguments: payload, mcpServer: serverName }
  });
  return res.result;
}
