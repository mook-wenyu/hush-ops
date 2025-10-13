import { Command, Flags } from "@oclif/core";

import { createApprovalStore, fetchPendingEntries, formatPendingEntry } from "../../approvals.js";

export default class ApprovalsPending extends Command {
  static summary = "列出所有待审批节点";

  static description = "从 JSON 审批存储中读取待审批项并输出摘要。";

  static flags = {
    database: Flags.string({
      description: "指定审批存储目录（默认 state/approvals）"
    })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(ApprovalsPending);
    const store = createApprovalStore({ databasePath: flags.database });

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
