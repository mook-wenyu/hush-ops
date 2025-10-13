import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { Command, Flags } from "@oclif/core";

import { registerConfiguredAgents } from "../../../agents/config/index.js";
import { getAgentPlugin } from "../../../agents/registry.js";
import { loadPlan } from "../../../orchestrator/plan/index.js";
import { MemoryCheckpointStore } from "../../../orchestrator/state/checkpoint.js";
import { createDefaultExecutionContext, dryRun } from "../../../orchestrator/executor/executor.js";
import { createDefaultAdapters } from "../../../orchestrator/adapters/defaults.js";
import { ApprovalController } from "../../../shared/approvals/controller.js";
import { createMockBridgeSession } from "../../runtime/autoExecute.js";
import { createOrchestratorClient, resolveExecutionMode } from "../../support/orchestrator.js";

type PlanDryRunFlags = {
  readonly plan?: string;
  readonly "agents-directory"?: string;
  readonly "shared-state"?: string;
  readonly "base-url"?: string;
  readonly remote?: boolean;
  readonly local?: boolean;
};

type PlanSource = {
  readonly type: "file";
  readonly path: string;
};

export default class PlanDryRun extends Command {
  static summary = "对指定 Plan 执行 dry-run";

  static description = "读取 Plan 并执行 dryRun，输出潜在警告，帮助在正式执行前校验配置。";

  static flags = {
    plan: Flags.string({
      description: "Plan JSON 文件路径",
      default: "plans/demo-mixed.json"
    }),
    "agents-directory": Flags.string({ description: "agents-config 目录，可覆盖默认值" }),
    "shared-state": Flags.string({ description: "预置共享状态 JSON" }),
    "base-url": Flags.string({ description: "Orchestrator Service 基础地址，设置后默认使用远程模式" }),
    remote: Flags.boolean({ description: "强制使用 Orchestrator Service 校验 Plan" }),
    local: Flags.boolean({ description: "强制使用本地 dry-run" })
  } as const;

  async run(): Promise<void> {
    const parsed = await this.parse(PlanDryRun);
    const flags = parsed.flags as PlanDryRunFlags;
    const planSource = this.resolvePlanSource(flags);

    const mode = resolveExecutionMode(
      { baseUrl: flags["base-url"], remote: flags.remote, local: flags.local },
      process.env
    );

    if (mode.mode === "remote") {
      await this.runRemoteDryRun(planSource, mode.baseUrl!);
      return;
    }

    const planJson = await this.resolvePlanJson(planSource);
    await this.runLocalDryRun(planJson, flags);
  }

  private resolvePlanSource(flags: PlanDryRunFlags): PlanSource {
    const planPath = resolvePath(flags.plan ?? "plans/demo-mixed.json");
    return { type: "file", path: planPath };
  }

  private async resolvePlanJson(planSource: PlanSource): Promise<unknown> {
    return this.readPlanFromFile(planSource.path);
  }

  private async runRemoteDryRun(planSource: PlanSource, baseUrl: string): Promise<void> {
    const client = createOrchestratorClient(baseUrl);
    const planJson = await this.resolvePlanJson(planSource);

    this.log(`[远程] 调用 ${baseUrl}/plans/validate`);
    try {
      const result = await client.validatePlan(planJson);
      if (!result.warnings?.length) {
        this.log(`Plan ${result.planId ?? "unknown"} dry-run 完成：未发现警告。`);
      } else {
        this.log(`Plan ${result.planId ?? "unknown"} dry-run 完成，发现 ${result.warnings.length} 条警告：`);
        result.warnings.forEach((warning, index) => {
          this.log(`${index + 1}. ${warning}`);
        });
      }
    } catch (error) {
      this.error(`远程 dry-run 失败：${(error as Error).message}`, { exit: 1 });
    }
  }

  private async runLocalDryRun(planJson: unknown, flags: PlanDryRunFlags): Promise<void> {
    const planContext = loadPlan(planJson);

    await registerConfiguredAgents({ directory: flags["agents-directory"] ?? undefined });
    getAgentPlugin("demand-analysis");

    const session = await createMockBridgeSession();
    const adapters = createDefaultAdapters(session);
    const checkpointStore = new MemoryCheckpointStore();

    let initialSharedState: Record<string, unknown> | undefined;
    if (flags["shared-state"]) {
      try {
        initialSharedState = JSON.parse(flags["shared-state"]);
      } catch (error) {
        this.error(`无法解析 shared-state JSON：${(error as Error).message}`, { exit: 1 });
        return;
      }
    }

    const executionContext = createDefaultExecutionContext({
      planContext,
      adapters,
      checkpointStore,
      loggerCategory: "plan-dry-run",
      approvalController: new ApprovalController(),
      initialSharedState
    });

    try {
      const summary = await dryRun(planContext, executionContext);
      if (!summary.warnings.length) {
        this.log(`Plan ${summary.planId} dry-run 完成：未发现警告。`);
      } else {
        this.log(`Plan ${summary.planId} dry-run 完成，发现 ${summary.warnings.length} 条警告：`);
        summary.warnings.forEach((warning: string, index: number) => {
          this.log(`${index + 1}. ${warning}`);
        });
      }
      this.log("[提示] 可使用 --remote 或设置 ORCHESTRATOR_BASE_URL 走 Orchestrator Service 校验。");
    } catch (error) {
      this.error(`dry-run 执行失败：${(error as Error).message}`, { exit: 1 });
    } finally {
      await session.disconnect?.();
    }
  }

  private async readPlanFromFile(planPath: string): Promise<unknown> {
    try {
      const raw = await readFile(planPath, "utf-8");
      return JSON.parse(raw) as unknown;
    } catch (error) {
      this.error(`读取 Plan 失败：${(error as Error).message}`, { exit: 1 });
      throw error;
    }
  }
}
