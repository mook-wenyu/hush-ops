import { startTransition, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, useDeferredValue } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
// 使用自定义样式替代库内置样式（避免构建导出不兼容）

import { BridgeStatus } from "./components/BridgeStatus";
import { ExecutionList } from "./components/ExecutionList";
import { PendingApprovals } from "./components/PendingApprovals";
import { PlanActions } from "./components/PlanActions";
import { PlanNodeEditor } from "./components/PlanNodeEditor";
// P2: 插件侧栏惰性加载（仅在显式打开时挂载）
const PluginSidePanelsLazy = lazy(() =>
  import("./components/PluginSidePanels").then((m) => ({ default: m.PluginSidePanels }))
);
import {
  PlanCanvas,
  type PlanJson,
  type PlanNodeJson,
  type PlanNodePositionUpdate
} from "./components/graph/PlanCanvas";
import { PluginRuntimeProvider, type PluginRuntime, type PluginToolStreamEvent } from "./plugins/runtime";
import { isPluginsDisabled } from "./utils/plugins";
import {
  dryRunPlan,
  executePlan,
  fetchExecutions,
  stopExecution,
  submitApprovalDecision,
  fetchMcpTools,
  callMcpTool,
  requestApproval,
  fetchExecutionToolStreamSummaries,
  fetchExecutionToolStreamChunks,
  replayExecutionToolStream,
  fetchMcpServers,
  type McpServerSummary
} from "./services";
import {
  useBridgeConnection,
  type BridgeTelemetryEvent,
  type SequenceGapInfo
} from "./hooks/useBridgeConnection";
import {
  appStore,
  selectApprovalCommentDrafts,
  selectApprovalProcessingIds,
  selectExecutionsError,
  selectExecutionsList,
  selectExecutionsLoading,
  selectPendingApprovalsList,
  useAppStoreFeatureFlag,
  useAppStoreSelector
} from "./state/appStore";
import type {
  BridgeState,
  ExecutionRecord,
  ExecutionSnapshot,
  OrchestratorEventEnvelope,
  PendingApprovalEntry,
  RuntimeToolStreamPayload
} from "./types/orchestrator";
import { updatePlanInputWithNodePositions } from "./utils/planTransforms";

const TOPICS = ["runtime", "bridge", "execution", "approvals"];

const RUNTIME_EXECUTION_STATUSES = [
  "idle",
  "pending",
  "running",
  "success",
  "failed",
  "cancelled"
] as const;

type RuntimeExecutionStatus = (typeof RUNTIME_EXECUTION_STATUSES)[number];

interface RuntimeSnapshot {
  readonly planId: string | null;
  readonly executionStatus: RuntimeExecutionStatus;
  readonly running: boolean;
  readonly currentNodeId: string | null;
  readonly completedNodeIds: ReadonlySet<string>;
  readonly pendingNodeIds: ReadonlySet<string>;
}

function isRuntimeExecutionStatus(value: string): value is RuntimeExecutionStatus {
  return (RUNTIME_EXECUTION_STATUSES as readonly string[]).includes(value);
}

function extractPending(entries: ExecutionRecord[]): ExecutionRecord["pendingApprovals"] {
  return entries.flatMap((execution) => execution.pendingApprovals);
}

