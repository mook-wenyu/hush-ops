import { Command, Flags } from "@oclif/core";

import { createApprovalStore, fetchPendingEntries, formatPendingEntry } from "../../approvals.js";
import { joinStatePath } from "../../../shared/environment/pathResolver.js";

const DEFAULT_APPROVAL_DIRECTORY = joinStatePath("approvals");

export default class ApprovalsPending extends Command {
  static override summary = "列出所有待审批节点";

  static override description = "从 JSON 审批存储中读取待审批项并输出摘要。";

  static override flags = {
    database: Flags.string({
      description: `指定审批存储目录（默认 ${DEFAULT_APPROVAL_DIRECTORY}）`
    })
  } as const;

  override async run(): Promise<void> {
    const { flags } = await this.parse(ApprovalsPending);
    const store = createApprovalStore(
      flags.database ? { databasePath: flags.database } : {}
    );

    try {
      const entries = await fetchPendingEntries(store);
      if (entries.length === 0) {
        this.log("暂无待审批项。");
        return;
      }
      for (const entry of entries) {
        this.log(formatPendingEntry(entry));
      }
    } catch (error) {
      this.error((error as Error).message, { exit: 1 });
    } finally {
      store.close();
    }
  }
}
