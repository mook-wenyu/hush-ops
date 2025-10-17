import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  useAppStoreFeatureFlag,
  useAppStoreSelector,
  selectExecutionsList,
  selectExecutionsLoading,
  selectExecutionsError,
  selectPendingApprovalsList,
  selectApprovalCommentDrafts,
  selectApprovalProcessingIds,
  appStore
} from "../../state/appStore";
import {
  fetchExecutions,
  stopExecution,
  submitApprovalDecision,
  fetchPlans,
  fetchPlanById,
  createPlan,
  deletePlan,
  uploadPlanFiles,
  fetchSchedules,
  type McpServerSummary,
  fetchMcpServers
} from "../../services";
import { type ScheduleItem } from "../../services";
import PlanListPanel from "../../features/plans/PlanListPanel";
import EditorView from "./EditorView";
import MonitorView from "./MonitorView";

export default function Dashboard() {
  const storeEnabled = useAppStoreFeatureFlag();
  return storeEnabled ? <DashboardWithStore /> : <DashboardNoStore />;
}

function DashboardWithStore() {
  const storeExecutions = useAppStoreSelector(selectExecutionsList);
  const storeLoading = useAppStoreSelector(selectExecutionsLoading);
  const storeError = useAppStoreSelector(selectExecutionsError);
  const storePendingApprovals = useAppStoreSelector(selectPendingApprovalsList);
  const storeDrafts = useAppStoreSelector(selectApprovalCommentDrafts);
  const storeProcessingIds = useAppStoreSelector(selectApprovalProcessingIds);
  const runtime = useAppStoreSelector((s) => s.runtime.snapshot);
  const bridgeState = useAppStoreSelector((s) => s.runtime.bridgeState);

  return (
    <DashboardCore
      storeEnabled={true}
      storeExecutions={storeExecutions}
      storeLoading={storeLoading}
      storeError={storeError}
      storePendingApprovals={storePendingApprovals}
      storeDrafts={storeDrafts}
      storeProcessingIds={storeProcessingIds}
      runtimeSnapshot={runtime}
      bridgeState={bridgeState}
    />
  );
}

function DashboardNoStore() {
  return (
    <DashboardCore
      storeEnabled={false}
      storeExecutions={[]}
      storeLoading={false}
      storeError={null}
      storePendingApprovals={[]}
      storeDrafts={{}}
      storeProcessingIds={[]}
      runtimeSnapshot={{ planId: null, executionStatus: "idle", running: false, currentNodeId: null, completedNodeIds: [], pendingNodeIds: [] }}
      bridgeState={"connecting" as any}
    />
  );
}

