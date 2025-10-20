import { Command, Flags } from "@oclif/core";

import {
  DEFAULT_AGENT_CONFIG_DIR,
  generateConfig,
  parseJsonOption,
  parseTags
} from "../../../agent-config.js";

export default class AgentConfigGenerate extends Command {
  static override summary = "生成或预览智能体配置 JSON";

  static override description = "根据提供的参数生成智能体配置 JSON，支持 dry-run 预览或写入 .hush-ops/config/agents/";

  static override flags = {
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
    directory: Flags.string({ description: `输出目录（默认 ${DEFAULT_AGENT_CONFIG_DIR}）` }),
    output: Flags.string({ description: "自定义输出文件" }),
    "config-version": Flags.string({ description: "配置版本", default: "v1" }),
    force: Flags.boolean({ description: "允许覆盖已存在文件" }),
    "dry-run": Flags.boolean({ description: "仅输出 JSON，不写入文件" })
  } as const;

  override async run(): Promise<void> {
    const { flags } = await this.parse(AgentConfigGenerate);
    try {
      const jsonRegisterOptions = parseJsonOption(flags["register-options"], "register-options");
      const jsonAgentOptions = parseJsonOption(flags["agent-options"], "agent-options");
      const jsonRunOptions = parseJsonOption(flags["run-options"], "run-options");
      const metadataTags = parseTags(flags.tags);

      const meta: { label?: string; description?: string; tags?: string[] } = {};
      if (typeof flags.label === 'string') meta.label = flags.label;
      if (typeof flags.description === 'string') meta.description = flags.description;
      if (metadataTags && metadataTags.length) meta.tags = metadataTags;

      const opts: any = {
        id: flags.id,
        modulePath: flags.module,
        metadata: Object.keys(meta).length ? meta : undefined,
        configVersion: flags["config-version"],
        force: !!flags.force
      };
      if (flags["register-export"]) opts.registerExport = flags["register-export"];
      if (flags["ensure-export"]) opts.ensureExport = flags["ensure-export"];
      if (jsonRegisterOptions) opts.registerOptions = jsonRegisterOptions;
      if (jsonAgentOptions) opts.defaultAgentOptions = jsonAgentOptions;
      if (jsonRunOptions) opts.defaultRunOptions = jsonRunOptions;
      if (flags.directory) opts.directory = flags.directory;
      if (flags.output) opts.output = flags.output;
      if (typeof flags["dry-run"] !== "undefined") opts.dryRun = flags["dry-run"];

      const result = await generateConfig(opts);

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
