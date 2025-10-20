import { QueryClient } from '@tanstack/react-query';

/**
 * React Query 全局配置
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * 数据保持新鲜时间（5 分钟）
       * 在此时间内不会自动重新请求
       */
      staleTime: 5 * 60 * 1000,

      /**
       * 缓存时间（10 分钟）
       * 超过此时间未使用的数据将被垃圾回收
       */
      gcTime: 10 * 60 * 1000,

      /**
       * 窗口重新获得焦点时自动重新请求
       */
      refetchOnWindowFocus: true,

      /**
       * 网络重新连接时自动重新请求
       */
      refetchOnReconnect: true,

      /**
       * 失败重试配置（利用 HTTP 层的重试机制）
       * React Query 层禁用重试，避免双重重试
       */
      retry: false,

      /**
       * 启用重复数据删除（防止同时发起多个相同请求）
       */
      structuralSharing: true
    },

    mutations: {
      /**
       * Mutation 失败重试（同样禁用，依赖 HTTP 层）
       */
      retry: false
    }
  }
});

/**
 * 查询键工厂类型定义
 */
export interface QueryKeyFactory {
  /**
   * 查询键命名空间
   */
  all: readonly string[];

  /**
   * 列表查询键
   */
  lists: () => readonly string[];

  /**
   * 列表查询键（带过滤参数）
   */
  list: (filters?: Record<string, unknown>) => readonly unknown[];

  /**
   * 详情查询键
   */
  details: () => readonly string[];

  /**
   * 详情查询键（带 ID）
   */
  detail: (id: string) => readonly string[];
}

/**
 * 创建查询键工厂
 * @param namespace 命名空间（如 'executions', 'plans', 'approvals'）
 */
export function createQueryKeyFactory(namespace: string): QueryKeyFactory {
  return {
    all: [namespace] as const,
    lists: () => [namespace, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [namespace, 'list', filters] as const,
    details: () => [namespace, 'detail'] as const,
    detail: (id: string) => [namespace, 'detail', id] as const
  };
}