function DashboardCore({
  storeEnabled,
  storeExecutions,
  storeLoading,
  storeError,
  storePendingApprovals,
  storeDrafts,
  storeProcessingIds,
  runtimeSnapshot,
  bridgeState
}: {
  storeEnabled: boolean;
  storeExecutions: ReturnType<typeof selectExecutionsList>;
  storeLoading: boolean;
  storeError: string | null;
  storePendingApprovals: ReturnType<typeof selectPendingApprovalsList>;
  storeDrafts: Record<string, string>;
  storeProcessingIds: string[];
  runtimeSnapshot: ReturnType<typeof appStore.getState>["runtime"]["snapshot"];
  bridgeState: import("../../types/orchestrator").BridgeState;
}) {
  // 全局状态
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'monitor'>(() => {
    try {
      const v = localStorage.getItem('dashboard_active_tab');
      if (v === 'editor' || v === 'monitor') return v;
      const legacy = localStorage.getItem('dashboard_edit_mode');
      return legacy === '1' ? 'editor' : 'monitor';
    } catch {
      return 'monitor';
    }
  });

  // 计划管理
  const [plans, setPlans] = useState<{ id: string; description?: string; version?: string }[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [planInput, setPlanInput] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // MCP 服务器
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);

  // 调度摘要
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [stopProcessingId, setStopProcessingId] = useState<string | null>(null);

  // 初始化
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    try {
      localStorage.setItem('dashboard_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  // 加载初始数据
  useEffect(() => {
    let cancelled = false;

    // 加载示例计划
    fetch("/plans/demo-mixed.json")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { if (!cancelled) setPlanInput(text); })
      .catch(() => void 0);

    // 加载 MCP 服务器
    fetchMcpServers()
      .then((list) => {
        if (cancelled) return;
        setServers(list);
        const next = list[0]?.name ?? null;
        setSelectedServer(next);
        appStore.getState().hydrateMcpServers?.(list, Date.now());
        if (next) appStore.getState().selectMcpServer?.(next);
      })
      .catch((e) => setMcpError((e as Error).message ?? "获取 MCP 服务器配置失败"));

    // 加载计划列表
    setPlansLoading(true);
    fetchPlans()
      .then((list) => {
        if (!cancelled) {
          setPlans(list);
          setPlansError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setPlansError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });

    // 加载调度摘要
    fetchSchedules()
      .then((list) => { if (!cancelled) setSchedules(list); })
      .catch(() => void 0);

    return () => { cancelled = true; };
  }, []);

  // 列表刷新
  const refreshExecutions = useCallback(async () => {
    try {
      const list = await fetchExecutions();
      if (storeEnabled) appStore.getState().hydrateExecutions(list);
    } catch (e) {
      if (storeEnabled) appStore.getState().setExecutionsError((e as Error).message);
    }
  }, [storeEnabled]);

  const refreshPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const list = await fetchPlans();
      setPlans(list);
      setPlansError(null);
    } catch (e) {
      setPlansError((e as Error).message);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  // 停止执行
  const handleStop = useCallback(async (id: string) => {
    setStopProcessingId(id);
    try {
      await stopExecution(id);
      await refreshExecutions();
    } finally {
      setStopProcessingId(null);
    }
  }, [refreshExecutions]);

  // 审批操作
  const handleCommentChange = useCallback((id: string, value: string) => {
    appStore.getState().setApprovalCommentDraft(id, value);
  }, []);

  const handleApprove = useCallback(async (id: string) => {
    appStore.getState().setApprovalProcessing(id, true);
    const comment = appStore.getState().approvals.commentDrafts[id];
    try {
      await submitApprovalDecision(id, "approved", comment);
      appStore.getState().removePendingApproval(id);
    } finally {
      appStore.getState().setApprovalProcessing(id, false);
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    appStore.getState().setApprovalProcessing(id, true);
    const comment = appStore.getState().approvals.commentDrafts[id];
    try {
      await submitApprovalDecision(id, "rejected", comment);
      appStore.getState().removePendingApproval(id);
    } finally {
      appStore.getState().setApprovalProcessing(id, false);
    }
  }, []);

  // 计划操作
  const handlePlanOpen = useCallback(async (id: string) => {
    try {
      const data = await fetchPlanById(id);
      if (data) setPlanInput(JSON.stringify(data, null, 2));
    } catch (e) {
      setPlansError((e as Error).message);
    }
  }, []);

  const handlePlanCreate = useCallback(async () => {
    try {
      const blank: any = { nodes: [] };
      const res = await createPlan(blank);
      const created = { id: res.id, nodes: [] } as any;
      setPlanInput(JSON.stringify(created, null, 2));
      await refreshPlans();
    } catch (e) {
      setPlansError((e as Error).message);
    }
  }, [refreshPlans]);

  const handlePlanDelete = useCallback(async () => {
    try {
      const obj = planInput.trim() ? JSON.parse(planInput) : null;
      const id = obj?.id ? String(obj.id) : null;
      if (!id) {
        setPlanInput('');
        return;
      }
      await deletePlan(id);
      setPlanInput('');
      setSelectedNodeId(null);
      await refreshPlans();
    } catch (e) {
      setPlansError((e as Error).message);
    }
  }, [planInput, refreshPlans]);

  const handlePlanUpload = useCallback(async (files: File[]) => {
    try {
      await uploadPlanFiles(files);
      await refreshPlans();
    } catch (err) {
      setPlansError((err as Error).message ?? '上传计划失败');
    }
  }, [refreshPlans]);

  const handleImportExamples = useCallback(async () => {
    try {
      const { fetchExamplePlans, importExamplePlan } = await import('../../services');
      const examples = await fetchExamplePlans();
      for (const ex of examples) {
        await importExamplePlan(ex.name);
      }
      await refreshPlans();
    } catch (e) {
      setPlansError((e as Error).message ?? '导入示例失败');
    }
  }, [refreshPlans]);

  // 运行态融合
  const pendingNodeIds = useMemo(() => {
    const set = new Set<string>();
    (storePendingApprovals ?? []).forEach((a) => { if (a.nodeId) set.add(a.nodeId); });
    (runtimeSnapshot?.pendingNodeIds ?? []).forEach((id) => set.add(id));
    return set;
  }, [storePendingApprovals, runtimeSnapshot?.pendingNodeIds]);

  if (!mounted) return null;

  return (
    <div className="space-y-4">
      {storeError && (
        <div className="alert alert-error text-sm">
          <span>{storeError}</span>
        </div>
      )}

      {/* 顶部：调度摘要卡片 + 模式切换 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="stat bg-base-200/60 border border-base-content/10">
          <div className="stat-title">调度总数</div>
          <div className="stat-value text-lg">{schedules.length}</div>
          <div className="stat-desc text-xs">来源：repo/config</div>
        </div>
        <div className="stat bg-base-200/60 border border-base-content/10">
          <div className="stat-title">最近一次执行</div>
          <div className="stat-value text-lg">{(() => {
            const sorted = schedules
              .map(s => s.lastRun?.finishedAt || s.lastRun?.startedAt)
              .filter(Boolean) as string[];
            return sorted.length ? sorted.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] : '-';
          })()}</div>
          <div className="stat-desc text-xs">点击 Schedules 查看详情</div>
        </div>
        <div className="stat bg-base-200/60 border border-base-content/10">
          <div className="stat-title">工作模式</div>
          <div className="stat-value text-lg">
            <div className="join">
              <button
                className={"btn btn-xs join-item " + (activeTab === 'editor' ? "btn-primary" : "btn-ghost")}
                onClick={() => setActiveTab('editor')}
                title="切换到编辑器"
              >
                编辑器
              </button>
              <button
                className={"btn btn-xs join-item " + (activeTab === 'monitor' ? "btn-primary" : "btn-ghost")}
                onClick={() => setActiveTab('monitor')}
                title="切换到监控"
              >
                监控
              </button>
            </div>
          </div>
          <div className="stat-desc text-xs">编辑器已并入 Dashboard</div>
        </div>
      </div>

      {/* 主面板区域 */}
      <PanelGroup
        direction="horizontal"
        autoSaveId="dashboard-main-layout"
        className="min-h-[70vh] rounded-lg border border-base-300/50 bg-base-100/60"
      >
        {/* 左侧：计划列表 - 使用统一组件 */}
        <Panel defaultSize={22} minSize={18} maxSize={30} order={1} id="plan-list-panel" className="p-3 overflow-auto">
          <PlanListPanel
            plans={plans}
            loading={plansLoading}
            error={plansError}
            onImportExamples={handleImportExamples}
            onUpload={handlePlanUpload}
            onOpen={handlePlanOpen}
          />
        </Panel>

        <PanelResizeHandle
          className="w-3 bg-base-300/60 hover:bg-base-300 transition-colors cursor-col-resize"
          style={{ touchAction: 'none' }}
        />

        {/* 右侧：编辑器或监控视图 */}
        <Panel defaultSize={78} minSize={70} order={2} id="main-content-panel" className="overflow-hidden">
          {activeTab === 'editor' ? (
            <EditorView
              planInput={planInput}
              selectedNodeId={selectedNodeId}
              servers={servers}
              selectedServer={selectedServer}
              mcpError={mcpError}
              bridgeState={bridgeState}
              pendingNodeIds={pendingNodeIds}
              runtimeSnapshot={runtimeSnapshot}
              onPlanInputChange={setPlanInput}
              onSelectedNodeChange={setSelectedNodeId}
              onServerChange={setSelectedServer}
              onPlansError={setPlansError}
              onRefreshPlans={refreshPlans}
              onRefreshExecutions={refreshExecutions}
            />
          ) : (
            <MonitorView
              executions={storeExecutions}
              execLoading={storeLoading}
              stopProcessingId={stopProcessingId}
              approvals={storePendingApprovals}
              commentMap={storeDrafts}
              processingId={storeProcessingIds[0] ?? null}
              onRefresh={refreshExecutions}
              onStop={handleStop}
              onCommentChange={handleCommentChange}
              onApprove={handleApprove}
              onReject={handleReject}
              onFocusNode={setSelectedNodeId}
            />
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
}
