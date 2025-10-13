import path from "node:path";

import { ApprovalController } from "../shared/approvals/controller.js";
import { ApprovalStore } from "../shared/approvals/store.js";
import type {
  ApprovalStatus,
  PendingApprovalEntry
} from "../shared/approvals/types.js";

export interface ApprovalStoreOptions {
  databasePath?: string;
}

export function createApprovalStore(options: ApprovalStoreOptions = {}): ApprovalStore {
  const { databasePath } = options;
  const directory = resolveStoreDirectory(databasePath);
  if (directory) {
    return new ApprovalStore({ directory });
  }
  return new ApprovalStore();
}

function resolveStoreDirectory(databasePath?: string): string | null {
  if (!databasePath || databasePath.trim().length === 0) {
    return null;
  }
  const absolute = path.resolve(databasePath);
  if (path.extname(absolute)) {
    return path.dirname(absolute);
  }
  return absolute;
}

export function createApprovalController(store: ApprovalStore): ApprovalController {
  return new ApprovalController({ store });
}

export async function fetchPendingEntries(store: ApprovalStore): Promise<PendingApprovalEntry[]> {
  return store.listPending();
}

export function formatPendingEntry(entry: PendingApprovalEntry): string {
  return `- ${entry.id} | plan=${entry.planId} | node=${entry.nodeId} (${entry.nodeType}) | risk=${entry.riskLevel} | requiresApproval=${entry.requiresApproval}`;
}

export async function recordApprovalDecision(
  controller: ApprovalController,
  id: string,
  status: Exclude<ApprovalStatus, "pending">,
  comment?: string
): Promise<void> {
  await controller.recordDecision(id, status, comment);
}
