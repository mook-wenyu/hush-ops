import type { AdapterRegistry, PlanNodeAdapter, ExecuteResult } from "./base.js";
import type { BridgeSession } from "../../mcp/bridge/session.js";
import type { PlanNode } from "../plan/index.js";
import { createLocalTaskAdapter } from "./localTask.js";

function createAgentInvocationAdapter(): PlanNodeAdapter<Extract<PlanNode, { type: "agent_invocation" }>> {
  return {
    type: "agent_invocation",
    async execute(node, ctx) {
      const output = {
        agentName: node.agentName,
        input: node.input
      };
      ctx.sharedState.set(`${node.id}.output`, output);
      const result: ExecuteResult = {
        nodeId: node.id,
        status: "success",
        output
      };
      return result;
    }
  };
}

function createMcpToolAdapter(session: BridgeSession): PlanNodeAdapter<Extract<PlanNode, { type: "mcp_tool" }>> {
  return {
    type: "mcp_tool",
    async execute(node, ctx) {
      const response = await session.invokeTool({
        toolName: node.toolName,
        arguments: node.arguments as Record<string, unknown> | undefined,
        options: {
          nodeId: node.id,
          riskLevel: node.riskLevel
        }
      });
      ctx.sharedState.set(`${node.id}.output`, response);
      const result: ExecuteResult = {
        nodeId: node.id,
        status: "success",
        output: response
      };
      return result;
    }
  };
}

export function createDefaultAdapters(session: BridgeSession): AdapterRegistry {
  const registry: AdapterRegistry = new Map();
  registry.set("local_task", createLocalTaskAdapter());
  registry.set("agent_invocation", createAgentInvocationAdapter());
  registry.set("mcp_tool", createMcpToolAdapter(session));
  return registry;
}
