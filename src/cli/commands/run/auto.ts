import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path, { resolve as resolvePath } from "node:path";

import { Command, Flags } from "@oclif/core";

import { runAutoExecution } from "../../runtime/autoExecute.js";
import { createOrchestratorClient, resolveExecutionMode } from "../../support/orchestrator.js";
import { joinConfigPath, joinStatePath } from "../../../shared/environment/pathResolver.js";

type RunAutoFlags = {
  readonly plan?: string;
  readonly database?: string;
  readonly "mock-mcp"?: boolean;
  readonly "mcp-server"?: string;
  readonly "base-url"?: string;
  readonly remote?: boolean;
  readonly local?: boolean;
  readonly wait: boolean;
};

type PlanSource = {
  readonly type: "file";
  readonly path: string;
};

const DEFAULT_PLAN_PATH = joinConfigPath("plans", "demo-mixed.json");
const LEGACY_PLAN_PATH = path.resolve("plans", "demo-mixed.json");
const DEFAULT_STATE_PATH = joinStatePath();

export default class RunAuto extends Command {
  static override summary = "自动执行 Plan";

  static override description = "复用 auto-exec 流程自动执行 Plan，支持 MCP mock 与 JSON 持久化配置。";

  static override flags = {
    plan: Flags.string({
      description: "Plan JSON 文件路径",
      default: DEFAULT_PLAN_PATH
    }),
    database: Flags.string({ description: `状态存储目录（默认 ${DEFAULT_STATE_PATH}）` }),
    "mock-mcp": Flags.boolean({ description: "使用内置 MCP mock", default: false }),
    "mcp-server": Flags.string({ description: "MCP 服务器配置名称（来自配置目录 .hush-ops/config/mcp.servers.json）" }),
    "base-url": Flags.string({ description: "Orchestrator Service 基础地址，设置后默认使用远程模式" }),
    remote: Flags.boolean({ description: "使用 Orchestrator Service 执行 Plan" }),
    local: Flags.boolean({ description: "强制使用本地 auto-exec" }),
    wait: Flags.boolean({ description: "等待执行完成（远程模式默认 true，可使用 --no-wait 跳过）", allowNo: true, default: true })
  } as const;

  override async run(): Promise<void> {
    const parsed = await this.parse(RunAuto);
    const flags = parsed.flags as RunAutoFlags;
    const planSource = this.resolvePlanSource(flags);

    const execFlags: any = {};
    if (flags["base-url"]) execFlags.baseUrl = flags["base-url"];
    if (typeof flags.remote !== "undefined") execFlags.remote = flags.remote;
    if (typeof flags.local !== "undefined") execFlags.local = flags.local;
    const mode = resolveExecutionMode(execFlags, process.env);

    if (mode.mode === "remote") {
      await this.runRemote(planSource, mode.baseUrl!, flags);
      return;
    }

    await this.runLocal(planSource, flags);
  }

  private resolvePlanSource(flags: RunAutoFlags): PlanSource {
    const planPath = this.resolvePlanPath(flags.plan);
    return { type: "file", path: planPath };
  }

  private resolvePlanPath(input?: string): string {
    if (input) {
      return resolvePath(input);
    }
    if (existsSync(DEFAULT_PLAN_PATH)) {
      return DEFAULT_PLAN_PATH;
    }
    if (existsSync(LEGACY_PLAN_PATH)) {
      return LEGACY_PLAN_PATH;
    }
    return DEFAULT_PLAN_PATH;
  }

  private async runRemote(planSource: PlanSource, baseUrl: string, flags: RunAutoFlags): Promise<void> {
    const client = createOrchestratorClient(baseUrl);
    const planJson = await this.readPlanFromFile(planSource.path);

    this.log(`[远程] 调用 ${baseUrl}/plans/execute`);
    try {
      const payloadBase: Parameters<typeof client.executePlan>[0] = { plan: planJson };
      const response = await client.executePlan({
        ...payloadBase,
        ...(flags["mock-mcp"] !== undefined ? { useMockBridge: Boolean(flags["mock-mcp"]) } : {}),
        ...(flags.database ? { databasePath: flags.database } : {}),
        ...(flags["mcp-server"] ? { mcpServer: flags["mcp-server"] as string } : {})
      });
      this.log(`已提交执行：${response.executionId}，状态 ${response.status}`);
      if (!flags.wait) {
        this.log("已跳过等待，可稍后使用 executions:stop 或 GUI 查看状态。");
        return;
      }
      await this.waitForCompletion(client, response.executionId);
    } catch (error) {
      this.error(`远程执行失败：${(error as Error).message}`, { exit: 1 });
    }
  }

  private async runLocal(planSource: PlanSource, flags: RunAutoFlags): Promise<void> {
    await this.executeLocalPlan(planSource.path, flags);
  }

  private async executeLocalPlan(
    planPath: string,
    flags: Pick<RunAutoFlags, "database" | "mock-mcp" | "mcp-server">
  ): Promise<void> {
    try {
      const runOpts: any = {
        planPath,
        useMockBridge: flags["mock-mcp"] ?? false,
        logger: {
          info: (message: string) => this.log(message),
          warn: (message: string) => this.warn(message),
          error: (message: string, error?: unknown) => {
            const details = error instanceof Error ? `：${error.message}` : "";
            this.warn(`${message}${details}`);
          }
        },
        onExecutionComplete: ({ status }: { status: string }) => {
          this.log(`执行结果：${status}`);
        }
      };
      if (flags.database) runOpts.databasePath = flags.database;
      if (flags["mcp-server"]) runOpts.mcpServer = flags["mcp-server"];

      const result = await runAutoExecution(runOpts);
      this.log(`执行完成，状态：${result.status}`);
      this.log("[提示] 可加入 --remote 或设置 ORCHESTRATOR_BASE_URL 通过服务端执行。");
    } catch (error) {
      this.error(`自动执行失败：${(error as Error).message}`, { exit: 1 });
    }
  }

  private async waitForCompletion(client: ReturnType<typeof createOrchestratorClient>, executionId: string) {
    while (true) {
      const record = await client.getExecution(executionId);
      this.log(`当前状态：${record.status}`);
      if (record.status !== "running") {
        if (record.result) {
          this.log(`完成详情：${JSON.stringify(record.result)}`);
        }
        if (record.error) {
          this.warn(`错误详情：${JSON.stringify(record.error)}`);
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private async readPlanFromFile(planPath: string): Promise<unknown> {
    const raw = await readFile(planPath, "utf-8");
    return JSON.parse(raw) as unknown;
  }

}