function normalizeErrorMessage(input: unknown, fallback: string): string {
  if (!input) {
    return fallback;
  }
  if (typeof input === "string") {
    return input;
  }
  if (typeof input === "object") {
    const candidate = input as { message?: unknown };
    if (typeof candidate.message === "string") {
      return candidate.message;
    }
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

export function App() {
  // 挂载就绪标记：供 e2e/a11y 用例等待 React 完整挂载
  useEffect(() => {
    try { document.documentElement.setAttribute('data-app-mounted', '1'); } catch {}
    return () => { try { document.documentElement.removeAttribute('data-app-mounted'); } catch {} };
  }, []);


  const storeEnabled = useAppStoreFeatureFlag();
  const storeExecutions = useAppStoreSelector(selectExecutionsList);
  const storeExecutionsLoading = useAppStoreSelector(selectExecutionsLoading);
  const storeExecutionsError = useAppStoreSelector(selectExecutionsError);
  const storePendingApprovals = useAppStoreSelector(selectPendingApprovalsList);
  const storeApprovalCommentDrafts = useAppStoreSelector(selectApprovalCommentDrafts);
  const storeProcessingIds = useAppStoreSelector(selectApprovalProcessingIds);
  const storeBridgeState = useAppStoreSelector((state) => state.runtime.bridgeState);
  const storeRuntimeSnapshot = useAppStoreSelector((state) => state.runtime.snapshot);
  const storeMcpConfig = useAppStoreSelector((state) => state.mcpConfig);

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

  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planInput, setPlanInput] = useState("");
  const [planWarnings, setPlanWarnings] = useState<string[]>([]);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerSummary[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [mcpServerError, setMcpServerError] = useState<string | null>(null);
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});
  const [approvalProcessing, setApprovalProcessing] = useState<string | null>(null);
  const [stopProcessingId, setStopProcessingId] = useState<string | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeSnapshot>({
    planId: null,
    executionStatus: "idle",
    running: false,
    currentNodeId: null,
    completedNodeIds: new Set(),
    pendingNodeIds: new Set()
  });
  const [selectedPlanNodeId, setSelectedPlanNodeId] = useState<string | null>(null);

  const effectiveSelectedServer =
    storeEnabled && storeMcpConfig.selectedName !== null ? storeMcpConfig.selectedName : selectedServer;

  const mcpBridge = useMemo(
    () => ({
      listTools: async () => {
        if (!effectiveSelectedServer) {
          throw new Error("尚未选择 MCP 服务器，请先在计划控制中选择。");
        }
        return fetchMcpTools(effectiveSelectedServer);
      },
      callTool: async (toolName: string, input: unknown) => {
        if (!effectiveSelectedServer) {
          throw new Error("尚未选择 MCP 服务器，无法调用工具。");
        }
        return callMcpTool(toolName, input, effectiveSelectedServer);
      },
      requestApproval: (payload: Parameters<typeof requestApproval>[0]) => requestApproval(payload),
      listToolStreamSummaries: (executionId: string) => fetchExecutionToolStreamSummaries(executionId),
      fetchToolStreamChunks: async (executionId: string, correlationId: string) => {
        const chunks = await fetchExecutionToolStreamChunks(executionId, correlationId);
        return chunks.map((chunk) => ({
          toolName: chunk.toolName,
          message: chunk.message,
          timestamp: chunk.timestamp,
          status: chunk.status,
          correlationId: chunk.correlationId,
          executionId: chunk.executionId,
          planId: chunk.planId,
          nodeId: chunk.nodeId,
          error: chunk.error,
          sequence: chunk.sequence,
          storedAt: chunk.storedAt,
          replayed: chunk.replayed ?? false,
          source: chunk.source
        }));
      },
      replayToolStream: (executionId: string, correlationId: string) =>
        replayExecutionToolStream(executionId, correlationId)
    }),
    [effectiveSelectedServer]
  );

  const pluginRuntimeOptions = useMemo(
    () => ({
      availableEvents: ["runtime:state-change", "runtime.tool-stream"],
      availableMcpTools: [] as readonly string[],
      bridge: mcpBridge
    }),
    [mcpBridge]
  );

  const refreshTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pluginRuntimeRef = useRef<PluginRuntime | null>(null);
  const selectedServerRef = useRef<string | null>(null);

  const setExecutionsLoadingState = useCallback(
    (value: boolean) => {
      if (storeEnabled) {
        appStore.getState().setExecutionsLoading(value);
      }
      setLoading(value);
    },
    [storeEnabled]
  );

  const setExecutionsErrorState = useCallback(
    (message: string | null) => {
      if (storeEnabled) {
        appStore.getState().setExecutionsError(message);
      }
      setError(message);
    },
    [storeEnabled]
  );

  const applyExecutionsData = useCallback(
    (records: ExecutionRecord[]) => {
      if (storeEnabled) {
        runStoreMutation(() => {
          const api = appStore.getState();
          api.hydrateExecutions(records);
          const entries = extractPending(records);
          api.upsertPendingApprovals(entries);
          const stateAfterUpdate = appStore.getState();
          const validIds = new Set(entries.map((entry) => entry.id));
          Object.keys(stateAfterUpdate.approvals.pendingById).forEach((id) => {
            if (!validIds.has(id)) {
              stateAfterUpdate.removePendingApproval(id);
            }
          });
        });
      } else {
        setExecutions(records);
      }
    },
    [runStoreMutation, storeEnabled]
  );

  const applyBridgeState = useCallback(
    (next: BridgeState) => {
      if (storeEnabled) {
        appStore.getState().setBridgeState(next);
      }
      setBridgeState(next);
    },
    [storeEnabled]
  );

  const setMcpStatusState = useCallback(
    (status: "idle" | "loading" | "error") => {
      if (storeEnabled) {
        appStore.getState().setMcpStatus(status);
      }
    },
    [storeEnabled]
  );

  const setMcpErrorState = useCallback(
    (message: string | null) => {
      if (storeEnabled) {
        appStore.getState().setMcpError(message);
      }
      setMcpServerError(message);
    },
    [storeEnabled]
  );

  const applyMcpServers = useCallback(
    (servers: McpServerSummary[]) => {
      if (storeEnabled) {
        appStore.getState().hydrateMcpServers(servers, Date.now());
      }
      setMcpServers(servers);
    },
    [storeEnabled]
  );

  const updateSelectedServer = useCallback(
    (next: string | null) => {
      if (storeEnabled) {
        appStore.getState().selectMcpServer(next);
      }
      setSelectedServer(next);
      selectedServerRef.current = next;
    },
    [storeEnabled]
  );

  const updateApprovalComment = useCallback(
    (id: string, value: string) => {
      if (storeEnabled) {
        appStore.getState().setApprovalCommentDraft(id, value);
      }
      setApprovalComments((prev) => ({
        ...prev,
        [id]: value
      }));
    },
    [storeEnabled]
  );

  const clearApprovalComment = useCallback(
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
      setApprovalComments((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [storeEnabled]
  );

  const startApprovalProcessing = useCallback(
    (id: string) => {
      if (storeEnabled) {
        const apiState = appStore.getState();
        apiState.approvals.processingIds.forEach((existingId) => {
          if (existingId !== id) {
            apiState.setApprovalProcessing(existingId, false);
          }
        });
        apiState.setApprovalProcessing(id, true);
      }
      setApprovalProcessing(id);
    },
    [storeEnabled]
  );

  const finishApprovalProcessing = useCallback(
    (id?: string) => {
      if (storeEnabled) {
        const apiState = appStore.getState();
        const targets = id ? [id] : apiState.approvals.processingIds;
        targets.forEach((target) => {
          apiState.setApprovalProcessing(target, false);
        });
      }
      setApprovalProcessing(null);
    },
    [storeEnabled]
  );

  const loadExecutions = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setExecutionsLoadingState(true);
    try {
      const list = await fetchExecutions(controller.signal);
      applyExecutionsData(list);
      setExecutionsErrorState(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setExecutionsErrorState((err as Error).message ?? "获取执行列表失败");
      }
    } finally {
      setExecutionsLoadingState(false);
    }
  }, [applyExecutionsData, setExecutionsErrorState, setExecutionsLoadingState]);

  useEffect(() => {
    loadExecutions().catch((err) => setExecutionsErrorState((err as Error).message));
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadExecutions, setExecutionsErrorState]);

  useEffect(() => {
    let cancelled = false;
    fetch("/plans/demo-mixed.json")
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
        // ignore，用户可自行粘贴 Plan
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMcpStatusState("loading");
    fetchMcpServers()
      .then((servers) => {
        if (cancelled) {
          return;
        }
        applyMcpServers(servers);
        setMcpErrorState(null);
        const preferred = storeEnabled ? appStore.getState().mcpConfig.selectedName : selectedServerRef.current;
        const nextSelection =
          preferred && servers.some((server) => server.name === preferred)
            ? preferred
            : servers[0]?.name ?? null;
        updateSelectedServer(nextSelection);
        setMcpStatusState("idle");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        applyMcpServers([]);
        updateSelectedServer(null);
        setMcpErrorState((err as Error).message ?? "获取 MCP 服务器配置失败");
        setMcpStatusState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyMcpServers, setMcpErrorState, setMcpStatusState, storeEnabled, updateSelectedServer]);

  const scheduleExecutionsRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      loadExecutions().catch((err) => setExecutionsErrorState((err as Error).message));
    }, 250);
  }, [loadExecutions, setExecutionsErrorState]);

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
        const toolEvent: PluginToolStreamEvent = {
          toolName: typeof toolPayload?.toolName === "string" ? toolPayload.toolName : "unknown",
          message: messageValue,
          timestamp: typeof toolPayload?.timestamp === "string" ? toolPayload.timestamp : envelope.timestamp,
          executionId:
            typeof toolPayload?.executionId === "string"
              ? toolPayload.executionId
              : hasExecutionId
                ? executionId
                : undefined,
          status: toolPayload?.status,
          correlationId: typeof toolPayload?.correlationId === "string" ? toolPayload.correlationId : undefined,
          nodeId: typeof toolPayload?.nodeId === "string" ? toolPayload.nodeId : undefined,
          planId: typeof toolPayload?.planId === "string" ? toolPayload.planId : undefined,
          result: toolPayload?.result,
          error: typeof toolPayload?.error === "string" ? toolPayload.error : undefined,
          sequence: typeof toolPayload?.sequence === "number" ? toolPayload.sequence : undefined,
          storedAt: typeof toolPayload?.storedAt === "string" ? toolPayload.storedAt : undefined,
          replayed: Boolean(toolPayload?.replayed),
          source: typeof toolPayload?.source === "string" ? toolPayload.source : "live"
        };
        pluginRuntimeRef.current?.notifyBridgeOutput(toolEvent);
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
            appStore.getState().applyExecutionPatch(executionId, {
              status: resultPayload.status ?? "success",
              executionStatus: resultPayload.status ?? "success",
              running: false,
              startedAt: resultPayload.startedAt,
              finishedAt: resultPayload.finishedAt,
              result: resultPayload.outputs,
              error: resultPayload.error
                ? { message: normalizeErrorMessage(resultPayload.error, "执行失败") }
                : undefined,
              pendingApprovals: []
            });
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
      setExecutionsErrorState("检测到桥接事件序列缺口，已触发回退轮询。");
    },
    [setExecutionsErrorState]
  );

  const handleFallbackPoll = useCallback(() => loadExecutions(), [loadExecutions]);

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

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const legacyPendingApprovals = useMemo(() => extractPending(executions), [executions]);
  const effectiveExecutions = storeEnabled ? storeExecutions : executions;
  const effectivePendingApprovals = storeEnabled ? storePendingApprovals : legacyPendingApprovals;
  const pendingNodeIdsFromExecutions = useMemo(() => {
    const nodes = new Set<string>();
    effectivePendingApprovals.forEach((entry) => {
      if (entry.nodeId) {
        nodes.add(entry.nodeId);
      }
    });
    return nodes;
  }, [effectivePendingApprovals]);
  const deferredPlanInput = useDeferredValue(planInput);
  const parsedPlan = useMemo<PlanJson | null>(() => {
    if (!deferredPlanInput.trim()) {
      return null;
    }
    try {
      const candidate = JSON.parse(deferredPlanInput) as PlanJson;
      if (!candidate || typeof candidate !== "object") {
        return null;
      }
      return candidate;
    } catch {
      return null;
    }
  }, [deferredPlanInput]);

  const parsedPlanId = parsedPlan?.id ?? null;

  useEffect(() => {
    if (!selectedPlanNodeId) {
      return;
    }
    const exists = parsedPlan?.nodes?.some((node) => node?.id === selectedPlanNodeId);
    if (!exists) {
      setSelectedPlanNodeId(null);
    }
  }, [parsedPlan, selectedPlanNodeId]);
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
  const effectiveLoading = storeEnabled ? storeExecutionsLoading : loading;
  const effectiveError = storeEnabled && storeExecutionsError ? storeExecutionsError : error;
  const effectiveCommentMap =
    storeEnabled && Object.keys(storeApprovalCommentDrafts).length > 0 ? storeApprovalCommentDrafts : approvalComments;
  const effectiveProcessingId =
    storeEnabled && storeProcessingIds.length > 0 ? storeProcessingIds[0] ?? null : approvalProcessing;
  const effectiveServers = storeEnabled ? storeMcpConfig.servers : mcpServers;
  const effectiveMcpError = storeEnabled && storeMcpConfig.error ? storeMcpConfig.error : mcpServerError;
  const matchingRuntimePlan =
    parsedPlanId !== null && runtimePlanId !== null && runtimePlanId === parsedPlanId;

  const planCanvasPendingNodeIds = useMemo(() => {
    const nodes = new Set<string>(pendingNodeIdsFromExecutions);
    if (matchingRuntimePlan) {
      runtimePendingNodeIds.forEach((id) => nodes.add(id));
    }
    return nodes;
  }, [pendingNodeIdsFromExecutions, runtimePendingNodeIds, matchingRuntimePlan]);

  const handleReconnect = useCallback(() => {
    reconnectBridge();
  }, [reconnectBridge]);

  const handleRefreshClick = useCallback(() => {
    loadExecutions().catch((err) => setExecutionsErrorState((err as Error).message));
  }, [loadExecutions, setExecutionsErrorState]);

  const handleStopExecution = useCallback(
    async (executionId: string) => {
      setStopProcessingId(executionId);
      try {
        await stopExecution(executionId);
        if (!storeEnabled) {
          await loadExecutions();
        }
      } catch (err) {
        setExecutionsErrorState((err as Error).message ?? "停止执行失败");
      } finally {
        setStopProcessingId(null);
      }
    },
    [loadExecutions, setExecutionsErrorState, storeEnabled]
  );

  const handlePlanChange = useCallback((value: string) => {
    setPlanInput(value);
    setPlanMessage(null);
    setPlanError(null);
  }, []);

  const handleUpdatePlanNode = useCallback(
    (nodeId: string, updates: Partial<Omit<PlanNodeJson, "id">>) => {
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
          if (!currentNode || typeof currentNode.id !== "string") {
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
          setPlanError(`更新节点失败：${(err as Error).message}`);
          return prev;
        }
      });
    },
    []
  );

  const handleUpdatePlanNodePositions = useCallback(
    (updates: readonly PlanNodePositionUpdate[]) => {
      if (!updates.length) {
        return;
      }
      setPlanInput((prev) => {
        try {
          const next = updatePlanInputWithNodePositions(prev, updates);
          if (next !== prev) {
            setPlanError(null);
          }
          return next;
        } catch (err) {
          setPlanError(`更新节点位置失败：${(err as Error).message}`);
          return prev;
        }
      });
    },
    [setPlanError]
  );


  const handleDryRun = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(planInput);
    } catch (err) {
      setPlanError(`Plan JSON 解析失败：${(err as Error).message}`);
      setPlanWarnings([]);
      return;
    }
    setPlanBusy(true);
    try {
      const result = await dryRunPlan(parsed);
      setPlanWarnings(result.warnings ?? []);
      setPlanMessage(`Plan ${result.planId ?? "unknown"} dry-run 完成`);
      setPlanError(null);
    } catch (err) {
      setPlanError((err as Error).message ?? "dry-run 失败");
      setPlanWarnings([]);
      setPlanMessage(null);
    } finally {
      setPlanBusy(false);
    }
  }, [planInput]);

  const handleExecute = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(planInput);
    } catch (err) {
      setPlanError(`Plan JSON 解析失败：${(err as Error).message}`);
      setPlanWarnings([]);
      return;
    }
    if (!effectiveSelectedServer) {
      setPlanError("未检测到可用的 MCP 服务器，请先选择配置后再执行。");
      setPlanWarnings([]);
      setPlanMessage(null);
      return;
    }
    setPlanBusy(true);
    try {
      const result = await executePlan(parsed, effectiveSelectedServer);
      setPlanMessage(`已提交执行：${result.planId}（状态 ${result.status}）`);
      setPlanError(null);
      setPlanWarnings([]);
      if (!storeEnabled) {
        await loadExecutions();
      }
    } catch (err) {
      setPlanError((err as Error).message ?? "执行计划失败");
      setPlanMessage(null);
    } finally {
      setPlanBusy(false);
    }
  }, [effectiveSelectedServer, loadExecutions, planInput, storeEnabled]);

  const handleApprovalCommentChange = useCallback(
    (id: string, value: string) => {
      updateApprovalComment(id, value);
    },
    [updateApprovalComment]
  );

  const handleApprovalDecision = useCallback(
    async (id: string, decision: "approved" | "rejected") => {
      startApprovalProcessing(id);
      try {
        const comment = storeEnabled
          ? appStore.getState().approvals.commentDrafts[id] ?? ""
          : approvalComments[id] ?? "";
        await submitApprovalDecision(id, decision, comment);
        clearApprovalComment(id);
        if (!storeEnabled) {
          await loadExecutions();
        }
      } catch (err) {
        setExecutionsErrorState((err as Error).message ?? "审批操作失败");
      } finally {
        finishApprovalProcessing(id);
      }
    },
    [
      approvalComments,
      clearApprovalComment,
      finishApprovalProcessing,
      loadExecutions,
      setExecutionsErrorState,
      startApprovalProcessing,
      storeEnabled
    ]
  );

  const handleStopClick = useCallback(
    (executionId: string) => {
      if (actionsDisabled) {
        return;
      }
      void handleStopExecution(executionId);
    },
    [actionsDisabled, handleStopExecution]
  );

  const handleApprove = useCallback(
    (id: string) => handleApprovalDecision(id, "approved"),
    [handleApprovalDecision]
  );

  const handleReject = useCallback(
    (id: string) => handleApprovalDecision(id, "rejected"),
    [handleApprovalDecision]
  );

  const handleFocusApprovalNode = useCallback((nodeId: string) => {
    setSelectedPlanNodeId(nodeId);
  }, []);

  const pluginsDisabled = isPluginsDisabled();
  const [pluginPanelsOpen, setPluginPanelsOpen] = useState(false);

  const mainLayout = (
    <div className="container mx-auto flex flex-col gap-4 p-4 lg:p-6">
      <div className="card bg-base-300/70 shadow-xl">
        <div className="card-body space-y-2">
          <h1 className="card-title text-2xl font-semibold">hush-ops 控制面板</h1>
          <p className="text-sm text-base-content/70">
            实时监控混合编排执行状态，断线时自动进入只读模式。
          </p>
          {effectiveError && (
            <div className="alert alert-error text-sm">
              <span>错误：{effectiveError}</span>
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
              executions={effectiveExecutions}
              loading={effectiveLoading}
              onRefresh={handleRefreshClick}
              onStop={actionsDisabled ? undefined : handleStopClick}
              disabled={actionsDisabled}
              stopProcessingId={stopProcessingId}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="w-2 bg-base-300/60 hover:bg-base-300 transition-colors cursor-col-resize" aria-label="调整执行列表宽度" />

        {/* 中：计划编辑+画布 */}
        <Panel defaultSize={60} minSize={30} order={2} className="p-3 overflow-auto">
          <div className="space-y-4">
            <PlanActions
              planValue={planInput}
              onPlanChange={handlePlanChange}
              onDryRun={handleDryRun}
              onExecute={handleExecute}
              serverOptions={effectiveServers}
              selectedServer={effectiveSelectedServer}
              onServerChange={updateSelectedServer}
              serverError={effectiveMcpError}
              warnings={planWarnings}
              message={planMessage}
              busy={planBusy}
              disabled={actionsDisabled}
              error={planError}
            />
            <PlanNodeEditor
              plan={parsedPlan}
              selectedNodeId={selectedPlanNodeId}
              onSelectNode={setSelectedPlanNodeId}
              onUpdateNode={handleUpdatePlanNode}
            />
            <PlanCanvas
              plan={parsedPlan}
              bridgeState={effectiveBridgeState}
              pendingNodeIds={planCanvasPendingNodeIds}
              currentNodeId={matchingRuntimePlan ? runtimeCurrentNodeId : null}
              completedNodeIds={matchingRuntimePlan ? runtimeCompletedNodeIds : undefined}
              executionStatus={matchingRuntimePlan ? runtimeExecutionStatus : undefined}
              selectedNodeId={selectedPlanNodeId}
              onSelectNode={setSelectedPlanNodeId}
              onUpdateNodePositions={handleUpdatePlanNodePositions}
            />
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
              entries={effectivePendingApprovals}
              disabled={actionsDisabled}
              commentMap={effectiveCommentMap}
              onCommentChange={handleApprovalCommentChange}
              onApprove={handleApprove}
              onReject={handleReject}
              processingId={effectiveProcessingId}
              onFocusNode={handleFocusApprovalNode}
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
