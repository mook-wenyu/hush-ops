import { Command, Flags } from "@oclif/core";

import {
  generateConfig,
  parseJsonOption,
  parseTags
} from "../../../agent-config.js";

export default class AgentConfigGenerate extends Command {
  static summary = "生成或预览智能体配置 JSON";

  static description = "根据提供的参数生成 agents-config JSON，支持 dry-run 预览或写入文件";

  static flags = {
    id: Flags.string({ description: "配置 ID", required: true }),
    module: Flags.string({ description: "模块路径", required: true }),
    "register-export": Flags.string({ description: "register 函数导出名" }),
    "ensure-export": Flags.string({ description: "ensure 函数导出名" }),
    "register-options": Flags.string({ description: "register 选项 JSON" }),
    "agent-options": Flags.string({ description: "default agent options JSON" }),
    "run-options": Flags.string({ description: "default run options JSON" }),
    label: Flags.string({ description: "元数据标签" }),
    description: Flags.string({ description: "元数据描述" }),
    tags: Flags.string({ description: "逗号分隔标签" }),
    directory: Flags.string({ description: "输出目录（默认 agents-config）" }),
    output: Flags.string({ description: "自定义输出文件" }),
    "config-version": Flags.string({ description: "配置版本", default: "v1" }),
    force: Flags.boolean({ description: "允许覆盖已存在文件" }),
    "dry-run": Flags.boolean({ description: "仅输出 JSON，不写入文件" })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentConfigGenerate);
    try {
      const jsonRegisterOptions = parseJsonOption(flags["register-options"], "register-options");
      const jsonAgentOptions = parseJsonOption(flags["agent-options"], "agent-options");
      const jsonRunOptions = parseJsonOption(flags["run-options"], "run-options");
      const metadataTags = parseTags(flags.tags);

      const result = await generateConfig({
        id: flags.id,
        modulePath: flags.module,
        registerExport: flags["register-export"],
        ensureExport: flags["ensure-export"],
        registerOptions: jsonRegisterOptions,
        defaultAgentOptions: jsonAgentOptions,
        defaultRunOptions: jsonRunOptions,
        metadata:
          flags.label || flags.description || metadataTags
            ? {
                label: flags.label,
                description: flags.description,
                tags: metadataTags
              }
            : undefined,
        configVersion: flags["config-version"],
        directory: flags.directory,
        output: flags.output,
        dryRun: flags["dry-run"],
        force: flags.force
      });

      if (flags["dry-run"]) {
        this.log(result);
      } else {
        this.log(`已写入配置：${result}`);
      }
    } catch (error) {
      this.error((error as Error).message, { exit: 1 });
    }
  }
}
