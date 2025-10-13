import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BridgeStatus } from "./components/BridgeStatus";
import { ExecutionList } from "./components/ExecutionList";
import { PendingApprovals } from "./components/PendingApprovals";
import { PlanActions } from "./components/PlanActions";
import { PlanNodeEditor } from "./components/PlanNodeEditor";
import { PluginSidePanels } from "./components/PluginSidePanels";
import {
  PlanCanvas,
  type PlanJson,
  type PlanNodeJson,
  type PlanNodePositionUpdate
} from "./components/graph/PlanCanvas";
import { PluginRuntimeProvider, type PluginRuntime, type PluginToolStreamEvent } from "./plugins/runtime";
import {
  createWebSocket,
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
} from "./services/orchestratorApi";
import type {
  BridgeState,
  ExecutionRecord,
  OrchestratorEventEnvelope,
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

export function App() {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketSeed, setSocketSeed] = useState(0);
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
    [selectedServer]
  );

  const socketRef = useRef<WebSocket | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pluginRuntimeRef = useRef<PluginRuntime | null>(null);

  const loadExecutions = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    try {
      const list = await fetchExecutions(controller.signal);
      setExecutions(list);
      setError(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "获取执行列表失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExecutions().catch((err) => setError((err as Error).message));
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadExecutions]);

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
    fetchMcpServers()
      .then((servers) => {
        if (cancelled) {
          return;
        }
        setMcpServers(servers);
        setMcpServerError(null);
        setSelectedServer((current) => {
          if (current && servers.some((server) => server.name === current)) {
            return current;
          }
          return servers[0]?.name ?? null;
        });
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setMcpServers([]);
        setSelectedServer(null);
        setMcpServerError((err as Error).message ?? "获取 MCP 服务器配置失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const socket = createWebSocket(TOPICS);
    socketRef.current = socket;
    setBridgeState("connecting");

    const handleOpen = () => setBridgeState("connected");
    const handleClose = () => setBridgeState((prev) => (prev === "connecting" ? "connecting" : "disconnected"));
    const handleError = () => setBridgeState("disconnected");
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as OrchestratorEventEnvelope;
        if (envelope.event === "runtime.state-change") {
          const payload = envelope.payload as {
            bridgeState?: BridgeState;
            planId?: string;
            executionStatus?: string;
            running?: boolean;
            currentNodeId?: string | null;
            lastCompletedNodeId?: string | null;
            pendingApprovals?: Array<{ nodeId?: string | null }>;
          };

          setRuntimeSnapshot((prev) => {
            const planId = typeof payload?.planId === "string" ? payload.planId : prev.planId;
            const statusCandidate = typeof payload?.executionStatus === "string" ? payload.executionStatus : undefined;
            const executionStatus = statusCandidate && isRuntimeExecutionStatus(statusCandidate)
              ? statusCandidate
              : prev.executionStatus;
            const running = typeof payload?.running === "boolean" ? payload.running : prev.running;
            const shouldReset = planId !== prev.planId || executionStatus === "idle" || executionStatus === "pending";
            const completed = shouldReset ? new Set<string>() : new Set(prev.completedNodeIds);
            if (payload?.lastCompletedNodeId) {
              completed.add(payload.lastCompletedNodeId);
            }
            const pending = new Set<string>();
            if (Array.isArray(payload?.pendingApprovals)) {
              payload.pendingApprovals.forEach((entry) => {
                if (entry?.nodeId) {
                  pending.add(entry.nodeId);
                }
              });
            }
            return {
              planId: planId ?? null,
              executionStatus,
              running,
              currentNodeId: payload?.currentNodeId ?? null,
              completedNodeIds: completed,
              pendingNodeIds: pending
            };
          });

          if (payload?.bridgeState) {
            setBridgeState(payload.bridgeState);
          }
          return;
        }
        if (envelope.event === "runtime.tool-stream") {
          const payload = envelope.payload as RuntimeToolStreamPayload | undefined;
          const messageValue =
            typeof payload?.message === "string"
              ? payload.message
              : typeof payload?.error === "string"
                ? payload.error
                : "";
          const toolEvent: PluginToolStreamEvent = {
            toolName: typeof payload?.toolName === "string" ? payload.toolName : "unknown",
            message: messageValue,
            timestamp: typeof payload?.timestamp === "string" ? payload.timestamp : envelope.timestamp,
            executionId:
              typeof payload?.executionId === "string"
                ? payload.executionId
                : typeof envelope.executionId === "string"
                  ? envelope.executionId
                  : undefined,
            status: payload?.status,
            correlationId: typeof payload?.correlationId === "string" ? payload.correlationId : undefined,
            nodeId: typeof payload?.nodeId === "string" ? payload.nodeId : undefined,
            planId: typeof payload?.planId === "string" ? payload.planId : undefined,
            result: payload?.result,
            error: typeof payload?.error === "string" ? payload.error : undefined,
            sequence: typeof payload?.sequence === "number" ? payload.sequence : undefined,
            storedAt: typeof payload?.storedAt === "string" ? payload.storedAt : undefined,
            replayed: Boolean(payload?.replayed),
            source: typeof payload?.source === "string" ? payload.source : "live"
          };
          pluginRuntimeRef.current?.notifyBridgeOutput(toolEvent);
          return;
        }
        if (envelope.event === "bridge.state-change") {
          const payload = envelope.payload as { state?: BridgeState };
          if (payload?.state) {
            setBridgeState(payload.state);
          }
          return;
        }
        if (
          envelope.event?.startsWith("execution.") ||
          envelope.event === "approval.pending" ||
          envelope.event === "approval.updated"
        ) {
          if (refreshTimerRef.current !== null) {
            window.clearTimeout(refreshTimerRef.current);
          }
          refreshTimerRef.current = window.setTimeout(() => {
            loadExecutions().catch((err) => setError((err as Error).message));
          }, 250);
        }
      } catch (err) {
        console.error("解析事件失败", err);
      }
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);
    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("message", handleMessage);
      socket.close();
      socketRef.current = null;
    };
  }, [loadExecutions, socketSeed]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const pendingApprovals = useMemo(() => extractPending(executions), [executions]);
  const pendingNodeIdsFromExecutions = useMemo(() => {
    const nodes = new Set<string>();
    pendingApprovals.forEach((entry) => nodes.add(entry.nodeId));
    return nodes;
  }, [pendingApprovals]);
  const parsedPlan = useMemo<PlanJson | null>(() => {
    if (!planInput.trim()) {
      return null;
    }
    try {
      const candidate = JSON.parse(planInput) as PlanJson;
      if (!candidate || typeof candidate !== "object") {
        return null;
      }
      return candidate;
    } catch {
      return null;
    }
  }, [planInput]);

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
  const runtimePlanId = runtimeSnapshot.planId;
  const runtimeCurrentNodeId = runtimeSnapshot.currentNodeId;
  const runtimeCompletedNodeIds = runtimeSnapshot.completedNodeIds;
  const runtimePendingNodeIds = runtimeSnapshot.pendingNodeIds;
  const runtimeExecutionStatus = runtimeSnapshot.executionStatus;
  const matchingRuntimePlan =
    parsedPlanId !== null && runtimePlanId !== null && runtimePlanId === parsedPlanId;

  const planCanvasPendingNodeIds = useMemo(() => {
    const nodes = new Set<string>(pendingNodeIdsFromExecutions);
    if (matchingRuntimePlan) {
      runtimePendingNodeIds.forEach((id) => nodes.add(id));
    }
    return nodes;
  }, [pendingNodeIdsFromExecutions, runtimePendingNodeIds, matchingRuntimePlan]);

  const actionsDisabled = bridgeState !== "connected";

  const handleReconnect = useCallback(() => {
    setSocketSeed((seed) => seed + 1);
  }, []);

  const handleRefreshClick = useCallback(() => {
    loadExecutions().catch((err) => setError((err as Error).message));
  }, [loadExecutions]);

  const handleStopExecution = useCallback(
    async (executionId: string) => {
      setStopProcessingId(executionId);
      try {
        await stopExecution(executionId);
        await loadExecutions();
      } catch (err) {
        setError((err as Error).message ?? "停止执行失败");
      } finally {
        setStopProcessingId(null);
      }
    },
    [loadExecutions]
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
    if (!selectedServer) {
      setPlanError("未检测到可用的 MCP 服务器，请先选择配置后再执行。");
      setPlanWarnings([]);
      setPlanMessage(null);
      return;
    }
    setPlanBusy(true);
    try {
      const result = await executePlan(parsed, selectedServer);
      setPlanMessage(`已提交执行：${result.planId}（状态 ${result.status}）`);
      setPlanError(null);
      setPlanWarnings([]);
      await loadExecutions();
    } catch (err) {
      setPlanError((err as Error).message ?? "执行计划失败");
      setPlanMessage(null);
    } finally {
      setPlanBusy(false);
    }
  }, [planInput, loadExecutions, selectedServer]);

  const handleApprovalCommentChange = useCallback((id: string, value: string) => {
    setApprovalComments((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleApprovalDecision = useCallback(
    async (id: string, decision: "approved" | "rejected") => {
      setApprovalProcessing(id);
      try {
        await submitApprovalDecision(id, decision, approvalComments[id]);
        setApprovalComments((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        await loadExecutions();
      } catch (err) {
        setError((err as Error).message ?? "审批操作失败");
      } finally {
        setApprovalProcessing(null);
      }
    },
    [approvalComments, loadExecutions]
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

  return (
    <PluginRuntimeProvider
      options={{
        availableEvents: ["runtime:state-change", "runtime.tool-stream"],
        availableMcpTools: [],
        bridge: mcpBridge
      }}
      onRuntimeReady={(runtime) => {
        pluginRuntimeRef.current = runtime;
      }}
    >
      <div className="container mx-auto flex flex-col gap-6 p-6">
        <div className="card bg-base-300/70 shadow-xl">
          <div className="card-body space-y-2">
            <h1 className="card-title text-2xl font-semibold">hush-ops 控制面板</h1>
            <p className="text-sm text-base-content/70">
              实时监控混合编排执行状态，断线时自动进入只读模式。
            </p>
            {error && (
              <div className="alert alert-error text-sm">
                <span>错误：{error}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <section className="space-y-6">
            <PlanActions
              planValue={planInput}
              onPlanChange={handlePlanChange}
              onDryRun={handleDryRun}
              onExecute={handleExecute}
              serverOptions={mcpServers}
              selectedServer={selectedServer}
              onServerChange={setSelectedServer}
              serverError={mcpServerError}
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
              bridgeState={bridgeState}
              pendingNodeIds={planCanvasPendingNodeIds}
              currentNodeId={matchingRuntimePlan ? runtimeCurrentNodeId : null}
              completedNodeIds={matchingRuntimePlan ? runtimeCompletedNodeIds : undefined}
              executionStatus={matchingRuntimePlan ? runtimeExecutionStatus : undefined}
              selectedNodeId={selectedPlanNodeId}
              onSelectNode={setSelectedPlanNodeId}
              onUpdateNodePositions={handleUpdatePlanNodePositions}
            />
          </section>

          <aside className="space-y-6">
            <BridgeStatus state={bridgeState} onReconnect={handleReconnect} reconnectDisabled={bridgeState === "connecting"} />
            <PendingApprovals
              entries={pendingApprovals}
              disabled={actionsDisabled}
              commentMap={approvalComments}
              onCommentChange={handleApprovalCommentChange}
              onApprove={handleApprove}
              onReject={handleReject}
              processingId={approvalProcessing}
              onFocusNode={handleFocusApprovalNode}
            />
            <ExecutionList
              executions={executions}
              loading={loading}
              onRefresh={handleRefreshClick}
              onStop={actionsDisabled ? undefined : handleStopClick}
              disabled={actionsDisabled}
              stopProcessingId={stopProcessingId}
            />
            <PluginSidePanels />
          </aside>
        </div>
      </div>
    </PluginRuntimeProvider>
  );
}
