import type { PendingApprovalEntry } from "../types/orchestrator";
import { requestJson } from "./core/http";

export interface RequestApprovalPayload {
  executionId?: string;
  planId?: string;
  planVersion?: string;
  nodeId?: string;
  nodeType?: string;
  riskLevel?: "low" | "medium" | "high";
  requiresApproval?: boolean;
  requestedBy?: string;
  metadata?: Record<string, unknown>;
  title?: string;
}

export async function requestApproval(payload: RequestApprovalPayload): Promise<PendingApprovalEntry> {
  const data = await requestJson<{ approval: PendingApprovalEntry }>("POST", "/approvals/request", { body: payload });
  return data.approval;
}

export async function submitApprovalDecision(
  id: string,
  decision: "approved" | "rejected",
  comment?: string
): Promise<void> {
  await requestJson<void>("POST", `/approvals/${encodeURIComponent(id)}/decision`, { body: { decision, comment } });
}
