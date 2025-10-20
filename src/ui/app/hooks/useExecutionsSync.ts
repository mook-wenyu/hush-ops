/**
 * 执行列表同步管理 Hook
 * 负责执行列表的加载、刷新、停止操作
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchExecutions, stopExecution } from '../../services';
import { appStore } from '../../state/appStore';
import { extractPending } from '../utils';
import type { ExecutionRecord } from '../../types/orchestrator';

export interface UseExecutionsSyncOptions {
  /**
   * 是否启用 Zustand store
   */
  storeEnabled: boolean;
}

export interface UseExecutionsSyncResult {
  /**
   * 执行列表数据（仅在未启用 store 时有效）
   */
  executions: ExecutionRecord[];

  /**
   * 加载状态
   */
  loading: boolean;

  /**
   * 错误信息
   */
  error: string | null;

  /**
   * 当前正在停止的执行 ID
   */
  stopProcessingId: string | null;

  /**
   * 手动刷新执行列表
   */
  refreshExecutions: () => Promise<void>;

  /**
   * 停止指定执行
   */
  stopExecutionById: (executionId: string) => Promise<void>;

  /**
   * 调度延迟刷新（250ms 防抖）
   */
  scheduleRefresh: () => void;
}

/**
 * 执行列表同步管理
 */
export function useExecutionsSync(
  options: UseExecutionsSyncOptions
): UseExecutionsSyncResult {
  const { storeEnabled } = options;

  // 本地状态（store 未启用时使用）
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopProcessingId, setStopProcessingId] = useState<string | null>(null);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  /**
   * 设置加载状态（同步到 store）
   */
  const setLoadingState = useCallback(
    (value: boolean) => {
      if (storeEnabled) {
        appStore.getState().setExecutionsLoading(value);
      }
      setLoading(value);
    },
    [storeEnabled]
  );

  /**
   * 设置错误状态（同步到 store）
   */
  const setErrorState = useCallback(
    (message: string | null) => {
      if (storeEnabled) {
        appStore.getState().setExecutionsError(message);
      }
      setError(message);
    },
    [storeEnabled]
  );

  /**
   * 应用执行列表数据（同步到 store）
   */
  const applyExecutionsData = useCallback(
    (records: ExecutionRecord[]) => {
      if (storeEnabled) {
        const api = appStore.getState();
        api.hydrateExecutions(records);

        // 同步待审批项
        const entries = extractPending(records);
        api.upsertPendingApprovals(entries);

        // 清理已不存在的审批项
        const validIds = new Set(entries.map((entry) => entry.id));
        const stateAfterUpdate = appStore.getState();
        Object.keys(stateAfterUpdate.approvals.pendingById).forEach((id) => {
          if (!validIds.has(id)) {
            stateAfterUpdate.removePendingApproval(id);
          }
        });
      } else {
        setExecutions(records);
      }
    },
    [storeEnabled]
  );

  /**
   * 加载执行列表
   */
  const loadExecutions = useCallback(async () => {
    // 取消之前的请求
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingState(true);
    try {
      const list = await fetchExecutions(controller.signal);
      applyExecutionsData(list);
      setErrorState(null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorState((err as Error).message ?? '获取执行列表失败');
      }
    } finally {
      setLoadingState(false);
    }
  }, [applyExecutionsData, setErrorState, setLoadingState]);

  /**
   * 调度延迟刷新（250ms 防抖）
   */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      loadExecutions().catch((err) =>
        setErrorState((err as Error).message ?? '刷新执行列表失败')
      );
    }, 250);
  }, [loadExecutions, setErrorState]);

  /**
   * 手动刷新
   */
  const refreshExecutions = useCallback(async () => {
    try {
      await loadExecutions();
    } catch (err) {
      setErrorState((err as Error).message ?? '刷新执行列表失败');
    }
  }, [loadExecutions, setErrorState]);

  /**
   * 停止执行
   */
  const stopExecutionById = useCallback(
    async (executionId: string) => {
      setStopProcessingId(executionId);
      try {
        await stopExecution(executionId);
        // 如果未启用 store，手动刷新列表
        if (!storeEnabled) {
          await loadExecutions();
        }
      } catch (err) {
        setErrorState((err as Error).message ?? '停止执行失败');
        throw err;
      } finally {
        setStopProcessingId(null);
      }
    },
    [loadExecutions, setErrorState, storeEnabled]
  );

  /**
   * 初始化：加载执行列表
   */
  useEffect(() => {
    loadExecutions().catch((err) => setErrorState((err as Error).message));

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadExecutions, setErrorState]);

  /**
   * 清理：清除延迟刷新定时器
   */
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  return {
    executions,
    loading,
    error,
    stopProcessingId,
    refreshExecutions,
    stopExecutionById,
    scheduleRefresh
  };
}
