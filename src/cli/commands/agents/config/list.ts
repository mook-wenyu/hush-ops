import { Command, Flags } from "@oclif/core";

import { listConfigs } from "../../../agent-config.js";

export default class AgentConfigList extends Command {
  static summary = "列出已注册的 agents-config";

  static description = "扫描目录并输出已存在的智能体配置摘要";

  static flags = {
    directory: Flags.string({ description: "配置目录（默认 agents-config）" })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentConfigList);

    try {
      const lines = await listConfigs({ directory: flags.directory });
      if (lines.length === 0) {
        this.log("未找到任何 agents-config 配置。");
        return;
      }
      for (const line of lines) {
        this.log(line);
      }
    } catch (error) {
      this.error((error as Error).message, { exit: 1 });
    }
  }
}
