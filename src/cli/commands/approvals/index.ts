import { Args, Command, Flags } from "@oclif/core";

const ACTIONS = ["pending", "approve", "reject"] as const;
type Action = (typeof ACTIONS)[number];

export default class ApprovalsRouter extends Command {
  static summary = "审批命令入口（兼容旧参数形式）";

  static description = "兼容旧版 CLI，支持 approvals pending/approve/reject 调用。";

  static args = {
    action: Args.string({
      description: "目标操作 (pending|approve|reject)",
      required: true,
      options: ACTIONS as unknown as string[]
    }),
    id: Args.string({
      description: "审批 ID（approve/reject 必填）",
      required: false
    })
  } as const;

  static flags = {
    database: Flags.string({
      description: "指定审批存储目录"
    }),
    comment: Flags.string({
      description: "审批备注"
    })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalsRouter);
    const action = args.action as Action;
    const forwardFlags = this.buildForwardFlags(flags);

    if (action === "pending") {
      await this.config.runCommand("approvals:pending", forwardFlags);
      return;
    }

    if (!args.id) {
      this.error(`${action} 命令需要提供审批 ID`, { exit: 1 });
    }

    const argv = [args.id, ...forwardFlags];
    if (action === "approve") {
      await this.config.runCommand("approvals:approve", argv);
      return;
    }
    await this.config.runCommand("approvals:reject", argv);
  }

  private buildForwardFlags(flags: { database?: string; comment?: string }): string[] {
    const result: string[] = [];
    if (flags.database) {
      result.push("--database", flags.database);
    }
    if (flags.comment) {
      result.push("--comment", flags.comment);
    }
    return result;
  }
}
