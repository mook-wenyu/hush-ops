import { Args, Command, Flags } from "@oclif/core";

const ACTIONS = ["generate", "list"] as const;
type Action = (typeof ACTIONS)[number];

export default class AgentConfigRouter extends Command {
  static override summary = "agents:config 命令入口";

  static override description = "兼容旧 CLI，用法 `agents:config <generate|list>`";

  static override args = {
    action: Args.string({
      description: "子命令 (generate | list)",
      required: true,
      options: ACTIONS as unknown as string[]
    })
  } as const;

  static override flags = {
    directory: Flags.string({ description: "配置目录" }),
    id: Flags.string({ description: "配置 ID" }),
    module: Flags.string({ description: "模块路径" }),
    output: Flags.string({ description: "输出文件路径" }),
    "register-export": Flags.string(),
    "ensure-export": Flags.string(),
    "register-options": Flags.string(),
    "agent-options": Flags.string(),
    "run-options": Flags.string(),
    label: Flags.string(),
    description: Flags.string(),
    tags: Flags.string(),
    "config-version": Flags.string(),
    force: Flags.boolean(),
    "dry-run": Flags.boolean()
  } as const;

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentConfigRouter);
    const action = args.action as Action;
    const argv = this.buildForwardArgs(action, flags);
    const commandId = action === "generate" ? "agents:config:generate" : "agents:config:list";
    await this.config.runCommand(commandId, argv);
  }

  private buildForwardArgs(action: Action, flags: Record<string, unknown>): string[] {
    const argv: string[] = [];

    if (flags.directory) {
      argv.push("--directory", String(flags.directory));
    }
    if (action === "list") {
      return argv;
    }

    if (flags.id) {
      argv.push("--id", String(flags.id));
    }
    if (flags.module) {
      argv.push("--module", String(flags.module));
    }
    if (flags.output) {
      argv.push("--output", String(flags.output));
    }
    if (flags["register-export"]) {
      argv.push("--register-export", String(flags["register-export"]));
    }
    if (flags["ensure-export"]) {
      argv.push("--ensure-export", String(flags["ensure-export"]));
    }
    if (flags["register-options"]) {
      argv.push("--register-options", String(flags["register-options"]));
    }
    if (flags["agent-options"]) {
      argv.push("--agent-options", String(flags["agent-options"]));
    }
    if (flags["run-options"]) {
      argv.push("--run-options", String(flags["run-options"]));
    }
    if (flags.label) {
      argv.push("--label", String(flags.label));
    }
    if (flags.description) {
      argv.push("--description", String(flags.description));
    }
    if (flags.tags) {
      argv.push("--tags", String(flags.tags));
    }
    if (flags["config-version"]) {
      argv.push("--config-version", String(flags["config-version"]));
    }
    if (flags.force) {
      argv.push("--force");
    }
    if (flags["dry-run"]) {
      argv.push("--dry-run");
    }

    return argv;
  }
}
