import { startTransition, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
// 使用自定义样式替代库内置样式（避免构建导出不兼容）

import { BridgeStatus } from "./components/BridgeStatus";
import { ExecutionList } from "./components/ExecutionList";
import { PendingApprovals } from "./components/PendingApprovals";

import { PlanNodeEditor } from "./components/PlanNodeEditor";
import { TOPICS } from "./app/constants";
import { type RuntimeSnapshot, type RuntimeExecutionStatus, isRuntimeExecutionStatus } from "./app/types";
import { normalizeErrorMessage } from "./app/utils";
import { cardClasses } from "./utils/classNames";
import {
  useExecutionsSync,
  useMcpServerManagement,
  usePlanManagement,
  useApprovalManagement
} from "./app/hooks";
// P2: 插件侧栏惰性加载（仅在显式打开时挂载）
const PluginSidePanelsLazy = lazy(() =>
  import("./components/PluginSidePanels").then((m) => ({ default: m.PluginSidePanels }))
);
import { PlanCanvas } from "./components/graph/PlanCanvas";
import { PluginRuntimeProvider, type PluginRuntime, type PluginToolStreamEvent } from "./plugins/runtime";
import { isPluginsDisabled } from "./utils/plugins";
import {
  fetchMcpTools,
  callMcpTool,
  requestApproval,
  fetchExecutionToolStreamSummaries,
  fetchExecutionToolStreamChunks,
  replayExecutionToolStream
} from "./services";
import {
  useBridgeConnection,
  type BridgeTelemetryEvent,
  type SequenceGapInfo
} from "./hooks/useBridgeConnection";
import {
  appStore,
  useAppStoreFeatureFlag,
  useAppStoreSelector
} from "./state/appStore";
import type {
  BridgeState,
  ExecutionSnapshot,
  OrchestratorEventEnvelope,
  PendingApprovalEntry,
  RuntimeToolStreamPayload
} from "./types/orchestrator";

export function App() {
  // 挂载就绪标记：供 e2e/a11y 用例等待 React 完整挂载
  useEffect(() => {
    try { document.documentElement.setAttribute('data-app-mounted', '1'); } catch {}
    return () => { try { document.documentElement.removeAttribute('data-app-mounted'); } catch {} };
  }, []);

  const storeEnabled = useAppStoreFeatureFlag();
  const storeBridgeState = useAppStoreSelector((state) => state.runtime.bridgeState);
  const storeRuntimeSnapshot = useAppStoreSelector((state) => state.runtime.snapshot);

  const runStoreMutation = useCallback(
    (mutator: () => void) => {
      if (!storeEnabled) {
        return;
      }
      startTransition(() => {
        mutator();
      });
    },
    [storeEnabled]
  );

  // ========== 使用提取的 Hooks ==========

  // 执行列表同步
  const {
    executions,
    loading: executionsLoading,
    error: executionsError,
    stopProcessingId,
    refreshExecutions,
    stopExecutionById,
    scheduleRefresh: scheduleExecutionsRefresh
  } = useExecutionsSync({ storeEnabled });

  // MCP 服务器管理
  const {
    servers: _mcpServers,
    selectedServer,
    error: _mcpServerError,
    updateSelectedServer: _updateSelectedServer
  } = useMcpServerManagement({ storeEnabled });

  // 计划管理
  const {
    planInput: _planInput,
    parsedPlan,
    warnings: _planWarnings,
    message: _planMessage,
    error: _planError,
    busy: _planBusy,
    selectedNodeId: selectedPlanNodeId,
    updatePlanInput: _updatePlanInput,
    executeDryRun: _executeDryRun,
    executePlanAction: _executePlanAction,
    updateNode: updatePlanNode,
    updateNodePositions: updatePlanNodePositions,
    selectNode: setSelectedPlanNodeId
  } = usePlanManagement({
    storeEnabled,
    selectedServer,
    onExecutionSuccess: refreshExecutions
  });

  // 审批管理
  const {
    comments: approvalComments,
    processingId: approvalProcessing,
    updateComment: updateApprovalComment,
    approve: approveApproval,
    reject: rejectApproval,
    focusNode: focusApprovalNode
  } = useApprovalManagement({
    storeEnabled,
    onApprovalSuccess: refreshExecutions,
    onError: (err) => {
      // 错误已在 hook 内部处理，这里仅用于可能的额外处理
      console.error('Approval error:', err);
    }
  });

  // ========== 保留的本地状态：运行时快照和桥接状态 ==========

  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeSnapshot>({
    planId: null,
    executionStatus: "idle",
    running: false,
    currentNodeId: null,
    completedNodeIds: new Set(),
    pendingNodeIds: new Set()
  });

  // ========== MCP Bridge 和插件运行时 ==========

  const pluginRuntimeRef = useRef<PluginRuntime | null>(null);

  const mcpBridge = useMemo(
    () => ({
      listTools: async () => {
        if (!selectedServer) {
          throw new Error("尚未选择 MCP 服务器，请先在计划控制中选择。");
        }
        return fetchMcpTools(selectedServer);
      },
      callTool: async (toolName: string, input: unknown) => {
        if (!selectedServer) {
          throw new Error("尚未选择 MCP 服务器，无法调用工具。");
        }
        return callMcpTool(toolName, input, selectedServer);
      },
      requestApproval: (payload: Parameters<typeof requestApproval>[0]) => requestApproval(payload),
      listToolStreamSummaries: (executionId: string) => fetchExecutionToolStreamSummaries(executionId),
      fetchToolStreamChunks: async (executionId: string, correlationId: string) => {
        const chunks = await fetchExecutionToolStreamChunks(executionId, correlationId);
        return chunks.map((chunk) => {
          const ev: any = {
            toolName: chunk.toolName,
            message: chunk.message,
            timestamp: chunk.timestamp,
            status: chunk.status,
            replayed: Boolean(chunk.replayed)
          };
          if (chunk.correlationId) ev.correlationId = chunk.correlationId;
          if (chunk.executionId) ev.executionId = chunk.executionId;
          if (chunk.planId) ev.planId = chunk.planId;
          if (chunk.nodeId) ev.nodeId = chunk.nodeId;
          if (chunk.error) ev.error = chunk.error;
          if (typeof chunk.sequence === "number") ev.sequence = chunk.sequence;
          if (chunk.storedAt) ev.storedAt = chunk.storedAt;
          if (chunk.source) ev.source = chunk.source;
          return ev as PluginToolStreamEvent;
        });
      },
      replayToolStream: (executionId: string, correlationId: string) =>
        replayExecutionToolStream(executionId, correlationId)
    }),
    [selectedServer]
  );

  const pluginRuntimeOptions = useMemo(
    () => ({
      availableEvents: ["runtime:state-change", "runtime.tool-stream"],
      availableMcpTools: [] as readonly string[],
      bridge: mcpBridge
    }),
    [mcpBridge]
  );

  // ========== 桥接状态管理 ==========

  const applyBridgeState = useCallback(
    (next: BridgeState) => {
      if (storeEnabled) {
        appStore.getState().setBridgeState(next);
      }
      setBridgeState(next);
    },
    [storeEnabled]
  );

  // ========== 桥接事件处理 ==========

  const handleEnvelope = useCallback(
    (envelope: OrchestratorEventEnvelope) => {
      const { event, payload, executionId } = envelope;
      const hasExecutionId = typeof executionId === "string" && executionId.length > 0;

      if (event === "runtime.snapshot") {
        if (storeEnabled) {
          const snapshot = payload as ExecutionSnapshot | undefined;
          if (snapshot) {
            runStoreMutation(() => {
              appStore.getState().applyExecutionSnapshot(snapshot);
            });
          }
        } else {
          scheduleExecutionsRefresh();
        }
        return;
      }

      if (event === "runtime.state-change") {
        const statePayload = payload as {
          bridgeState?: BridgeState;
          planId?: string;
          executionStatus?: string;
          running?: boolean;
          currentNodeId?: string | null;
          lastCompletedNodeId?: string | null;
          pendingApprovals?: Array<{ nodeId?: string | null }>;
          bridgeMeta?: unknown;
        };

        setRuntimeSnapshot((prev) => {
          const planId = typeof statePayload?.planId === "string" ? statePayload.planId : prev.planId;
          const statusCandidate = typeof statePayload?.executionStatus === "string" ? statePayload.executionStatus : undefined;
          const executionStatus = statusCandidate && isRuntimeExecutionStatus(statusCandidate)
            ? statusCandidate
            : prev.executionStatus;
          const running = typeof statePayload?.running === "boolean" ? statePayload.running : prev.running;
          const shouldReset = planId !== prev.planId || executionStatus === "idle" || executionStatus === "pending";
          const completed = shouldReset ? new Set<string>() : new Set(prev.completedNodeIds);
          if (statePayload?.lastCompletedNodeId) {
            completed.add(statePayload.lastCompletedNodeId);
          }
          const pending = new Set<string>();
          if (Array.isArray(statePayload?.pendingApprovals)) {
            statePayload.pendingApprovals.forEach((entry) => {
              if (entry?.nodeId) {
                pending.add(entry.nodeId);
              }
            });
          }
          const nextSnapshot = {
            planId: planId ?? null,
            executionStatus,
            running,
            currentNodeId: statePayload?.currentNodeId ?? null,
            completedNodeIds: completed,
            pendingNodeIds: pending
          };
          if (storeEnabled) {
            runStoreMutation(() => {
              appStore.getState().applyRuntimeSnapshot({
                planId: nextSnapshot.planId,
                executionStatus: nextSnapshot.executionStatus,
                running: nextSnapshot.running,
                currentNodeId: nextSnapshot.currentNodeId,
                completedNodeIds: Array.from(nextSnapshot.completedNodeIds),
                pendingNodeIds: Array.from(nextSnapshot.pendingNodeIds)
              });
            });
          }
          return nextSnapshot;
        });

        if (statePayload?.bridgeState) {
          applyBridgeState(statePayload.bridgeState);
        }
        return;
      }

      if (event === "runtime.tool-stream") {
        const toolPayload = payload as RuntimeToolStreamPayload | undefined;
        const messageValue =
          typeof toolPayload?.message === "string"
            ? toolPayload.message
            : typeof toolPayload?.error === "string"
              ? toolPayload.error
              : "";
        const toolEvent: any = {
          toolName: typeof toolPayload?.toolName === "string" ? toolPayload.toolName : "unknown",
          message: messageValue,
          timestamp: typeof toolPayload?.timestamp === "string" ? toolPayload.timestamp : envelope.timestamp,
          status: toolPayload?.status,
          replayed: Boolean(toolPayload?.replayed),
          source: typeof toolPayload?.source === "string" ? toolPayload.source : "live"
        };
        const execIdVal = typeof toolPayload?.executionId === "string" ? toolPayload.executionId : (hasExecutionId ? executionId : undefined);
        if (execIdVal) toolEvent.executionId = execIdVal;
        if (typeof toolPayload?.correlationId === "string") toolEvent.correlationId = toolPayload.correlationId;
        if (typeof toolPayload?.nodeId === "string") toolEvent.nodeId = toolPayload.nodeId;
        if (typeof toolPayload?.planId === "string") toolEvent.planId = toolPayload.planId;
        if (typeof toolPayload?.error === "string") toolEvent.error = toolPayload.error;
        if (typeof toolPayload?.sequence === "number") toolEvent.sequence = toolPayload.sequence;
        if (typeof toolPayload?.storedAt === "string") toolEvent.storedAt = toolPayload.storedAt;
        if (typeof toolPayload?.result !== "undefined") toolEvent.result = toolPayload.result;
        pluginRuntimeRef.current?.notifyBridgeOutput(toolEvent as PluginToolStreamEvent);
        return;
      }

      if (event === "bridge.state-change") {
        const bridgePayload = payload as { state?: BridgeState } | undefined;
        if (bridgePayload?.state) {
          applyBridgeState(bridgePayload.state);
        }
        return;
      }

      if (storeEnabled && hasExecutionId && event === "execution.started") {
        runStoreMutation(() => {
          appStore.getState().applyExecutionPatch(executionId, {
            status: "running",
            executionStatus: "running",
            running: true
          });
        });
        return;
      }

      if (storeEnabled && hasExecutionId && event === "execution.completed") {
        const resultPayload = payload as {
          status?: "success" | "failed" | "cancelled";
          startedAt?: string;
          finishedAt?: string;
          error?: unknown;
          outputs?: unknown;
        };
        if (resultPayload) {
          runStoreMutation(() => {
            const patch: any = {
              status: resultPayload.status ?? "success",
              executionStatus: resultPayload.status ?? "success",
              running: false,
              result: resultPayload.outputs,
              pendingApprovals: []
            };
            if (resultPayload.startedAt) patch.startedAt = resultPayload.startedAt;
            if (resultPayload.finishedAt) patch.finishedAt = resultPayload.finishedAt;
            if (resultPayload.error) {
              patch.error = { message: normalizeErrorMessage(resultPayload.error, "执行失败") };
            }
            appStore.getState().applyExecutionPatch(executionId, patch);
          });
        }
        return;
      }

      if (storeEnabled && hasExecutionId && event === "execution.cancelled") {
        runStoreMutation(() => {
          appStore.getState().applyExecutionPatch(executionId, {
            status: "cancelled",
            executionStatus: "cancelled",
            running: false,
            pendingApprovals: []
          });
        });
        return;
      }

      if (storeEnabled && hasExecutionId && event === "execution.failed") {
        const failedPayload = payload as { message?: string } | undefined;
        runStoreMutation(() => {
          appStore.getState().applyExecutionPatch(executionId, {
            status: "failed",
            executionStatus: "failed",
            running: false,
            error: {
              message: normalizeErrorMessage(failedPayload?.message, "执行失败")
            },
            pendingApprovals: []
          });
        });
        return;
      }

      if (storeEnabled && hasExecutionId && event === "approval.pending") {
        const entry = payload as PendingApprovalEntry | undefined;
        if (entry) {
          runStoreMutation(() => {
            const currentState = appStore.getState();
            const existingEntries = Object.entries(currentState.approvals.executionIndex)
              .filter(([, value]) => value === executionId)
              .map(([id]) => currentState.approvals.pendingById[id])
              .filter((value): value is PendingApprovalEntry => Boolean(value));
            const mergedEntries = [
              ...existingEntries.filter((item) => item.id !== entry.id),
              entry
            ];
            currentState.syncPendingApprovalsForExecution(executionId, mergedEntries);
          });
        }
        return;
      }

      if (storeEnabled && event === "approval.updated") {
        const updatedEntry = payload as { id?: string } | undefined;
        if (typeof updatedEntry?.id === "string") {
          runStoreMutation(() => {
            appStore.getState().removePendingApproval(updatedEntry.id as string);
          });
        }
        return;
      }

      if (
        !storeEnabled &&
        (event?.startsWith("execution.") ||
          event === "approval.pending" ||
          event === "approval.updated")
      ) {
        scheduleExecutionsRefresh();
      }
    },
    [applyBridgeState, runStoreMutation, scheduleExecutionsRefresh, setRuntimeSnapshot, storeEnabled]
  );

  const handleSequenceGap = useCallback(
    (info: SequenceGapInfo) => {
      console.warn("检测到事件序列缺口，已触发回退轮询", info);
      try {
        appStore.getState().setExecutionsError("检测到桥接事件序列缺口，已触发回退轮询。");
      } catch {
        // 忽略测试/初始化阶段的极端情况
      }
    },
    []
  );

  const handleFallbackPoll = useCallback(() => {
    void refreshExecutions();
  }, [refreshExecutions]);

  const handleBridgeTelemetry = useCallback((event: BridgeTelemetryEvent) => {
    console.debug("[bridge-telemetry]", event);
  }, []);

  const { reconnect: reconnectBridge } = useBridgeConnection({
    topics: TOPICS,
    storeEnabled,
    onEvent: handleEnvelope,
    onSequenceGap: handleSequenceGap,
    onFallbackPoll: handleFallbackPoll,
    onConnectionStateChange: applyBridgeState,
    telemetry: handleBridgeTelemetry
  });

  // ========== 计算值 ==========

  const parsedPlanId = parsedPlan?.id ?? null;

  // 当计划变更时清除无效的节点选择
  useEffect(() => {
    if (!selectedPlanNodeId) {
      return;
    }
    const exists = parsedPlan?.nodes?.some((node) => node?.id === selectedPlanNodeId);
    if (!exists) {
      setSelectedPlanNodeId(null);
    }
  }, [parsedPlan, selectedPlanNodeId, setSelectedPlanNodeId]);

  const runtimeSnapshotSource = storeEnabled
    ? {
        planId: storeRuntimeSnapshot.planId,
        executionStatus: storeRuntimeSnapshot.executionStatus as RuntimeExecutionStatus,
        running: storeRuntimeSnapshot.running,
        currentNodeId: storeRuntimeSnapshot.currentNodeId,
        completedNodeIds: new Set(storeRuntimeSnapshot.completedNodeIds),
        pendingNodeIds: new Set(storeRuntimeSnapshot.pendingNodeIds)
      }
    : runtimeSnapshot;

  const runtimePlanId = runtimeSnapshotSource.planId;
  const runtimeCurrentNodeId = runtimeSnapshotSource.currentNodeId;
  const runtimeCompletedNodeIds = runtimeSnapshotSource.completedNodeIds;
  const runtimePendingNodeIds = runtimeSnapshotSource.pendingNodeIds;
  const runtimeExecutionStatus = runtimeSnapshotSource.executionStatus;

  const effectiveBridgeState = storeEnabled ? storeBridgeState : bridgeState;
  const actionsDisabled = effectiveBridgeState !== "connected";

  const matchingRuntimePlan =
    parsedPlanId !== null && runtimePlanId !== null && runtimePlanId === parsedPlanId;

  // 合并待审批节点 ID（从执行列表 + 运行时快照）
  const pendingNodeIdsForCanvas = useMemo(() => {
    const nodes = new Set<string>();
    executions.forEach((exec) => {
      exec.pendingApprovals.forEach((approval) => {
        if (approval.nodeId) {
          nodes.add(approval.nodeId);
        }
      });
    });
    if (matchingRuntimePlan) {
      runtimePendingNodeIds.forEach((id) => nodes.add(id));
    }
    return nodes;
  }, [executions, runtimePendingNodeIds, matchingRuntimePlan]);

  // ========== 简化的事件处理器 ==========

  const handleReconnect = useCallback(() => {
    reconnectBridge();
  }, [reconnectBridge]);

  const handleRefreshClick = useCallback(() => {
    void refreshExecutions();
  }, [refreshExecutions]);

  const handleStopClick = useCallback(
    (executionId: string) => {
      if (actionsDisabled) {
        return;
      }
      void stopExecutionById(executionId);
    },
    [actionsDisabled, stopExecutionById]
  );

  const handleApprove = useCallback(
    (id: string) => approveApproval(id),
    [approveApproval]
  );

  const handleReject = useCallback(
    (id: string) => rejectApproval(id),
    [rejectApproval]
  );

  // ========== UI 渲染 ==========

  const pluginsDisabled = isPluginsDisabled();
  const [pluginPanelsOpen, setPluginPanelsOpen] = useState(false);

  const mainLayout = (
    <div className="container mx-auto flex flex-col gap-4 p-4 lg:p-6">
      <div className={cardClasses()}>
        <div className="card-body space-y-2">
          <h1 className="card-title text-2xl font-semibold">hush-ops 控制面板</h1>
          <p className="text-sm text-base-content/70">
            实时监控混合编排执行状态，断线时自动进入只读模式。
          </p>
          {executionsError && (
            <div className="alert alert-error text-sm">
              <span>错误：{executionsError}</span>
            </div>
          )}
        </div>
      </div>

      {/* 三分栏：左(执行列表) / 中(计划编辑+画布) / 右(审批+状态) */}
      <PanelGroup direction="horizontal" className="min-h-[60vh] rounded-lg border border-base-300/50 bg-base-100/60">
        {/* 左：执行列表 */}
        <Panel defaultSize={20} minSize={16} order={1} className="p-3 overflow-auto">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold opacity-70">执行记录</h2>
            <ExecutionList
              executions={executions}
              loading={executionsLoading}
              onRefresh={handleRefreshClick}
              onStop={handleStopClick}
              disabled={actionsDisabled}
              stopProcessingId={stopProcessingId}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="w-2 bg-base-300/60 hover:bg-base-300 transition-colors cursor-col-resize" aria-label="调整执行列表宽度" />

        {/* 中：计划编辑+画布 */}
        <Panel defaultSize={60} minSize={30} order={2} className="p-3 overflow-auto">
          <div className="space-y-4">
            {/* PlanActions 已移除：在新 Dashboard/EditorView 内提供执行与服务器选择 */}
            <PlanNodeEditor
              plan={parsedPlan}
              selectedNodeId={selectedPlanNodeId}
              onSelectNode={setSelectedPlanNodeId}
              onUpdateNode={updatePlanNode}
            />
            {(() => {
              const props: any = {
                plan: parsedPlan,
                bridgeState: effectiveBridgeState,
                pendingNodeIds: pendingNodeIdsForCanvas,
                currentNodeId: matchingRuntimePlan ? runtimeCurrentNodeId : null,
                completedNodeIds: matchingRuntimePlan ? runtimeCompletedNodeIds : new Set<string>(),
                selectedNodeId: selectedPlanNodeId,
                onSelectNode: setSelectedPlanNodeId,
                onUpdateNodePositions: updatePlanNodePositions
              };
              if (matchingRuntimePlan) props.executionStatus = runtimeExecutionStatus;
              return <PlanCanvas {...props} />;
            })()}

          </div>
        </Panel>
        <PanelResizeHandle className="w-2 bg-base-300/60 hover:bg-base-300 transition-colors cursor-col-resize" aria-label="调整计划画布宽度" />

        {/* 右：审批 + 连接状态 + 插件侧栏 */}
        <Panel defaultSize={20} minSize={16} order={3} className="p-3 overflow-auto">
          <div className="space-y-3">
            {effectiveBridgeState !== "connected" && (
              <BridgeStatus
                state={effectiveBridgeState}
                onReconnect={handleReconnect}
                reconnectDisabled={effectiveBridgeState === "connecting"}
              />
            )}
            <h2 className="text-sm font-semibold opacity-70">待审批</h2>
            <PendingApprovals
              entries={executions.flatMap((exec) => exec.pendingApprovals)}
              disabled={actionsDisabled}
              commentMap={approvalComments}
              onCommentChange={updateApprovalComment}
              onApprove={handleApprove}
              onReject={handleReject}
              processingId={approvalProcessing}
              onFocusNode={focusApprovalNode}
            />

            {!pluginsDisabled && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  data-testid="toggle-plugin-panels"
                  onClick={() => setPluginPanelsOpen((v) => !v)}
                  aria-expanded={pluginPanelsOpen}
                >
                  {pluginPanelsOpen ? "关闭插件面板" : "打开插件面板"}
                </button>
                {pluginPanelsOpen && (
                  <div data-testid="plugin-panels-host">
                    <Suspense fallback={null}>
                      <PluginSidePanelsLazy />
                    </Suspense>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );

  return (
    <PluginRuntimeProvider
      options={pluginRuntimeOptions}
      onRuntimeReady={(runtime) => {
        pluginRuntimeRef.current = runtime;
      }}
    >
      {mainLayout}
    </PluginRuntimeProvider>
  );
}
