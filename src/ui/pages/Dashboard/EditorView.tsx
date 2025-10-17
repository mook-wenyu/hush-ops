import React, { useCallback, useEffect, useRef, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { PlanActions } from "../../components/PlanActions";
import InspectorCore from "../../features/inspector/InspectorCore";
import GraphCanvasShell from "../../features/graph/GraphCanvasShell";
import { type PlanJson, type PlanNodeJson, type PlanNodePositionUpdate } from "../../components/graph/PlanCanvas";
import { dryRunPlan, executePlan, type McpServerSummary } from "../../services";
import { updatePlanInputWithNodePositions } from "../../utils/planTransforms";
import type { BridgeState } from "../../types/orchestrator";

export interface EditorViewProps {
  planInput: string;
  selectedNodeId: string | null;
  servers: readonly McpServerSummary[];
  selectedServer: string | null;
  mcpError: string | null;
  bridgeState: BridgeState;
  pendingNodeIds: ReadonlySet<string>;
  runtimeSnapshot: any;
  onPlanInputChange: (value: string) => void;
  onSelectedNodeChange: (id: string | null) => void;
  onServerChange: (name: string | null) => void;
  onPlansError: (error: string | null) => void;
  onRefreshPlans: () => Promise<void>;
  onRefreshExecutions: () => Promise<void>;
}

export default function EditorView(props: EditorViewProps) {
  const {
    planInput,
    selectedNodeId,
    servers,
    selectedServer,
    mcpError,
    bridgeState,
    pendingNodeIds,
    runtimeSnapshot,
    onPlanInputChange,
    onSelectedNodeChange,
    onServerChange,
    onPlansError,
    onRefreshPlans,
    onRefreshExecutions,
  } = props;

  const [plan, setPlan] = useState<PlanJson | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compileDiagnostics, setCompileDiagnostics] = useState<Array<{ severity: string; message: string; nodeId?: string; edgeId?: string }>>([]);

  // Designer 设置：自动 dry‑run 与去抖间隔
  const settingsRef = useRef<{ enabled: boolean; delay: number }>({ enabled: true, delay: 400 });
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('designer:autoDryRun');
        const rawDelay = localStorage.getItem('designer:autoDryRunDelay');
        settingsRef.current.enabled = raw == null ? true : raw === '1';
        const d = Number(rawDelay);
        settingsRef.current.delay = Number.isFinite(d) ? Math.min(800, Math.max(200, d || 400)) : 400;
      } catch {}
    };
    load();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      if (detail && typeof detail === 'object') {
        if ('autoDryRun' in detail) settingsRef.current.enabled = !!detail.autoDryRun;
        if ('delay' in detail) settingsRef.current.delay = Math.min(800, Math.max(200, Number(detail.delay) || 400));
      } else {
        load();
      }
    };
    window.addEventListener('designer:settings-changed', onChange as EventListener);
    return () => window.removeEventListener('designer:settings-changed', onChange as EventListener);
  }, []);

  // 自动 dry‑run 与 compile 请求合流 token
  const dryRunTokenRef = useRef(0);
  const compileTokenRef = useRef(0);
  const compileCacheRef = useRef<Map<string, { diagnostics?: Array<{ severity: string; message: string; nodeId?: string; edgeId?: string }> }>>(new Map());

  // 解析 planInput → plan
  useEffect(() => {
    if (!planInput.trim()) {
      setPlan(null);
      return;
    }
    try {
      setPlan(JSON.parse(planInput) as PlanJson);
    } catch {
      setPlan(null);
    }
  }, [planInput]);

  // 自动保存（去抖）
  useEffect(() => {
    if (!planInput.trim()) return;
    let cancelled = false;
    const compileAc = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const obj = JSON.parse(planInput);
        if (!obj || typeof obj !== 'object') return;

        // 1) 编译校验（带缓存复用）
        try {
          const { compileGraph, simulateDryRun } = await import('../../services');
          const graph = (() => {
            const nodes = Array.isArray((obj as any).nodes) ? (obj as any).nodes.map((n: any) => ({ id: String(n?.id || '') })) : [];
            let edges: Array<{ id?: string; source: string; target: string }> = [];
            if (Array.isArray((obj as any).edges)) {
              edges = (obj as any).edges
                .map((e: any) => ({ id: e?.id, source: String(e?.source || ''), target: String(e?.target || '') }))
                .filter((e: any) => e.source && e.target);
            } else {
              for (const n of (Array.isArray((obj as any).nodes) ? (obj as any).nodes : [])) {
                const from = String(n?.id || '');
                if (!from) continue;
                const children: string[] = Array.isArray(n?.children) ? n.children.map((c: any) => String(c)) : [];
                for (const to of children) {
                  if (to) edges.push({ source: from, target: to });
                }
              }
            }
            return { nodes, edges };
          })();

          const cached = compileCacheRef.current.get(planInput);
          let cr = cached;
          if (!cached) {
            cr = await compileGraph(graph, { signal: compileAc.signal });
            compileCacheRef.current.set(planInput, cr as any);
          }
          const diagnostics = (cr as any)?.diagnostics ?? [];
          const hasError = diagnostics.some((d: any) => (d?.severity || '').toLowerCase() === 'error');
          if (hasError) {
            if (!cancelled) onPlansError(
              `保存已取消：编译失败 — ` +
              (diagnostics.filter((d: any) => (d.severity || '').toLowerCase() === 'error').map((d: any) => d.nodeId ? `${d.message} (node: ${d.nodeId})` : d.message).join('; ') || '未知错误')
            );
            return;
          }

          // 2) 预校验 dry-run
          await simulateDryRun(obj, { signal: compileAc.signal });
        } catch (err) {
          if (!cancelled) {
            const msg = (err as any)?.name === 'AbortError' ? '操作已取消' : ((err as Error).message ?? '未知错误');
            onPlansError(`保存已取消：编译/校验失败 — ${msg}`);
          }
          return;
        }

        // 3) 保存
        const { createPlan, updatePlan } = await import('../../services');
        if (!('id' in obj) || typeof (obj as any).id !== 'string' || !(obj as any).id.trim()) {
          const res = await createPlan(obj);
          if (cancelled) return;
          (obj as any).id = res.id;
          onPlanInputChange(JSON.stringify(obj, null, 2));
        } else {
          await updatePlan((obj as any).id, obj);
        }
        await onRefreshPlans();
      } catch (e) {
        if (!cancelled) onPlansError((e as Error).message ?? '保存失败');
      }
    }, 1500);
    return () => {
      cancelled = true;
      compileAc.abort();
      clearTimeout(timer);
    };
  }, [planInput, onPlanInputChange, onPlansError, onRefreshPlans]);

  // 自动 dry-run
  useEffect(() => {
    if (!settingsRef.current.enabled) return;
    if (!planInput.trim()) return;
    let cancelled = false;
    const ac = new AbortController();
    const token = ++dryRunTokenRef.current;
    const delay = settingsRef.current.delay;
    const timer = setTimeout(async () => {
      try {
        const obj = JSON.parse(planInput);
        if (!obj || typeof obj !== 'object') return;
        const { simulateDryRun } = await import('../../services');
        const res = await simulateDryRun(obj, { signal: ac.signal });
        if (!cancelled && token === dryRunTokenRef.current) {
          setWarnings(res.warnings ?? []);
          setMessage(`自动 dry-run 完成`);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && token === dryRunTokenRef.current) {
          if ((e as any)?.name !== 'AbortError') {
            setError((e as Error).message ?? '自动 dry-run 失败');
            setWarnings([]);
          }
        }
      }
    }, delay);
    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, [planInput]);

  // 自动 compile（错误高亮）
  useEffect(() => {
    if (!planInput.trim()) {
      setCompileDiagnostics([]);
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    const token = ++compileTokenRef.current;
    let delay = Math.min(800, Math.max(200, settingsRef.current.delay || 400));
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.vitest) {
      delay = 0;
    }
    const timer = setTimeout(async () => {
      try {
        const obj = JSON.parse(planInput);
        if (!obj || typeof obj !== 'object') return;
        const { compileGraph } = await import('../../services');
        const graph = (() => {
          const nodes = Array.isArray((obj as any).nodes) ? (obj as any).nodes.map((n: any) => ({ id: String(n?.id || '') })) : [];
          let edges: Array<{ id?: string; source: string; target: string }> = [];
          if (Array.isArray((obj as any).edges)) {
            edges = (obj as any).edges
              .map((e: any) => ({ id: e?.id, source: String(e?.source || ''), target: String(e?.target || '') }))
              .filter((e: any) => e.source && e.target);
          } else {
            for (const n of (Array.isArray((obj as any).nodes) ? (obj as any).nodes : [])) {
              const from = String(n?.id || '');
              if (!from) continue;
              const children: string[] = Array.isArray(n?.children) ? n.children.map((c: any) => String(c)) : [];
              for (const to of children) {
                if (to) edges.push({ source: from, target: to });
              }
            }
          }
          return { nodes, edges };
        })();
        const cr = await compileGraph(graph, { signal: ac.signal });
        compileCacheRef.current.set(planInput, cr as any);
        if (!cancelled && token === compileTokenRef.current) {
          setCompileDiagnostics(cr.diagnostics ?? []);
        }
      } catch (e) {
        if (!cancelled && token === compileTokenRef.current) {
          if ((e as any)?.name !== 'AbortError') setCompileDiagnostics([]);
        }
      }
    }, delay);
    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, [planInput]);

  // PlanActions 处理
  const onPlanChange = useCallback((value: string) => {
    onPlanInputChange(value);
    setMessage(null);
    setError(null);
  }, [onPlanInputChange]);

  const onDryRun = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(planInput);
    } catch (e) {
      setError(`Plan JSON 解析失败：${(e as Error).message}`);
      setWarnings([]);
      return;
    }
    setBusy(true);
    try {
      const r = await dryRunPlan(parsed);
      setWarnings(r.warnings ?? []);
      setMessage(`Plan ${r.planId ?? "unknown"} dry-run 完成`);
      setError(null);
    } catch (e) {
      setError((e as Error).message ?? "dry-run 失败");
      setWarnings([]);
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }, [planInput]);

  const onExecute = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(planInput);
    } catch (e) {
      setError(`Plan JSON 解析失败：${(e as Error).message}`);
      setWarnings([]);
      return;
    }
    if (!selectedServer) {
      setError("未选择 MCP 服务器");
      setWarnings([]);
      setMessage(null);
      return;
    }
    setBusy(true);
    try {
      const r = await executePlan(parsed, selectedServer);
      setMessage(`已提交执行：${r.planId}（状态 ${r.status}）`);
      setError(null);
      setWarnings([]);
      await onRefreshExecutions();
    } catch (e) {
      setError((e as Error).message ?? "执行计划失败");
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }, [planInput, selectedServer, onRefreshExecutions]);

  // 节点操作
  const onUpdateNode = useCallback((nodeId: string, updates: Partial<Omit<PlanNodeJson, "id">>) => {
    try {
      const obj = JSON.parse(planInput) as PlanJson;
      if (!Array.isArray(obj.nodes)) return;
      const idx = obj.nodes.findIndex((n) => n?.id === nodeId);
      if (idx === -1) return;
      const nextNodes = [...obj.nodes];
      nextNodes[idx] = { ...nextNodes[idx], ...updates, id: nextNodes[idx]?.id } as any;
      onPlanInputChange(JSON.stringify({ ...obj, nodes: nextNodes }, null, 2));
    } catch {
      // 忽略解析错误
    }
  }, [planInput, onPlanInputChange]);

  const onUpdatePositions = useCallback((updates: readonly PlanNodePositionUpdate[]) => {
    if (!updates.length) return;
    try {
      const nextInput = updatePlanInputWithNodePositions(planInput, updates);
      onPlanInputChange(nextInput);
    } catch {
      // 忽略解析错误
    }
  }, [planInput, onPlanInputChange]);

  // 计划变更
  const withParsedPlan = useCallback((mutator: (p: PlanJson) => void) => {
    try {
      const obj = planInput.trim() ? (JSON.parse(planInput) as PlanJson) : { id: `plan-${Date.now()}`, nodes: [] };
      if (!Array.isArray(obj.nodes)) obj.nodes = [];
      mutator(obj);
      onPlanInputChange(JSON.stringify(obj, null, 2));
    } catch {
      const obj: PlanJson = { id: `plan-${Date.now()}`, nodes: [] };
      mutator(obj);
      onPlanInputChange(JSON.stringify(obj, null, 2));
    }
  }, [planInput, onPlanInputChange]);

  const onCreateNode = useCallback((opts: { connectFrom?: string | null }) => {
    const baseId = `n${Date.now().toString(36)}`;
    withParsedPlan((p) => {
      const existing = new Set((p.nodes ?? []).map((n) => n.id));
      let id = baseId;
      let i = 1;
      while (existing.has(id)) {
        id = `${baseId}-${i++}`;
      }
      const newNode: PlanJson["nodes"] extends (infer T)[] ? (T & any) : any = { id, label: id, children: [] };
      p.nodes!.push(newNode);
      if (!p.entry) p.entry = id;
      const from = opts.connectFrom ?? null;
      if (from && existing.has(from)) {
        const src = p.nodes!.find((n) => n.id === from)!;
        src.children = Array.isArray(src.children) ? src.children : [];
        if (!src.children.includes(id)) src.children.push(id);
      }
    });
  }, [withParsedPlan]);

  const onDeleteNode = useCallback((nodeId: string) => {
    withParsedPlan((p) => {
      if (!Array.isArray(p.nodes)) return;
      p.nodes = p.nodes.filter((n) => n.id !== nodeId);
      p.nodes.forEach((n) => {
        if (Array.isArray(n.children)) n.children = n.children.filter((c) => c !== nodeId);
      });
      if (p.entry === nodeId) p.entry = p.nodes[0]?.id;
      if (selectedNodeId === nodeId) onSelectedNodeChange(null);
    });
  }, [selectedNodeId, withParsedPlan, onSelectedNodeChange]);

  const onConnectEdge = useCallback((source: string, target: string) => {
    withParsedPlan((p) => {
      const src = p.nodes?.find((n) => n.id === source);
      const tgtExists = p.nodes?.some((n) => n.id === target);
      if (!src || !tgtExists) return;
      src.children = Array.isArray(src.children) ? src.children : [];
      if (!src.children.includes(target)) src.children.push(target);
    });
  }, [withParsedPlan]);

  // 退出保护
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "您可能有未保存的更改。";
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* 顶部提示信息 - 固定高度 */}
      <div className="alert alert-info text-xs flex-shrink-0">
        <span>编辑模式已开启：可在画布与右侧面板直接编辑。</span>
      </div>

      {/* PlanActions 工具栏 - 固定高度 */}
      <div className="flex-shrink-0">
        <PlanActions
          planValue={planInput}
          onPlanChange={onPlanChange}
          onDryRun={onDryRun}
          onExecute={onExecute}
          serverOptions={servers}
          selectedServer={selectedServer}
          onServerChange={onServerChange}
          serverError={mcpError}
          warnings={warnings}
          message={message}
          busy={busy}
          disabled={false}
          error={error}
        />
      </div>

      {/* 画布与检查器 - 占据剩余空间 */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="editor-canvas-inspector-layout">
          {/* 画布 */}
          <Panel id="canvas" order={1} defaultSize={75} minSize={60}>
            <div className="h-full overflow-auto">
              <GraphCanvasShell
                plan={plan}
                bridgeState={bridgeState}
                pendingNodeIds={pendingNodeIds}
                currentNodeId={runtimeSnapshot?.currentNodeId ?? null}
                completedNodeIds={new Set(runtimeSnapshot?.completedNodeIds ?? [])}
                executionStatus={runtimeSnapshot?.executionStatus as any}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectedNodeChange}
                onUpdateNodePositions={onUpdatePositions}
                onCreateNode={onCreateNode}
                onDeleteNode={onDeleteNode}
                onConnectEdge={onConnectEdge}
                editable={true}
                diagnostics={compileDiagnostics}
              />
            </div>
          </Panel>

          <PanelResizeHandle className="w-3 bg-base-300/60 hover:bg-base-300 transition-colors cursor-col-resize" />

          {/* 右侧：节点详情 */}
          <Panel id="inspector" order={2} defaultSize={25} minSize={20} maxSize={40}>
            <div className="h-full overflow-auto">
              <InspectorCore
                plan={plan}
                selectedNodeId={selectedNodeId}
                disabled={false}
                onUpdateNode={onUpdateNode}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
