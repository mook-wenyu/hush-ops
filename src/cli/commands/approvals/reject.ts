import { Args, Command, Flags } from "@oclif/core";

import {
  createApprovalController,
  createApprovalStore,
  recordApprovalDecision
} from "../../approvals.js";
import { joinStatePath } from "../../../shared/environment/pathResolver.js";

const DEFAULT_APPROVAL_DIRECTORY = joinStatePath("approvals");

export default class ApprovalsReject extends Command {
  static summary = "将待审批项标记为拒绝";

  static description = "记录审批拒绝并阻止节点继续执行。";

  static args = {
    id: Args.string({ description: "审批 ID", required: true })
  } as const;

  static flags = {
    database: Flags.string({
      description: `指定审批存储目录（默认 ${DEFAULT_APPROVAL_DIRECTORY}）`
    }),
    comment: Flags.string({
      description: "拒绝原因"
    })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalsReject);
    const store = createApprovalStore({ databasePath: flags.database });
    const controller = createApprovalController(store);

    try {
      await recordApprovalDecision(controller, args.id, "rejected", flags.comment);
      this.log(`已记录审批结果：${args.id} -> rejected`);
    } catch (error) {
      this.error((error as Error).message, { exit: 1 });
    } finally {
      controller.close();
      store.close();
    }
  }
}
