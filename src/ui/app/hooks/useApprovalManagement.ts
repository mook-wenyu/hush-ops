/**
 * 审批流程管理 Hook
 * 负责审批评论编辑和审批决策提交
 */

import { useCallback, useState } from 'react';
import { submitApprovalDecision } from '../../services';
import { appStore } from '../../state/appStore';

export interface UseApprovalManagementOptions {
  /**
   * 是否启用 Zustand store
   */
  storeEnabled: boolean;

  /**
   * 审批成功后的回调（用于刷新执行列表）
   */
  onApprovalSuccess?: () => Promise<void>;

  /**
   * 错误处理回调
   */
  onError?: (message: string) => void;
}

export interface UseApprovalManagementResult {
  /**
   * 审批评论草稿（仅在未启用 store 时有效）
   */
  comments: Record<string, string>;

  /**
   * 当前正在处理的审批 ID
   */
  processingId: string | null;

  /**
   * 更新审批评论
   */
  updateComment: (id: string, value: string) => void;

  /**
   * 批准审批
   */
  approve: (id: string) => Promise<void>;

  /**
   * 拒绝审批
   */
  reject: (id: string) => Promise<void>;

  /**
   * 聚焦到审批对应的节点
   */
  focusNode: (nodeId: string) => void;
}

/**
 * 审批流程管理
 */
export function useApprovalManagement(
  options: UseApprovalManagementOptions,
  onFocusNode?: (nodeId: string) => void
): UseApprovalManagementResult {
  const { storeEnabled, onApprovalSuccess, onError } = options;

  // 本地状态（store 未启用时使用）
  const [comments, setComments] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  /**
   * 更新审批评论（同步到 store）
   */
  const updateComment = useCallback(
    (id: string, value: string) => {
      if (storeEnabled) {
        appStore.getState().setApprovalCommentDraft(id, value);
      }
      setComments((prev) => ({
        ...prev,
        [id]: value
      }));
    },
    [storeEnabled]
  );

  /**
   * 清除审批评论（同步到 store）
   */
  const clearComment = useCallback(
    (id: string) => {
      if (storeEnabled) {
        appStore.setState((state) => {
          const nextDrafts = { ...state.approvals.commentDrafts };
          delete nextDrafts[id];
          return {
            ...state,
            approvals: {
              ...state.approvals,
              commentDrafts: nextDrafts
            }
          };
        });
      }
      setComments((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [storeEnabled]
  );

  /**
   * 开始审批处理（同步到 store）
   */
  const startProcessing = useCallback(
    (id: string) => {
      if (storeEnabled) {
        const apiState = appStore.getState();
        // 清除其他正在处理的审批
        apiState.approvals.processingIds.forEach((existingId) => {
          if (existingId !== id) {
            apiState.setApprovalProcessing(existingId, false);
          }
        });
        apiState.setApprovalProcessing(id, true);
      }
      setProcessingId(id);
    },
    [storeEnabled]
  );

  /**
   * 完成审批处理（同步到 store）
   */
  const finishProcessing = useCallback(
    (id?: string) => {
      if (storeEnabled) {
        const apiState = appStore.getState();
        const targets = id ? [id] : apiState.approvals.processingIds;
        targets.forEach((target) => {
          apiState.setApprovalProcessing(target, false);
        });
      }
      setProcessingId(null);
    },
    [storeEnabled]
  );

  /**
   * 提交审批决策
   */
  const submitDecision = useCallback(
    async (id: string, decision: 'approved' | 'rejected') => {
      startProcessing(id);
      try {
        const comment = storeEnabled
          ? appStore.getState().approvals.commentDrafts[id] ?? ''
          : comments[id] ?? '';

        await submitApprovalDecision(id, decision, comment);
        clearComment(id);

        // 如果未启用 store，触发执行列表刷新
        if (!storeEnabled && onApprovalSuccess) {
          await onApprovalSuccess();
        }
      } catch (err) {
        const errorMessage = (err as Error).message ?? '审批操作失败';
        if (onError) {
          onError(errorMessage);
        }
        throw err;
      } finally {
        finishProcessing(id);
      }
    },
    [
      clearComment,
      comments,
      finishProcessing,
      onApprovalSuccess,
      onError,
      startProcessing,
      storeEnabled
    ]
  );

  /**
   * 批准审批
   */
  const approve = useCallback(
    (id: string) => submitDecision(id, 'approved'),
    [submitDecision]
  );

  /**
   * 拒绝审批
   */
  const reject = useCallback(
    (id: string) => submitDecision(id, 'rejected'),
    [submitDecision]
  );

  /**
   * 聚焦到审批对应的节点
   */
  const focusNode = useCallback(
    (nodeId: string) => {
      if (onFocusNode) {
        onFocusNode(nodeId);
      }
    },
    [onFocusNode]
  );

  return {
    comments,
    processingId,
    updateComment,
    approve,
    reject,
    focusNode
  };
}
