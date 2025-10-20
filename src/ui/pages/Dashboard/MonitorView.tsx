import React from "react";
import MonitorShell from "../../features/monitor/MonitorShell";

export interface MonitorViewProps {
  executions: Parameters<typeof MonitorShell>[0]["executions"];
  execLoading: boolean;
  stopProcessingId: string | null;
  approvals: Parameters<typeof MonitorShell>[0]["approvals"];
  commentMap: Parameters<typeof MonitorShell>[0]["commentMap"];
  processingId: string | null;
  onRefresh: () => Promise<void> | void;
  onStop: (id: string) => Promise<void> | void;
  onCommentChange: (id: string, value: string) => void;
  onApprove: (id: string) => Promise<void> | void;
  onReject: (id: string) => Promise<void> | void;
  onFocusNode: (id: string | null) => void;
  onOpenExecution?: (id: string) => void;
}

export default function MonitorView(props: MonitorViewProps) {
  const monitorShellProps: Parameters<typeof MonitorShell>[0] = {
    executions: props.executions,
    execLoading: props.execLoading,
    stopProcessingId: props.stopProcessingId,
    onRefresh: props.onRefresh,
    onStop: props.onStop,
    approvals: props.approvals,
    commentMap: props.commentMap,
    onCommentChange: props.onCommentChange,
    onApprove: props.onApprove,
    onReject: props.onReject,
    processingId: props.processingId,
    onFocusNode: props.onFocusNode
  };
  if (props.onOpenExecution) {
    monitorShellProps.onOpenExecution = props.onOpenExecution;
  }

  return (
    <div className="h-full overflow-auto p-3">
      <MonitorShell {...monitorShellProps} />
    </div>
  );
}
