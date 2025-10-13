export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface PendingApprovalEntry {
  id: string;
  planId: string;
  planVersion: string;
  nodeId: string;
  nodeType: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  requestedAt: string;
  requestedBy: string;
  payload?: Record<string, unknown>;
}

export interface CompletedApprovalEntry extends PendingApprovalEntry {
  status: Exclude<ApprovalStatus, "pending">;
  decidedAt: string;
  decidedBy: string;
  comment?: string;
}

export type ApprovalEntry = PendingApprovalEntry | CompletedApprovalEntry;
