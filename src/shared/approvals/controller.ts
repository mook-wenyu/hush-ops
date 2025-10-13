import { randomUUID } from "node:crypto";

import type { PlanNode } from "../../orchestrator/plan/index.js";
import { ApprovalStore } from "./store.js";
import type {
  PendingApprovalEntry,
  CompletedApprovalEntry,
  ApprovalStatus
} from "./types.js";
import { createLoggerFacade } from "../logging/logger.js";
import type { LoggerFacade } from "../logging/logger.js";

export interface ApprovalControllerOptions {
  store?: ApprovalStore;
  pollIntervalMs?: number;
  requestedBy?: string;
  decidedBy?: string;
  onPending?: (entry: PendingApprovalEntry) => Promise<void> | void;
}

export interface ManualApprovalRequest {
  planId: string;
  planVersion?: string;
  nodeId: string;
  nodeType?: string;
  riskLevel?: "low" | "medium" | "high";
  requiresApproval?: boolean;
  requestedBy?: string;
  payload?: Record<string, unknown>;
}

export class ApprovalController {
  private readonly store: ApprovalStore;

  private readonly pollIntervalMs: number;

  private readonly logger: LoggerFacade;

  private readonly requestedBy: string;

  private readonly decidedBy: string;

  private onPendingCallback?: (entry: PendingApprovalEntry) => Promise<void> | void;

  constructor(options: ApprovalControllerOptions = {}) {
    this.store = options.store ?? new ApprovalStore();
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.requestedBy = options.requestedBy ?? "orchestrator";
    this.decidedBy = options.decidedBy ?? "cli";
    this.logger = createLoggerFacade("approvals");
    this.onPendingCallback = options.onPending;
  }

  setOnPending(callback: (entry: PendingApprovalEntry) => Promise<void> | void) {
    this.onPendingCallback = callback;
  }

  private buildPendingEntry(planId: string, planVersion: string, node: PlanNode): PendingApprovalEntry {
    return {
      id: `APP-${randomUUID()}`,
      planId,
      planVersion,
      nodeId: node.id,
      nodeType: node.type,
      riskLevel: node.riskLevel ?? "low",
      requiresApproval: Boolean(node.requiresApproval),
      requestedAt: new Date().toISOString(),
      requestedBy: this.requestedBy,
      payload: {
        metadata: node.metadata ?? {}
      }
    };
  }

  private async waitForDecision(id: string): Promise<CompletedApprovalEntry> {
    while (true) {
      const decision = await this.store.findDecision(id);
      if (decision) {
        return decision;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  async ensureApproval(planId: string, planVersion: string, node: PlanNode): Promise<void> {
    const requiresApproval = Boolean(node.requiresApproval) || node.riskLevel === "high";
    if (!requiresApproval) {
      return;
    }

    const pending = this.buildPendingEntry(planId, planVersion, node);
    await this.store.appendPending(pending);
    await this.onPendingCallback?.(pending);
    this.logger.info(`pending approval ${pending.id}`, {
      planId,
      nodeId: node.id,
      riskLevel: node.riskLevel ?? "low"
    });

    const decision = await this.waitForDecision(pending.id);
    if (decision.status === "approved") {
      return;
    }
    throw new Error(`节点 ${node.id} 的审批被拒绝：${decision.comment ?? "无备注"}`);
  }

  async createManualApproval(request: ManualApprovalRequest): Promise<PendingApprovalEntry> {
    const entry: PendingApprovalEntry = {
      id: `APP-${randomUUID()}`,
      planId: request.planId,
      planVersion: request.planVersion ?? "manual",
      nodeId: request.nodeId,
      nodeType: request.nodeType ?? "plugin_action",
      riskLevel: request.riskLevel ?? "medium",
      requiresApproval: request.requiresApproval ?? true,
      requestedAt: new Date().toISOString(),
      requestedBy: request.requestedBy ?? this.requestedBy,
      payload: request.payload ?? {}
    };
    await this.store.appendPending(entry);
    await this.onPendingCallback?.(entry);
    this.logger.info(`manual approval ${entry.id} pending`, {
      planId: entry.planId,
      nodeId: entry.nodeId,
      nodeType: entry.nodeType,
      riskLevel: entry.riskLevel
    });
    return entry;
  }

  async recordDecision(
    id: string,
    status: Exclude<ApprovalStatus, "pending">,
    comment?: string
  ): Promise<CompletedApprovalEntry> {
    const pending = await this.store.findPending(id);
    if (!pending) {
      throw new Error(`找不到待审批项 ${id}`);
    }
    const completed: CompletedApprovalEntry = {
      ...pending,
      status,
      decidedAt: new Date().toISOString(),
      decidedBy: this.decidedBy,
      comment
    };
    await this.store.appendCompleted(completed);
    this.logger.info(`approval ${id} -> ${status}`, {
      planId: completed.planId,
      nodeId: completed.nodeId,
      comment
    });
    return completed;
  }

  getStore() {
    return this.store;
  }
}
