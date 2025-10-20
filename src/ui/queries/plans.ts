import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions
} from '@tanstack/react-query';
import type { PlanJson } from '../components/graph/PlanCanvas';
import {
  fetchPlans,
  fetchPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  fetchExamplePlans,
  importExamplePlan,
  dryRunPlan,
  executePlan,
  executePlanById,
  type PlanSummary,
  type DryRunResponse,
  type ExecuteResponse
} from '../services/plans';
import { createQueryKeyFactory } from '../lib/queryClient';

/**
 * Plans 查询键工厂
 */
export const plansKeys = createQueryKeyFactory('plans');

/**
 * Example Plans 查询键
 */
export const examplePlansKeys = {
  all: ['plans', 'examples'] as const
};

/**
 * 获取所有计划摘要
 */
export function usePlans(
  options?: Omit<UseQueryOptions<PlanSummary[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: plansKeys.lists(),
    queryFn: fetchPlans,
    ...options
  });
}

/**
 * 获取单个计划详情
 */
export function usePlan(
  planId: string,
  options?: Omit<
    UseQueryOptions<PlanJson | null, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: plansKeys.detail(planId),
    queryFn: () => fetchPlanById(planId),
    enabled: !!planId,
    ...options
  });
}

/**
 * 获取示例计划列表
 */
export function useExamplePlans(
  options?: Omit<
    UseQueryOptions<Array<{ name: string; plan?: unknown }>, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: examplePlansKeys.all,
    queryFn: fetchExamplePlans,
    staleTime: 30 * 60 * 1000, // 示例计划很少变化，30 分钟内不刷新
    ...options
  });
}

/**
 * 创建新计划
 */
export function useCreatePlan(
  options?: UseMutationOptions<{ id: string }, Error, unknown>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPlan,
    onSuccess: () => {
      // 使计划列表缓存失效
      queryClient.invalidateQueries({ queryKey: plansKeys.lists() });
    },
    ...options
  });
}

/**
 * 更新计划
 */
export function useUpdatePlan(
  options?: UseMutationOptions<void, Error, { planId: string; plan: unknown }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, plan }) => updatePlan(planId, plan),
    onSuccess: (_, { planId }) => {
      // 使特定计划缓存失效
      queryClient.invalidateQueries({ queryKey: plansKeys.detail(planId) });
      // 使计划列表缓存失效
      queryClient.invalidateQueries({ queryKey: plansKeys.lists() });
    },
    ...options
  });
}

/**
 * 删除计划
 */
export function useDeletePlan(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePlan,
    onSuccess: (_, planId) => {
      // 移除特定计划缓存
      queryClient.removeQueries({ queryKey: plansKeys.detail(planId) });
      // 使计划列表缓存失效
      queryClient.invalidateQueries({ queryKey: plansKeys.lists() });
    },
    ...options
  });
}

/**
 * 导入示例计划
 */
export function useImportExamplePlan(
  options?: UseMutationOptions<{ id: string } | null, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importExamplePlan,
    onSuccess: () => {
      // 使计划列表缓存失效
      queryClient.invalidateQueries({ queryKey: plansKeys.lists() });
    },
    ...options
  });
}

/**
 * 验证计划（Dry Run）
 */
export function useDryRunPlan(
  options?: UseMutationOptions<DryRunResponse, Error, unknown>
) {
  return useMutation({
    mutationFn: dryRunPlan,
    ...options
  });
}

/**
 * 执行计划
 */
export function useExecutePlan(
  options?: UseMutationOptions<
    ExecuteResponse,
    Error,
    { plan: unknown; serverName?: string }
  >
) {
  return useMutation({
    mutationFn: ({ plan, serverName }) => executePlan(plan, serverName),
    ...options
  });
}

/**
 * 执行已保存的计划
 */
export function useExecutePlanById(
  options?: UseMutationOptions<
    ExecuteResponse,
    Error,
    { planId: string; serverName?: string }
  >
) {
  return useMutation({
    mutationFn: ({ planId, serverName }) => executePlanById(planId, serverName),
    ...options
  });
}

/**
 * 预加载计划详情
 */
export function usePrefetchPlan() {
  const queryClient = useQueryClient();

  return (planId: string) => {
    queryClient.prefetchQuery({
      queryKey: plansKeys.detail(planId),
      queryFn: () => fetchPlanById(planId),
      staleTime: 5 * 60 * 1000
    });
  };
}
