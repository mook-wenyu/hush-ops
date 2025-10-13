import { describe, expect, it, vi, beforeEach } from "vitest";

import { loadPlan } from "../../src/orchestrator/plan/index.js";
import { dryRun, execute, createDefaultExecutionContext } from "../../src/orchestrator/executor/executor.js";
import type { ExecutionContext, ExecutionLogger } from "../../src/orchestrator/executor/types.js";
import { MemoryCheckpointStore } from "../../src/orchestrator/state/checkpoint.js";
import type { ExecuteResult, PlanNodeAdapter } from "../../src/orchestrator/adapters/base.js";

class TestCheckpointStore extends MemoryCheckpointStore {
  public saves: number = 0;

  override async save(planId: string, data: { lastNodeId?: string }): Promise<void> {
    await super.save(planId, data);
    this.saves += 1;
  }
}

function createLogger(): ExecutionLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("orchestrator executor", () => {
  let planContext: ReturnType<typeof loadPlan>;
  let checkpointStore: TestCheckpointStore;
  let adapters: Map<string, PlanNodeAdapter>;
  let sharedOutputs: ExecuteResult[];

  beforeEach(() => {
    const plan = {
      id: "demo-plan",
      version: "v1",
      entry: "n-seq",
      nodes: [
        {
          id: "n-seq",
          type: "sequence",
          children: ["n-local", "n-agent"]
        },
        {
          id: "n-local",
          type: "local_task",
          driver: "shell",
          command: "echo",
          args: ["hello"]
        },
        {
          id: "n-agent",
          type: "agent_invocation",
          agentName: "demo-agent"
        }
      ]
    };
    planContext = loadPlan(plan);

    checkpointStore = new TestCheckpointStore();
    sharedOutputs = [];

    const localTaskAdapter: PlanNodeAdapter = {
      type: "local_task",
      async dryRun(node) {
        if (node.type !== "local_task") {
          return { nodeId: node.id, warnings: ["节点类型不匹配"] };
        }
        if (!node.command) {
          return { nodeId: node.id, warnings: ["未提供 command"] };
        }
        return { nodeId: node.id };
      },
      async execute(node, ctx) {
        if (node.type !== "local_task") {
          throw new Error(`Unexpected node type: ${node.type}`);
        }
        ctx.sharedState.set(`${node.id}.result`, "ok");
        const result: ExecuteResult = {
          nodeId: node.id,
          status: "success",
          output: { command: node.command, args: node.args }
        };
        sharedOutputs.push(result);
        return result;
      }
    };

    const agentAdapter: PlanNodeAdapter = {
      type: "agent_invocation",
      async execute(node, ctx) {
        if (node.type !== "agent_invocation") {
          throw new Error(`Unexpected node type: ${node.type}`);
        }
        ctx.sharedState.set(`${node.id}.agent`, node.agentName);
        const result: ExecuteResult = {
          nodeId: node.id,
          status: "success",
          output: { agentName: node.agentName }
        };
        sharedOutputs.push(result);
        return result;
      }
    };

    adapters = new Map();
    adapters.set("local_task", localTaskAdapter);
    adapters.set("agent_invocation", agentAdapter);
  });

  it("performs dry run and reports no warnings", async () => {
    const logger = createLogger();
    const ctx: ExecutionContext = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      logger
    });

    const summary = await dryRun(planContext, ctx);
    expect(summary.planId).toBe("demo-plan");
    expect(summary.warnings).toHaveLength(0);
  });

  it("executes plan and writes checkpoints", async () => {
    const logger = createLogger();
    const ctx: ExecutionContext = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      logger,
      options: { checkpointOnEachNode: true }
    });

    const result = await execute(planContext, ctx);
    expect(result.status).toBe("success");
    expect(result.outputs["n-local"]).toEqual({ command: "echo", args: ["hello"] });
    expect(result.outputs["n-agent"]).toEqual({ agentName: "demo-agent" });
    expect(checkpointStore.saves).toBeGreaterThanOrEqual(2);
    expect(sharedOutputs).toHaveLength(2);
  });

  it("throws when adapter missing", async () => {
    const logger = createLogger();
    const ctx: ExecutionContext = createDefaultExecutionContext({
      planContext,
      adapters: new Map(),
      checkpointStore,
      logger
    });

    const result = await execute(planContext, ctx);
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(Error);
  });

  it("requests approval before executing high risk nodes", async () => {
    const logger = createLogger();
    const approvalController = {
      ensureApproval: vi.fn().mockResolvedValue(undefined)
    } as NonNullable<ExecutionContext["approvalController"]>;
    planContext = loadPlan({
      id: "approval-plan",
      version: "v2",
      entry: "n-local",
      nodes: [
        {
          id: "n-local",
          type: "local_task",
          driver: "shell",
          command: "echo",
          args: ["hello"],
          riskLevel: "high",
          requiresApproval: true
        }
      ]
    });
    adapters.set(
      "local_task",
      adapters.get("local_task")!
    );
    const ctx: ExecutionContext = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      logger,
      approvalController
    });

    const result = await execute(planContext, ctx);
    expect(result.status).toBe("success");
    expect(approvalController.ensureApproval).toHaveBeenCalledWith(
      "approval-plan",
      "v2",
      expect.objectContaining({ id: "n-local" })
    );
  });

  it("propagates approval rejection as failure", async () => {
    const logger = createLogger();
    const approvalController = {
      ensureApproval: vi.fn().mockRejectedValue(new Error("rejected"))
    } as NonNullable<ExecutionContext["approvalController"]>;
    planContext = loadPlan({
      id: "approval-plan-fail",
      version: "v2",
      entry: "n-local",
      nodes: [
        {
          id: "n-local",
          type: "local_task",
          driver: "shell",
          command: "echo",
          args: ["hello"],
          riskLevel: "high",
          requiresApproval: true
        }
      ]
    });
    const ctx: ExecutionContext = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      logger,
      approvalController
    });

    const result = await execute(planContext, ctx);
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(Error);
  });

  describe("JSON Logic handling", () => {
    it("uses JSON Logic object expression for conditional nodes", async () => {
      const logger = createLogger();
      planContext = loadPlan({
        id: "json-logic-object",
        version: "v1",
        entry: "root",
        nodes: [
          {
            id: "root",
            type: "sequence",
            children: ["cond"]
          },
          {
            id: "cond",
            type: "conditional",
            condition: {
              expression: { ">": [{ var: "metrics.score" }, 5] }
            },
            whenTrue: ["local-true"],
            whenFalse: ["agent-false"]
          },
          {
            id: "local-true",
            type: "local_task",
            driver: "shell",
            command: "echo",
            args: ["true"]
          },
          {
            id: "agent-false",
            type: "agent_invocation",
            agentName: "demo-agent"
          }
        ]
      });
      const ctx: ExecutionContext = createDefaultExecutionContext({
        planContext,
        adapters,
        checkpointStore,
        logger,
        initialSharedState: {
          metrics: { score: 10 }
        }
      });

      const result = await execute(planContext, ctx);
      expect(result.status).toBe("success");
      expect(result.outputs["local-true"]).toBeDefined();
      expect(result.outputs["agent-false"]).toBeUndefined();
      expect(sharedOutputs.map((entry) => entry.nodeId)).toEqual(["local-true"]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("evaluates JSON Logic string expression for conditional nodes", async () => {
      const logger = createLogger();
      planContext = loadPlan({
        id: "json-logic-string",
        version: "v1",
        entry: "root",
        nodes: [
          {
            id: "root",
            type: "sequence",
            children: ["cond"]
          },
          {
            id: "cond",
            type: "conditional",
            condition: {
              expression: '{"<":[{"var":"metrics.score"},5]}'
            },
            whenTrue: ["local-true"],
            whenFalse: ["agent-false"]
          },
          {
            id: "local-true",
            type: "local_task",
            driver: "shell",
            command: "echo",
            args: ["true"]
          },
          {
            id: "agent-false",
            type: "agent_invocation",
            agentName: "demo-agent"
          }
        ]
      });
      const ctx: ExecutionContext = createDefaultExecutionContext({
        planContext,
        adapters,
        checkpointStore,
        logger,
        initialSharedState: {
          metrics: { score: 10 }
        }
      });

      const result = await execute(planContext, ctx);
      expect(result.status).toBe("success");
      expect(result.outputs["local-true"]).toBeUndefined();
      expect(result.outputs["agent-false"]).toEqual({ agentName: "demo-agent" });
      expect(sharedOutputs.map((entry) => entry.nodeId)).toEqual(["agent-false"]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("supports shared state path expressions for conditional nodes", async () => {
      const logger = createLogger();
      planContext = loadPlan({
        id: "json-logic-path",
        version: "v1",
        entry: "root",
        nodes: [
          {
            id: "root",
            type: "sequence",
            children: ["cond"]
          },
          {
            id: "cond",
            type: "conditional",
            condition: {
              expression: "flags.shouldRun"
            },
            whenTrue: ["local-true"],
            whenFalse: ["agent-false"]
          },
          {
            id: "local-true",
            type: "local_task",
            driver: "shell",
            command: "echo",
            args: ["true"]
          },
          {
            id: "agent-false",
            type: "agent_invocation",
            agentName: "demo-agent"
          }
        ]
      });
      const ctx: ExecutionContext = createDefaultExecutionContext({
        planContext,
        adapters,
        checkpointStore,
        logger,
        initialSharedState: {
          flags: { shouldRun: true }
        }
      });

      const result = await execute(planContext, ctx);
      expect(result.status).toBe("success");
      expect(result.outputs["local-true"]).toBeDefined();
      expect(result.outputs["agent-false"]).toBeUndefined();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON Logic string at validation stage", () => {
      expect(() =>
        loadPlan({
          id: "json-logic-invalid",
          version: "v1",
          entry: "root",
          nodes: [
            {
              id: "root",
              type: "sequence",
              children: ["cond"]
            },
            {
              id: "cond",
              type: "conditional",
              condition: {
                expression: '{"var": "metrics.score"' // 缺少结尾大括号
              },
              whenTrue: ["local-true"],
              whenFalse: ["agent-false"]
            },
            {
              id: "local-true",
              type: "local_task",
              driver: "shell",
              command: "echo",
              args: ["true"]
            },
            {
              id: "agent-false",
              type: "agent_invocation",
              agentName: "demo-agent"
            }
          ]
        })
      ).toThrowError(/JSON Logic 表达式解析失败/);
    });

    it("applies JSON Logic collection for loop nodes", async () => {
      const logger = createLogger();
      planContext = loadPlan({
        id: "json-logic-loop",
        version: "v1",
        entry: "root",
        nodes: [
          {
            id: "root",
            type: "sequence",
            children: ["loop"]
          },
          {
            id: "loop",
            type: "loop",
            mode: "for-each",
            collectionPath: { var: "items" },
            body: ["local-task"],
            maxIterations: 5
          },
          {
            id: "local-task",
            type: "local_task",
            driver: "shell",
            command: "echo",
            args: ["loop"]
          }
        ]
      });

      const ctx: ExecutionContext = createDefaultExecutionContext({
        planContext,
        adapters,
        checkpointStore,
        logger,
        initialSharedState: {
          items: [1, 2, 3]
        }
      });

      const result = await execute(planContext, ctx);
      expect(result.status).toBe("success");
      expect(sharedOutputs.filter((entry) => entry.nodeId === "local-task")).toHaveLength(3);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("warns when loop collection returns non-array value", async () => {
      const logger = createLogger();
      planContext = loadPlan({
        id: "json-logic-loop-warn",
        version: "v1",
        entry: "loop",
        nodes: [
          {
            id: "loop",
            type: "loop",
            mode: "for-each",
            collectionPath: { var: "metrics.score" },
            body: ["local-task"],
            maxIterations: 5
          },
          {
            id: "local-task",
            type: "local_task",
            driver: "shell",
            command: "echo",
            args: ["loop"]
          }
        ]
      });

      const ctx: ExecutionContext = createDefaultExecutionContext({
        planContext,
        adapters,
        checkpointStore,
        logger,
        initialSharedState: {
          metrics: { score: 42 }
        }
      });

      const result = await execute(planContext, ctx);
      expect(result.status).toBe("success");
      expect(sharedOutputs.filter((entry) => entry.nodeId === "local-task")).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("集合表达式返回非数组结果"),
        expect.any(Object)
      );
    });
  });
});
