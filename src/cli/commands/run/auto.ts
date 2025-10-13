import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { Command, Flags } from "@oclif/core";

import { runAutoExecution } from "../../runtime/autoExecute.js";
import { createOrchestratorClient, resolveExecutionMode } from "../../support/orchestrator.js";

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

export default class RunAuto extends Command {
  static summary = "自动执行 Plan";

  static description = "复用 auto-exec 流程自动执行 Plan，支持 MCP mock 与 JSON 持久化配置。";

  static flags = {
    plan: Flags.string({
      description: "Plan JSON 文件路径",
      default: "plans/demo-mixed.json"
    }),
    database: Flags.string({ description: "状态存储目录，默认 state" }),
    "mock-mcp": Flags.boolean({ description: "使用内置 MCP mock", default: false }),
    "mcp-server": Flags.string({ description: "MCP 服务器配置名称（来自 config/mcp.servers.json）" }),
    "base-url": Flags.string({ description: "Orchestrator Service 基础地址，设置后默认使用远程模式" }),
    remote: Flags.boolean({ description: "使用 Orchestrator Service 执行 Plan" }),
    local: Flags.boolean({ description: "强制使用本地 auto-exec" }),
    wait: Flags.boolean({ description: "等待执行完成（远程模式默认 true，可使用 --no-wait 跳过）", allowNo: true, default: true })
  } as const;

  async run(): Promise<void> {
    const parsed = await this.parse(RunAuto);
    const flags = parsed.flags as RunAutoFlags;
    const planSource = this.resolvePlanSource(flags);

    const mode = resolveExecutionMode(
      { baseUrl: flags["base-url"], remote: flags.remote, local: flags.local },
      process.env
    );

    if (mode.mode === "remote") {
      await this.runRemote(planSource, mode.baseUrl!, flags);
      return;
    }

    await this.runLocal(planSource, flags);
  }

  private resolvePlanSource(flags: RunAutoFlags): PlanSource {
    const planPath = resolvePath(flags.plan ?? "plans/demo-mixed.json");
    return { type: "file", path: planPath };
  }

  private async runRemote(planSource: PlanSource, baseUrl: string, flags: RunAutoFlags): Promise<void> {
    const client = createOrchestratorClient(baseUrl);
    const planJson = await this.readPlanFromFile(planSource.path);

    this.log(`[远程] 调用 ${baseUrl}/plans/execute`);
    try {
      const response = await client.executePlan({
        plan: planJson,
        useMockBridge: flags["mock-mcp"],
        databasePath: flags.database,
        mcpServer: flags["mcp-server"]
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
      const result = await runAutoExecution({
        planPath,
        databasePath: flags.database,
        useMockBridge: flags["mock-mcp"] ?? false,
        mcpServer: flags["mcp-server"],
        logger: {
          info: (message) => this.log(message),
          warn: (message) => this.warn(message),
          error: (message, error) => {
            const details = error instanceof Error ? `：${error.message}` : "";
            this.warn(`${message}${details}`);
          }
        },
        onExecutionComplete: ({ status }) => {
          this.log(`执行结果：${status}`);
        }
      });
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
