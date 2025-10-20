import React from "react";
import { ExecutionList } from "../../components/ExecutionList";
import { PendingApprovals } from "../../components/PendingApprovals";
import { cardClasses } from "../../utils/classNames";

export interface MonitorShellProps {
  executions: Parameters<typeof ExecutionList>[0]["executions"];
  execLoading: boolean;
  stopProcessingId: string | null;
  onRefresh: () => Promise<void> | void;
  onStop: (id: string) => Promise<void> | void;
  onOpenExecution?: (id: string) => void;
  approvals: Parameters<typeof PendingApprovals>[0]["entries"];
  commentMap: Parameters<typeof PendingApprovals>[0]["commentMap"];
  onCommentChange: (id: string, value: string) => void;
  onApprove: (id: string) => Promise<void> | void;
  onReject: (id: string) => Promise<void> | void;
  processingId: string | null;
  onFocusNode: (id: string | null) => void;
}

export default function MonitorShell(props: MonitorShellProps) {
  const {
    executions,
    execLoading,
    stopProcessingId,
    onRefresh,
    onStop,
    approvals,
    commentMap,
    onCommentChange,
    onApprove,
    onReject,
    processingId,
    onFocusNode,
  } = props;

  return (
    <div className="space-y-3">

      <div className={cardClasses({ variant: "nested" })}>
        <div className="card-body p-4">
          <h3 className="text-sm font-semibold opacity-70 mb-2">执行列表</h3>
          <ExecutionList
            onRefresh={async () => { await onRefresh?.(); }}
            onStop={async (id: string) => { await onStop?.(id); }}
            onOpenDetails={(id: string) => { props.onOpenExecution?.(id); }}
            executions={executions}
            loading={execLoading}
            disabled={false}
            stopProcessingId={stopProcessingId}
          />
        </div>
      </div>

      <div className={cardClasses({ variant: "nested" })}>
        <div className="card-body p-4">
          <h3 className="text-sm font-semibold opacity-70 mb-2">待审批</h3>
          <PendingApprovals
            entries={approvals ?? []}
            disabled={false}
            commentMap={commentMap ?? {}}
            onCommentChange={onCommentChange}
            onApprove={async (id: string) => { await onApprove?.(id); }}
            onReject={async (id: string) => { await onReject?.(id); }}
            processingId={processingId}
            onFocusNode={onFocusNode}
          />
        </div>
      </div>
    </div>
  );
}
