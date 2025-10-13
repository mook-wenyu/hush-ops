import { EventEmitter } from "node:events";

import { execute } from "../executor/executor.js";
import type { ExecutionResult } from "../executor/types.js";
import type {
  RuntimeParams,
  RuntimeEvent,
  RuntimeEventPayloads,
  RuntimeExecutionStatus,
  RuntimePendingApprovalSummary,
  RuntimeBridgeMeta
} from "./types.js";
import type { BridgeState } from "../../mcp/bridge/types.js";
import { createLoggerFacade } from "../../shared/logging/logger.js";
import type { PlanNode } from "../plan/index.js";

export class OrchestratorRuntime extends EventEmitter {
  private currentBridgeState: BridgeState;

  private currentPlanId: string | null = null;

  private currentNodeId: string | null = null;

  private lastCompletedNodeId: string | null = null;

  private executionStatus: RuntimeExecutionStatus = "idle";

  private bridgeMeta: RuntimeBridgeMeta | undefined;

  private pendingApprovals: RuntimePendingApprovalSummary[] = [];

  private statusEmitPromise: Promise<void> | null = null;

  private readonly logger = createLoggerFacade("runtime");

  private running = false;

  private readonly originalRunner: RuntimeParams["executionContext"]["langGraphRunner"];

  constructor(private readonly params: RuntimeParams) {
    super();
    this.currentBridgeState = this.params.bridgeSession.getState();
    this.originalRunner = this.params.executionContext.langGraphRunner;
    this.params.bridgeSession.on("connected", () => this.handleBridgeStateChange("connected"));
    this.params.bridgeSession.on("disconnected", (payload?: { reason?: string }) =>
      this.handleBridgeStateChange("disconnected", { reason: payload?.reason })
    );
    this.params.bridgeSession.on(
      "reconnecting",
      (payload?: { attempt: number; delayMs: number }) =>
        this.handleBridgeStateChange("reconnecting", {
          attempt: payload?.attempt,
          delayMs: payload?.delayMs
        })
    );
    this.params.bridgeSession.on("error", (payload?: { error?: unknown }) => {
      const reason = payload?.error instanceof Error ? payload.error.message : "bridge error";
      this.handleBridgeStateChange("disconnected", { reason });
    });

    this.params.executionContext.approvalController?.setOnPending?.(async () => {
      await this.emitRuntimeStatus();
    });

    void this.emitRuntimeStatus();
  }

  private emitRuntimeEvent<T extends RuntimeEvent>(event: T, payload: RuntimeEventPayloads[T]) {
    this.emit(event, payload);
  }

  private async handleBridgeStateChange(state: BridgeState, meta?: RuntimeBridgeMeta) {
    this.currentBridgeState = state;
    this.bridgeMeta = meta;
    this.logger.info(`bridge state -> ${state}`, meta ? { meta } : undefined);
    await this.emitRuntimeStatus();
  }

  private async collectPendingApprovals(): Promise<RuntimePendingApprovalSummary[]> {
    const controller = this.params.executionContext.approvalController;
    if (!controller) {
      return [];
    }
    const store = controller.getStore?.();
    if (!store) {
      return this.pendingApprovals;
    }
    try {
      const pending = await store.listPending();
      return pending.map((entry) => ({
        id: entry.id,
        nodeId: entry.nodeId,
        nodeType: entry.nodeType,
        riskLevel: entry.riskLevel,
        requiresApproval: entry.requiresApproval,
        requestedAt: entry.requestedAt
      }));
    } catch (error) {
      this.logger.warn("list pending approvals failed", {
        error: error instanceof Error ? error.message : error
      });
      return this.pendingApprovals;
    }
  }

  private async emitRuntimeStatus(
    overrides: Partial<RuntimeEventPayloads["runtime:state-change"]> = {}
  ): Promise<void> {
    if (this.statusEmitPromise) {
      await this.statusEmitPromise;
    }
    this.statusEmitPromise = this.buildRuntimeStatus(overrides);
    try {
      await this.statusEmitPromise;
    } finally {
      this.statusEmitPromise = null;
    }
  }

  private async buildRuntimeStatus(
    overrides: Partial<RuntimeEventPayloads["runtime:state-change"]>
  ): Promise<void> {
    const pendingApprovals = await this.collectPendingApprovals();
    this.pendingApprovals = pendingApprovals;
    const payload: RuntimeEventPayloads["runtime:state-change"] = {
      bridgeState: this.currentBridgeState,
      bridgeMeta: this.bridgeMeta,
      planId: this.currentPlanId ?? this.params.planContext.plan.id,
      executionStatus: this.executionStatus,
      running: this.executionStatus === "running",
      currentNodeId: this.currentNodeId,
      lastCompletedNodeId: this.lastCompletedNodeId,
      pendingApprovals,
      ...overrides
    };
    this.emitRuntimeEvent("runtime:state-change", payload);
  }

  private buildRuntimeRunner(): RuntimeParams["executionContext"]["langGraphRunner"] {
    const original = this.originalRunner;
    return {
      start: async (plan, ctx) => {
        this.executionStatus = "running";
        this.currentPlanId = plan.id;
        await original?.start?.(plan, ctx);
        await this.emitRuntimeStatus();
      },
      beforeNode: async (node: PlanNode, ctx) => {
        this.currentNodeId = node.id;
        await this.emitRuntimeStatus();
        await original?.beforeNode?.(node, ctx);
      },
      afterNode: async (result, ctx) => {
        await original?.afterNode?.(result, ctx);
        this.lastCompletedNodeId = result.nodeId ?? null;
        this.currentNodeId = null;
        if (result.status === "failed") {
          this.executionStatus = "failed";
        }
        await this.emitRuntimeStatus();
      },
      finish: async (status, ctx) => {
        await original?.finish?.(status, ctx);
        this.executionStatus = status;
        this.currentNodeId = null;
        await this.emitRuntimeStatus();
      }
    };
  }

  getBridgeState(): BridgeState {
    return this.currentBridgeState;
  }

  async start(): Promise<ExecutionResult> {
    if (this.running) {
      throw new Error("Runtime 已在执行");
    }

    if (this.currentBridgeState !== "connected") {
      throw new Error("MCP Bridge 未连接，无法执行 Plan");
    }

    this.running = true;
    const planId = this.params.planContext.plan.id;
    this.currentPlanId = planId;
    this.executionStatus = "running";
    this.currentNodeId = null;

    const context = this.params.executionContext;
    context.langGraphRunner = this.buildRuntimeRunner();

    this.emitRuntimeEvent("runtime:execution-start", { planId });
    this.logger.info(`runtime start plan ${planId}`);
    await this.emitRuntimeStatus();

    let result: ExecutionResult;
    try {
      result = await execute(this.params.planContext, context);
      this.lastCompletedNodeId = result.lastNodeId ?? null;
      this.executionStatus = result.status;
      this.emitRuntimeEvent("runtime:execution-complete", {
        planId,
        result
      });
      this.logger.info(`runtime completed with status ${result.status}`);
      await this.emitRuntimeStatus();
    } catch (error) {
      this.executionStatus = "failed";
      this.emitRuntimeEvent("runtime:error", {
        planId,
        error
      });
      this.logger.error("runtime execution error", error);
      await this.emitRuntimeStatus();
      throw error;
    } finally {
      this.running = false;
      this.currentNodeId = null;
      context.langGraphRunner = this.originalRunner;
      await this.emitRuntimeStatus();
    }

    return result;
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.executionStatus = "cancelled";
    this.currentNodeId = null;
    this.logger.warn("runtime stopped by caller");
    await this.emitRuntimeStatus();
  }
}
