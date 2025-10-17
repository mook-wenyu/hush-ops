import type { ExecutionRecord } from "../types/orchestrator";
import { EmptyState } from "./EmptyState";
import { cn, cardClasses, cardBodyClasses } from "../utils/classNames";

interface ExecutionListProps {
  executions: ExecutionRecord[];
  onRefresh: () => void;
  onStop?: (id: string) => void;
  loading: boolean;
  disabled: boolean;
  stopProcessingId?: string | null;
}

const STATUS_LABELS: Record<ExecutionRecord["status"], string> = {
  pending: "等待执行",
  running: "执行中",
  success: "成功",
  failed: "失败",
  cancelled: "已取消"
};

export function ExecutionList({
  executions,
  onRefresh,
  onStop,
  loading,
  disabled,
  stopProcessingId
}: ExecutionListProps) {
  return (
    <div className={cardClasses({ variant: 'nested' })}>
      <div className={cardBodyClasses()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="card-title text-lg">执行列表</h2>
          <button
            className="btn btn-outline btn-xs"
            type="button"
            onClick={onRefresh}
            disabled={loading || disabled}
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
        {executions.length === 0 ? (
          <EmptyState title="暂无执行记录" />
        ) : (
          <div className="flex flex-col gap-3">
            {executions.map((execution) => (
              <article key={execution.id} className={cardClasses({ bordered: true })}>
                <div className={cardBodyClasses({ compact: true })}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base">{execution.planId}</strong>
                    <span className="text-base-content/60">
                      · {new Date(execution.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-base-content/70">状态：{STATUS_LABELS[execution.status]}</div>
                  {execution.pendingApprovals.length > 0 && (
                    <div className="text-warning-content/80">
                      待审批：{execution.pendingApprovals.length} 项
                    </div>
                  )}
                  {execution.error?.message && (
                    <div className="text-error">错误：{execution.error.message}</div>
                  )}
                  {onStop && !disabled && execution.status === "running" && (
                    <div className="pt-2">
                      <button
                        type="button"
                        className={cn('btn btn-outline btn-error btn-xs', {
                          'btn-disabled': disabled || stopProcessingId === execution.id
                        })}
                        onClick={() => onStop(execution.id)}
                        disabled={disabled || stopProcessingId === execution.id}
                      >
                        {stopProcessingId === execution.id ? "停止中…" : "停止执行"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
