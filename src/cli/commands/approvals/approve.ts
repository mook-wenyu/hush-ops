import { Args, Command, Flags } from "@oclif/core";

import {
  createApprovalController,
  createApprovalStore,
  recordApprovalDecision
} from "../../approvals.js";

export default class ApprovalsApprove extends Command {
  static summary = "将待审批项标记为通过";

  static description = "根据给定的审批 ID 写入审批结果并恢复执行。";

  static args = {
    id: Args.string({ description: "审批 ID", required: true })
  } as const;

  static flags = {
    database: Flags.string({
      description: "指定审批存储目录（默认 state/approvals）"
    }),
    comment: Flags.string({
      description: "审批备注"
    })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalsApprove);
    const store = createApprovalStore({ databasePath: flags.database });
    const controller = createApprovalController(store);

    try {
      await recordApprovalDecision(controller, args.id, "approved", flags.comment);
      this.log(`已记录审批结果：${args.id} -> approved`);
    } catch (error) {
      this.error((error as Error).message, { exit: 1 });
    } finally {
      store.close();
    }
  }
}
