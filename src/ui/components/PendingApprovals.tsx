import { useCallback } from "react";
import type { ChangeEvent } from "react";

import type { PendingApprovalEntry } from "../types/orchestrator";
import {
  selectApprovalCommentDrafts,
  selectApprovalProcessingIds,
  selectPendingApprovalsList,
  useAppStoreFeatureFlag,
  useAppStoreSelector
} from "../state/appStore";
import { MemoVirtualList } from "./VirtualList";
import { EmptyState } from "./EmptyState";
import { cn, cardClasses, cardBodyClasses } from "../utils/classNames";
import { IconCheck, IconX, IconTargetArrow } from "@tabler/icons-react";

interface PendingApprovalsProps {
  disabled: boolean;
  entries?: PendingApprovalEntry[];
  commentMap?: Record<string, string>;
  onCommentChange: (id: string, value: string) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  processingId?: string | null;
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
  const storeEnabled = useAppStoreFeatureFlag();
  const storeEntries = useAppStoreSelector(selectPendingApprovalsList);
  const storeCommentDrafts = useAppStoreSelector(selectApprovalCommentDrafts);
  const storeProcessingIds = useAppStoreSelector(selectApprovalProcessingIds);
  const effectiveEntries = storeEnabled && entries === undefined ? storeEntries : entries ?? [];
  const effectiveCommentMap =
    storeEnabled && commentMap === undefined ? storeCommentDrafts : commentMap ?? {};
  const effectiveProcessingId =
    storeEnabled && processingId === undefined ? storeProcessingIds[0] ?? null : processingId ?? null;

  const handleCommentChange = useCallback(
    (id: string) => (event: ChangeEvent<HTMLTextAreaElement>) => {
      onCommentChange(id, event.target.value);
    },
    [onCommentChange]
  );

  return (
    <div className={cardClasses({ variant: 'nested' })}>
      <div className={cardBodyClasses()}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="card-title text-lg">待审批</h2>
          </div>
        </div>
        {/* 无障碍：审批处理状态区域 */}
        <div aria-live="polite" className="sr-only">
          {effectiveProcessingId ? "正在处理审批" : "审批状态已更新"}
        </div>
        {effectiveEntries.length === 0 ? (
          <EmptyState title="当前没有待审批任务" />
        ) : (
          (() => {
            const useVirtual = true; // 全量启用虚拟滚动（不兼容重构）
            const renderCard = (entry: PendingApprovalEntry) => {
              const value = effectiveCommentMap[entry.id] ?? "";
              const loading = effectiveProcessingId === entry.id;
              return (
                <article className={cn(cardClasses({ bordered: true }), 'mb-3')}>
                  <div className={cardBodyClasses({ compact: true })}>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base">{entry.planId}</strong>
                      <span className="text-base-content/60">· 节点 {entry.nodeId}</span>
                    </div>
                    <div className="text-base-content/70">风险等级：{entry.riskLevel}</div>
                    <div className="text-base-content/70">请求人：{entry.requestedBy}</div>
                    <div className="text-base-content/70">发起时间：{new Date(entry.requestedAt).toLocaleString()}</div>
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
                          title="定位节点"
                        >
                          <IconTargetArrow size={16} className="mr-1" />
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
                        title="拒绝"
                      >
                        <IconX size={16} className="mr-1" />
                        {loading ? "处理中…" : "拒绝"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-success btn-xs"
                        onClick={() => {
                          void onApprove(entry.id);
                        }}
                        disabled={disabled || loading}
                        title="通过"
                      >
                        <IconCheck size={16} className="mr-1" />
                        {loading ? "处理中…" : "通过"}
                      </button>
                    </div>
                    {disabled && (
                      <div className="text-xs text-base-content/60">等待桥接重连后方可执行审批操作。</div>
                    )}
                  </div>
                </article>
              );
            };

            if (useVirtual) {
              return (
                <MemoVirtualList
                  items={effectiveEntries}
                  estimateSize={156}
                  height={520}
                  roleLabel="待审批列表"
                  getKey={(e) => e.id}
                  renderItem={(e) => renderCard(e)}
                />
              );
            }
            return (
              <div className="flex flex-col gap-3" role="list" aria-label="待审批列表">
                {effectiveEntries.map((entry, idx) => (
                  <div
                    role="listitem"
                    key={entry.id}
                    aria-setsize={effectiveEntries.length}
                    aria-posinset={idx + 1}
                  >
                    {renderCard(entry)}
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
