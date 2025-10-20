/**
 * MCP 服务器配置管理 Hook
 * 负责 MCP 服务器列表加载、选择和状态管理
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMcpServers, type McpServerSummary } from '../../services';
import { appStore } from '../../state/appStore';

export interface UseMcpServerManagementOptions {
  /**
   * 是否启用 Zustand store
   */
  storeEnabled: boolean;
}

export interface UseMcpServerManagementResult {
  /**
   * MCP 服务器列表（仅在未启用 store 时有效）
   */
  servers: McpServerSummary[];

  /**
   * 当前选中的服务器名称
   */
  selectedServer: string | null;

  /**
   * 错误信息
   */
  error: string | null;

  /**
   * 更新选中的服务器
   */
  updateSelectedServer: (serverName: string | null) => void;
}

/**
 * MCP 服务器配置管理
 */
export function useMcpServerManagement(
  options: UseMcpServerManagementOptions
): UseMcpServerManagementResult {
  const { storeEnabled } = options;

  // 本地状态（store 未启用时使用）
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref 用于保存选中状态（避免闭包陷阱）
  const selectedServerRef = useRef<string | null>(null);

  /**
   * 设置 MCP 状态（同步到 store）
   */
  const setMcpStatus = useCallback(
    (status: 'idle' | 'loading' | 'error') => {
      if (storeEnabled) {
        appStore.getState().setMcpStatus(status);
      }
    },
    [storeEnabled]
  );

  /**
   * 设置错误状态（同步到 store）
   */
  const setErrorState = useCallback(
    (message: string | null) => {
      if (storeEnabled) {
        appStore.getState().setMcpError(message);
      }
      setError(message);
    },
    [storeEnabled]
  );

  /**
   * 应用服务器列表数据（同步到 store）
   */
  const applyServers = useCallback(
    (serverList: McpServerSummary[]) => {
      if (storeEnabled) {
        appStore.getState().hydrateMcpServers(serverList, Date.now());
      }
      setServers(serverList);
    },
    [storeEnabled]
  );

  /**
   * 更新选中的服务器（同步到 store）
   */
  const updateSelectedServer = useCallback(
    (serverName: string | null) => {
      if (storeEnabled) {
        appStore.getState().selectMcpServer(serverName);
      }
      setSelectedServer(serverName);
      selectedServerRef.current = serverName;
    },
    [storeEnabled]
  );

  /**
   * 初始化：加载 MCP 服务器列表
   */
  useEffect(() => {
    let cancelled = false;

    setMcpStatus('loading');

    fetchMcpServers()
      .then((serverList) => {
        if (cancelled) {
          return;
        }

        applyServers(serverList);
        setErrorState(null);

        // 恢复之前的选择或自动选择第一个
        const preferred = storeEnabled
          ? appStore.getState().mcpConfig.selectedName
          : selectedServerRef.current;

        const nextSelection =
          preferred && serverList.some((server) => server.name === preferred)
            ? preferred
            : serverList[0]?.name ?? null;

        updateSelectedServer(nextSelection);
        setMcpStatus('idle');
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }

        applyServers([]);
        updateSelectedServer(null);
        setErrorState((err as Error).message ?? '获取 MCP 服务器配置失败');
        setMcpStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [applyServers, setErrorState, setMcpStatus, storeEnabled, updateSelectedServer]);

  return {
    servers,
    selectedServer,
    error,
    updateSelectedServer
  };
}
