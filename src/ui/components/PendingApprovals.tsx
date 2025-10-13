import { useCallback } from "react";
import type { ChangeEvent } from "react";

import type { PendingApprovalEntry } from "../types/orchestrator";

interface PendingApprovalsProps {
  entries: PendingApprovalEntry[];
  disabled: boolean;
  commentMap: Record<string, string>;
  onCommentChange: (id: string, value: string) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  processingId: string | null;
  onFocusNode?: (nodeId: string) => void;
}

export function PendingApprovals({
  entries,
  disabled,
  commentMap,
  onCommentChange,
  onApprove,
  onReject,
  processingId,
  onFocusNode
}: PendingApprovalsProps) {
  const handleCommentChange = useCallback(
    (id: string) => (event: ChangeEvent<HTMLTextAreaElement>) => {
      onCommentChange(id, event.target.value);
    },
    [onCommentChange]
  );

  return (
    <div className="card bg-base-300/70 shadow-xl">
      <div className="card-body space-y-4">
        <h2 className="card-title text-lg">待审批</h2>
        {entries.length === 0 ? (
          <div className="text-sm text-base-content/60 text-center py-8">当前没有待审批任务</div>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => {
              const value = commentMap[entry.id] ?? "";
              const loading = processingId === entry.id;
              return (
                <article key={entry.id} className="card bg-base-200/70 border border-base-content/10">
                  <div className="card-body space-y-2 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base">{entry.planId}</strong>
                      <span className="text-base-content/60">· 节点 {entry.nodeId}</span>
                    </div>
                    <div className="text-base-content/70">风险等级：{entry.riskLevel}</div>
                    <div className="text-base-content/70">请求人：{entry.requestedBy}</div>
                    <div className="text-base-content/70">
                      发起时间：{new Date(entry.requestedAt).toLocaleString()}
                    </div>
                    {entry.comment && <div className="text-base-content/70">备注：{entry.comment}</div>}
                    <textarea
                      rows={3}
                      className="textarea textarea-bordered w-full"
                      placeholder="输入审批备注（可选）"
                      value={value}
                      onChange={handleCommentChange(entry.id)}
                      disabled={disabled || loading}
                    />
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      {onFocusNode && (
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => onFocusNode(entry.nodeId)}
                          disabled={loading}
                        >
                          定位节点
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline btn-error btn-xs"
                        onClick={() => {
                          void onReject(entry.id);
                        }}
                        disabled={disabled || loading}
                      >
                        {loading ? "处理中…" : "拒绝"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-success btn-xs"
                        onClick={() => {
                          void onApprove(entry.id);
                        }}
                        disabled={disabled || loading}
                      >
                        {loading ? "处理中…" : "通过"}
                      </button>
                    </div>
                    {disabled && (
                      <div className="text-xs text-base-content/60">
                        等待桥接重连后方可执行审批操作。
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
