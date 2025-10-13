import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { loadPlan } from "../../src/orchestrator/plan/index.js";
import { createDefaultExecutionContext, execute } from "../../src/orchestrator/executor/executor.js";
import { MemoryCheckpointStore } from "../../src/orchestrator/state/checkpoint.js";
import { createDefaultAdapters } from "../../src/orchestrator/adapters/defaults.js";
import { OrchestratorRuntime } from "../../src/orchestrator/runtime/runtime.js";
import type { RuntimeEventPayloads } from "../../src/orchestrator/runtime/types.js";
import type { BridgeState } from "../../src/mcp/bridge/types.js";
import type { BridgeSession } from "../../src/mcp/bridge/session.js";
import type { ToolInvocation } from "../../src/mcp/bridge/types.js";
import { ApprovalStore } from "../../src/shared/approvals/store.js";
import { ApprovalController } from "../../src/shared/approvals/controller.js";
import type { PendingApprovalEntry } from "../../src/shared/approvals/types.js";

class FakeBridgeSession extends EventEmitter {
  private state: BridgeState = "connected";
  private disconnectCount = 0;

  async listTools() {
    return [{ name: "system.info" }];
  }

  async invokeTool(invocation: ToolInvocation) {
    this.emit("message", { method: "tools.invoke", params: invocation });
    if (this.disconnectCount < 2) {
      this.state = "disconnected";
      this.disconnectCount += 1;
      this.emit("disconnected", { reason: "simulated" });
      this.state = "reconnecting";
      this.emit("reconnecting", { attempt: this.disconnectCount, delayMs: 0 });
      this.state = "connected";
      this.emit("connected");
    }
    return { tool: invocation.toolName, ok: true };
  }

  getState() {
    return this.state;
  }

  async connect() {
    this.state = "connected";
    this.emit("connected");
  }

  async disconnect() {
    this.state = "disconnected";
    this.emit("disconnected", { reason: "manual" });
  }
}

async function waitForPending(store: ApprovalStore, timeoutMs = 5000): Promise<PendingApprovalEntry> {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pending = await store.listPending();
    const [nextEntry] = pending;
    if (nextEntry) {
      return nextEntry;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("等待审批超时");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("automatic execution runtime", () => {
  let planContext: ReturnType<typeof loadPlan>;
  let bridgeSession: BridgeSession;
  let approvalStore: ApprovalStore;
  let approvalController: ApprovalController;
  let approvalDir: string;

  beforeEach(async () => {
    const plan = {
      id: "demo-mixed",
      version: "v1",
      entry: "root",
      nodes: [
        {
          id: "root",
          type: "sequence",
          children: ["n-local", "n-agent", "n-mcp"]
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
          agentName: "demo-agent",
          input: { text: "demo" }
        },
        {
          id: "n-mcp",
          type: "mcp_tool",
          server: "default",
          toolName: "system.info",
          requiresApproval: true,
          riskLevel: "high"
        }
      ]
    } as const;
    planContext = loadPlan(plan);
    bridgeSession = new FakeBridgeSession() as unknown as BridgeSession;

    approvalDir = await mkdtemp(join(tmpdir(), "hush-ops-approvals-integration-"));
    approvalStore = new ApprovalStore({ directory: approvalDir });
    approvalController = new ApprovalController({
      store: approvalStore,
      pollIntervalMs: 50,
      decidedBy: "test"
    });
  });

  afterEach(async () => {
    await rm(approvalDir, { recursive: true, force: true });
  });

  it("gates execution when bridge disconnected", async () => {
    const adapters = createDefaultAdapters(bridgeSession);
    const checkpointStore = new MemoryCheckpointStore();

    const ctx = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      loggerCategory: "test-runtime",
      approvalController
    });

    const runtime = new OrchestratorRuntime({
      planContext,
      executionContext: ctx,
      bridgeSession
    });

    await (bridgeSession as unknown as FakeBridgeSession).disconnect();

    await expect(runtime.start()).rejects.toThrow(/未连接/);
  });

  it("continues execution across bridge reconnects with approval", async () => {
    const adapters = createDefaultAdapters(bridgeSession);
    const checkpointStore = new MemoryCheckpointStore();

    const ctx = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      loggerCategory: "test-runtime",
      approvalController
    });

    const runtime = new OrchestratorRuntime({
      planContext,
      executionContext: ctx,
      bridgeSession
    });

    const stateSnapshots: RuntimeEventPayloads["runtime:state-change"][] = [];
    runtime.on("runtime:state-change", (payload) => {
      stateSnapshots.push(payload);
    });

    const runPromise = runtime.start();
    const pendingEntry = await waitForPending(approvalStore);
    await vi.waitUntil(
      () =>
        stateSnapshots.some((snapshot) =>
          snapshot.pendingApprovals.some((approval) => approval.id === pendingEntry.id)
        ),
      { timeout: 2000 }
    );

    await approvalController.recordDecision(pendingEntry.id, "approved", "自动测试批准");
    const result = await runPromise;

    expect(result.status).toBe("success");
    const finalSnapshot = stateSnapshots.at(-1);
    expect(finalSnapshot?.executionStatus).toBe("success");
    expect(finalSnapshot?.running).toBe(false);
    expect(finalSnapshot?.lastCompletedNodeId).toBe("n-mcp");
    expect(result.outputs["n-mcp"]).toEqual({ tool: "system.info", ok: true });
  });

  it("executes via executor直接在审批后恢复", async () => {
    const adapters = createDefaultAdapters(bridgeSession);
    const checkpointStore = new MemoryCheckpointStore();

    const ctx = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      loggerCategory: "test-runtime",
      approvalController
    });

    const executePromise = execute(planContext, ctx);
    const pendingEntry = await waitForPending(approvalStore);
    await approvalController.recordDecision(pendingEntry.id, "approved", "直接批准");
    const result = await executePromise;
    expect(result.status).toBe("success");
  });
});
