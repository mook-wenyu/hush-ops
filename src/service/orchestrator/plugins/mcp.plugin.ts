import type { FastifyPluginAsync } from "fastify/types/plugin.js";
import type { OrchestratorController } from "../controller.js";
import { listMcpServers } from "../../../mcp/config/loader.js";

interface McpPluginOptions {
  controller: OrchestratorController;
}

interface McpCallBody {
  arguments?: Record<string, unknown>;
  nodeId?: string;
  riskLevel?: "low" | "medium" | "high";
  useMockBridge?: boolean;
  mcpServer?: string;
}

interface ToolsQuery {
  useMockBridge?: string | boolean;
  mcpServer?: string;
}

function parseBoolean(value: string | boolean | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") {
      return true;
    }
    if (value === "0" || value.toLowerCase() === "false") {
      return false;
    }
  }
  return undefined;
}

export const mcpPlugin: FastifyPluginAsync<McpPluginOptions> = async (
  app,
  options
) => {
  const { controller } = options;
  const basePath = "/api/v1";
  const mcpServersRoute = `${basePath}/mcp/servers`;
  const mcpToolsRoute = `${basePath}/mcp/tools`;

  // GET /api/v1/mcp/servers - 列出MCP服务器
  app.get(mcpServersRoute, async () => {
    const servers = await listMcpServers().catch(() => []);
    return {
      servers: servers.map((server) => {
        const s: any = { name: server.name };
        if (server.description) s.description = server.description;
        return s;
      })
    };
  });

  // GET /api/v1/mcp/tools - 列出MCP工具
  app.get<{ Querystring: ToolsQuery }>(
    mcpToolsRoute,
    async (request, reply) => {
      const query = request.query;
      const useMockBridge = parseBoolean(query?.useMockBridge as any);
      try {
        const opts: any = {};
        if (typeof useMockBridge === "boolean")
          opts.useMockBridge = useMockBridge;
        if (typeof query?.mcpServer === "string")
          opts.mcpServer = query.mcpServer as string;
        const tools = await controller.listMcpTools(opts);
        return { tools };
      } catch (error) {
        reply.code(502);
        const message = error instanceof Error ? error.message : String(error);
        return { error: { code: "mcp_list_failed", message } };
      }
    }
  );

  // POST /api/v1/mcp/tools/:toolName - 调用MCP工具
  app.post<{
    Params: { toolName: string };
    Body: McpCallBody;
  }>(
    `${mcpToolsRoute}/:toolName`,
    async (request, reply) => {
      const { toolName } = request.params;
      const body = request.body;
      try {
        const call: any = { toolName };
        if (typeof body?.arguments !== "undefined")
          call.arguments = body.arguments;
        if (body?.nodeId) call.nodeId = body.nodeId;
        if (body?.riskLevel) call.riskLevel = body.riskLevel;
        if (typeof body?.useMockBridge === "boolean")
          call.useMockBridge = body.useMockBridge;
        if (typeof body?.mcpServer === "string")
          call.mcpServer = body.mcpServer;
        const result = await controller.callMcpTool(call);
        return { result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reply.code(502);
        return { error: { code: "mcp_call_failed", message } };
      }
    }
  );
};
