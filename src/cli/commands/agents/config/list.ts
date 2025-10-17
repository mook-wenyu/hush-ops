import { Command, Flags } from "@oclif/core";

import { DEFAULT_AGENT_CONFIG_DIR, listConfigs } from "../../../agent-config.js";

export default class AgentConfigList extends Command {
  static summary = "列出现有智能体配置";

  static description = "扫描配置目录并输出已存在的智能体配置摘要";

  static flags = {
    directory: Flags.string({ description: `配置目录（默认 ${DEFAULT_AGENT_CONFIG_DIR}）` })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentConfigList);

    try {
      const lines = await listConfigs({ directory: flags.directory });
      if (lines.length === 0) {
        this.log("未找到任何智能体配置。");
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
