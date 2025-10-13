import { Args, Command, Flags } from "@oclif/core";

import { OrchestratorClient } from "../../../client/orchestrator.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000/api/v1";

export default class ExecutionsStop extends Command {
  static summary = "停止指定执行";

  static description = "调用 Orchestrator Service 停止正在运行的执行，标记状态为 cancelled。";

  static args = {
    id: Args.string({ description: "执行 ID", required: true })
  } as const;

  static flags = {
    "base-url": Flags.string({ description: "Orchestrator Service 基础地址（默认 http://127.0.0.1:3000/api/v1）" })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ExecutionsStop);
    const baseUrl = (flags["base-url"] ?? process.env.ORCHESTRATOR_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch });

    try {
      const record = await client.stopExecution(args.id);
      this.log(`执行 ${record.id} 已标记为 ${record.status}`);
    } catch (error) {
      this.error((error as Error).message, { exit: 1 });
    }
  }
}
