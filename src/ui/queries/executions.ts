import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions
} from '@tanstack/react-query';
import type { ExecutionRecord } from '../types/orchestrator';
import {
  fetchExecutions,
  fetchExecutionById,
  stopExecution
} from '../services/executions';
import { createQueryKeyFactory } from '../lib/queryClient';

/**
 * Executions 查询键工厂
 */
export const executionsKeys = createQueryKeyFactory('executions');

/**
 * 获取所有执行记录
 */
export function useExecutions(
  signal?: AbortSignal,
  options?: Omit<
    UseQueryOptions<ExecutionRecord[], Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: executionsKeys.lists(),
    queryFn: () => fetchExecutions(signal),
    ...options
  });
}

/**
 * 获取单个执行记录
 */
export function useExecution(
  id: string,
  options?: Omit<
    UseQueryOptions<ExecutionRecord, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: executionsKeys.detail(id),
    queryFn: () => fetchExecutionById(id),
    enabled: !!id, // 仅当 ID 存在时才执行查询
    ...options
  });
}

/**
 * 停止执行记录
 */
export function useStopExecution(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stopExecution,
    onSuccess: (_, id) => {
      // 使更新的执行记录缓存失效
      queryClient.invalidateQueries({ queryKey: executionsKeys.detail(id) });
      // 使列表缓存失效
      queryClient.invalidateQueries({ queryKey: executionsKeys.lists() });
    },
    ...options
  });
}

/**
 * 预加载执行记录详情
 * 用于优化 UX（悬停时预加载）
 */
export function usePrefetchExecution() {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: executionsKeys.detail(id),
      queryFn: () => fetchExecutionById(id),
      staleTime: 5 * 60 * 1000 // 5 分钟内不重复预加载
    });
  };
}
