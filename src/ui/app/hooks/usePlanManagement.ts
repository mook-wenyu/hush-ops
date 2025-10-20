/**
 * 计划管理 Hook
 * 负责计划的编辑、解析、验证、执行和节点操作
 */

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from 'react';
import { dryRunPlan, executePlan } from '../../services';
import { updatePlanInputWithNodePositions } from '../../utils/planTransforms';
import type {
  PlanJson,
  PlanNodeJson,
  PlanNodePositionUpdate
} from '../../components/graph/PlanCanvas';

export interface UsePlanManagementOptions {
  /**
   * 当前选中的 MCP 服务器（执行计划时需要）
   */
  selectedServer: string | null;

  /**
   * store 是否启用（用于决定是否需要手动刷新执行列表）
   */
  storeEnabled: boolean;

  /**
   * 执行成功后的回调（用于刷新执行列表）
   */
  onExecutionSuccess?: () => void;
}

export interface UsePlanManagementResult {
  /**
   * 计划 JSON 文本
   */
  planInput: string;

  /**
   * 解析后的计划对象
   */
  parsedPlan: PlanJson | null;

  /**
   * Dry-run 警告列表
   */
  warnings: string[];

  /**
   * 操作成功消息
   */
  message: string | null;

  /**
   * 操作错误消息
   */
  error: string | null;

  /**
   * 是否正在处理（dry-run 或执行中）
   */
  busy: boolean;

  /**
   * 当前选中的节点 ID
   */
  selectedNodeId: string | null;

  /**
   * 更新计划文本
   */
  updatePlanInput: (value: string) => void;

  /**
   * Dry-run 验证
   */
  executeDryRun: () => Promise<void>;

  /**
   * 执行计划
   */
  executePlanAction: () => Promise<void>;

  /**
   * 更新节点属性
   */
  updateNode: (nodeId: string, updates: Partial<Omit<PlanNodeJson, 'id'>>) => void;

  /**
   * 批量更新节点位置
   */
  updateNodePositions: (updates: readonly PlanNodePositionUpdate[]) => void;

  /**
   * 选择节点
   */
  selectNode: (nodeId: string | null) => void;
}

/**
 * 计划管理
 */
export function usePlanManagement(
  options: UsePlanManagementOptions
): UsePlanManagementResult {
  const { selectedServer, storeEnabled, onExecutionSuccess } = options;

  // 状态
  const [planInput, setPlanInput] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 延迟解析（避免输入时频繁解析大文件）
  const deferredPlanInput = useDeferredValue(planInput);

  /**
   * 解析计划 JSON
   */
  const parsedPlan = useMemo<PlanJson | null>(() => {
    if (!deferredPlanInput.trim()) {
      return null;
    }
    try {
      const candidate = JSON.parse(deferredPlanInput) as PlanJson;
      if (!candidate || typeof candidate !== 'object') {
        return null;
      }
      return candidate;
    } catch {
      return null;
    }
  }, [deferredPlanInput]);

  /**
   * 初始化：加载示例计划
   */
  useEffect(() => {
    let cancelled = false;

    fetch('/plans/demo-mixed.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`加载示例计划失败 (${response.status})`);
        }
        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setPlanInput(text);
        }
      })
      .catch(() => {
        // 忽略错误，用户可自行粘贴 Plan
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 自动清理无效的节点选择
   */
  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    const exists = parsedPlan?.nodes?.some((node) => node?.id === selectedNodeId);
    if (!exists) {
      setSelectedNodeId(null);
    }
  }, [parsedPlan, selectedNodeId]);

  /**
   * 更新计划文本
   */
  const updatePlanInput = useCallback((value: string) => {
    setPlanInput(value);
    setMessage(null);
    setError(null);
  }, []);

  /**
   * Dry-run 验证
   */
  const executeDryRun = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(planInput);
    } catch (err) {
      setError(`Plan JSON 解析失败：${(err as Error).message}`);
      setWarnings([]);
      return;
    }

    setBusy(true);
    try {
      const result = await dryRunPlan(parsed);
      setWarnings(result.warnings ?? []);
      setMessage(`Plan ${result.planId ?? 'unknown'} dry-run 完成`);
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? 'dry-run 失败');
      setWarnings([]);
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }, [planInput]);

  /**
   * 执行计划
   */
  const executePlanAction = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(planInput);
    } catch (err) {
      setError(`Plan JSON 解析失败：${(err as Error).message}`);
      setWarnings([]);
      return;
    }

    if (!selectedServer) {
      setError('未检测到可用的 MCP 服务器，请先选择配置后再执行。');
      setWarnings([]);
      setMessage(null);
      return;
    }

    setBusy(true);
    try {
      const result = await executePlan(parsed, selectedServer);
      setMessage(`已提交执行：${result.planId}（状态 ${result.status}）`);
      setError(null);
      setWarnings([]);

      // 如果未启用 store，触发执行列表刷新
      if (!storeEnabled && onExecutionSuccess) {
        onExecutionSuccess();
      }
    } catch (err) {
      setError((err as Error).message ?? '执行计划失败');
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }, [planInput, selectedServer, storeEnabled, onExecutionSuccess]);

  /**
   * 更新节点属性
   */
  const updateNode = useCallback(
    (nodeId: string, updates: Partial<Omit<PlanNodeJson, 'id'>>) => {
      setPlanInput((prev) => {
        if (!prev.trim()) {
          return prev;
        }
        try {
          const parsed = JSON.parse(prev) as PlanJson;
          if (!Array.isArray(parsed.nodes)) {
            return prev;
          }
          const index = parsed.nodes.findIndex((node) => node?.id === nodeId);
          if (index === -1) {
            return prev;
          }
          const nextNodes = [...parsed.nodes];
          const currentNode = nextNodes[index];
          if (!currentNode || typeof currentNode.id !== 'string') {
            return prev;
          }
          nextNodes[index] = {
            ...currentNode,
            ...updates,
            id: currentNode.id
          };
          const nextPlan: PlanJson = {
            ...parsed,
            nodes: nextNodes
          };
          return JSON.stringify(nextPlan, null, 2);
        } catch (err) {
          setError(`更新节点失败：${(err as Error).message}`);
          return prev;
        }
      });
    },
    []
  );

  /**
   * 批量更新节点位置
   */
  const updateNodePositions = useCallback(
    (updates: readonly PlanNodePositionUpdate[]) => {
      if (!updates.length) {
        return;
      }
      setPlanInput((prev) => {
        try {
          const next = updatePlanInputWithNodePositions(prev, updates);
          if (next !== prev) {
            setError(null);
          }
          return next;
        } catch (err) {
          setError(`更新节点位置失败：${(err as Error).message}`);
          return prev;
        }
      });
    },
    []
  );

  /**
   * 选择节点
   */
  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  return {
    planInput,
    parsedPlan,
    warnings,
    message,
    error,
    busy,
    selectedNodeId,
    updatePlanInput,
    executeDryRun,
    executePlanAction,
    updateNode,
    updateNodePositions,
    selectNode
  };
}
