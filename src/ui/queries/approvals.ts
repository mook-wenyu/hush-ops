import {
  useMutation,
  useQueryClient,
  type UseMutationOptions
} from '@tanstack/react-query';
import type { PendingApprovalEntry } from '../types/orchestrator';
import {
  requestApproval,
  submitApprovalDecision,
  type RequestApprovalPayload
} from '../services/approvals';
import { createQueryKeyFactory } from '../lib/queryClient';

/**
 * Approvals 查询键工厂
 */
export const approvalsKeys = createQueryKeyFactory('approvals');

/**
 * 请求审批
 */
export function useRequestApproval(
  options?: UseMutationOptions<
    PendingApprovalEntry,
    Error,
    RequestApprovalPayload
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: requestApproval,
    onSuccess: () => {
      // 使审批列表缓存失效
      queryClient.invalidateQueries({ queryKey: approvalsKeys.lists() });
    },
    ...options
  });
}

/**
 * 提交审批决策
 */
export function useSubmitApprovalDecision(
  options?: UseMutationOptions<
    void,
    Error,
    { id: string; decision: 'approved' | 'rejected'; comment?: string }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, decision, comment }) =>
      submitApprovalDecision(id, decision, comment),
    onSuccess: (_, { id }) => {
      // 使特定审批缓存失效
      queryClient.invalidateQueries({ queryKey: approvalsKeys.detail(id) });
      // 使审批列表缓存失效
      queryClient.invalidateQueries({ queryKey: approvalsKeys.lists() });
    },
    ...options
  });
}
