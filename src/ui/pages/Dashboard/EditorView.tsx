import React, { useCallback, useEffect, useRef, useState } from "react";
import { PanelGroup, Panel } from "react-resizable-panels";
import type { XYPosition } from "@xyflow/react";

import GraphCanvasShell from "../../features/graph/GraphCanvasShell";
import { buildPlanGraph, type PlanJson, type PlanNodeJson, type PlanNodePositionUpdate } from "../../components/graph/PlanCanvas";
import { executePlan, type McpServerSummary } from "../../services";
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
    mcpError: _mcpError,
    bridgeState,
    pendingNodeIds,
    runtimeSnapshot: _runtimeSnapshot,
    onPlanInputChange,
    onSelectedNodeChange,
    onServerChange,
    onPlansError,
    onRefreshPlans,
    onRefreshExecutions,
  } = props;

  const [plan, setPlan] = useState<PlanJson | null>(null);
  const [_warnings, setWarnings] = useState<string[]>([]);
  const [_message, setMessage] = useState<string | null>(null);
  const [_error, setError] = useState<string | null>(null);
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
                .map((e: any) => {
                  const base: any = { source: String(e?.source || ''), target: String(e?.target || '') };
                  if (typeof e?.id === 'string' && e.id) base.id = e.id;
                  return base;
                })
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
          // 删除“自动 dry-run 完成”提示，保持静默
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
              .map((e: any) => {
                const base: any = { source: String(e?.source || ''), target: String(e?.target || '') };
                if (typeof e?.id === 'string' && e.id) base.id = e.id;
                return base;
              })
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

  // 已不再使用的手动 dry-run，改由自动 dry-run 与执行按钮触发
  /* const onDryRun = useCallback(async () => {
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

  */

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
      // 1) 解析当前 plan，并构造当前位置索引（幂等过滤，避免无意义写回）
      const obj = planInput.trim() ? (JSON.parse(planInput) as PlanJson) : null;
      if (!obj || !Array.isArray(obj.nodes)) return;

      const index = new Map<string, { x?: number; y?: number }>();
      for (const n of obj.nodes) {
        const pos = n?.ui?.position;
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
          index.set(n.id, { x: pos.x, y: pos.y });
        }
      }

      const filtered: PlanNodePositionUpdate[] = [];
      for (const u of updates) {
        const cur = index.get(u.id);
        if (!cur) { filtered.push(u); continue; }
        // 与 PlanCanvas 中一致：坐标精度按 0.01 归一；完全相等才视为“未变”
        const same = cur.x === u.position.x && cur.y === u.position.y;
        if (!same) filtered.push(u);
      }
      if (filtered.length === 0) return; // 没有实际变化，直接返回，打断环路

      // 2) 仅当字符串确实发生变化时才写回，避免 setState 同值导致不必要渲染
      const nextInput = updatePlanInputWithNodePositions(planInput, filtered);
      if (nextInput !== planInput) {
        onPlanInputChange(nextInput);
      }
    } catch {
      // 忽略解析错误
    }
  }, [planInput, onPlanInputChange]);

  // 计划变更
  const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });

  const withParsedPlan = useCallback((mutator: (p: PlanJson) => void) => {
    try {
      const obj = planInput.trim() ? (JSON.parse(planInput) as PlanJson) : { id: `plan-${Date.now()}`, nodes: [] };
      if (!Array.isArray(obj.nodes)) obj.nodes = [];
      // 记录历史用于撤销/重做
      historyRef.current.past.push(planInput);
      historyRef.current.future = [];
      mutator(obj);
      onPlanInputChange(JSON.stringify(obj, null, 2));
    } catch {
      const obj: PlanJson = { id: `plan-${Date.now()}`, nodes: [] };
      historyRef.current.past.push(planInput);
      historyRef.current.future = [];
      mutator(obj);
      onPlanInputChange(JSON.stringify(obj, null, 2));
    }
  }, [planInput, onPlanInputChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        // 撤销
        const prev = historyRef.current.past.pop();
        if (prev != null) {
          e.preventDefault();
          historyRef.current.future.push(planInput);
          onPlanInputChange(prev);
        }
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        // 重做
        const next = historyRef.current.future.pop();
        if (next != null) {
          e.preventDefault();
          historyRef.current.past.push(planInput);
          onPlanInputChange(next);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [planInput, onPlanInputChange]);

  const onCreateNode = useCallback((opts: { connectFrom?: string | null; position?: XYPosition }) => {
    const baseId = `n${Date.now().toString(36)}`;
    withParsedPlan((p) => {
      const existing = new Set((p.nodes ?? []).map((n) => n.id));
      let id = baseId;
      let i = 1;
      while (existing.has(id)) {
        id = `${baseId}-${i++}`;
      }
      const newNode: PlanJson["nodes"] extends (infer T)[] ? (T & any) : any = { id, label: id, children: [], ui: opts.position ? { position: { x: Math.round((opts.position.x ?? 0) * 100) / 100, y: Math.round((opts.position.y ?? 0) * 100) / 100 } } : undefined };
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
      if (p.entry === nodeId) {
        const nextEntry = p.nodes[0]?.id;
        if (typeof nextEntry === 'string' && nextEntry) {
          p.entry = nextEntry;
        } else {
          delete (p as { entry?: string }).entry;
        }
      }
      if (selectedNodeId === nodeId) onSelectedNodeChange(null);
    });
  }, [selectedNodeId, withParsedPlan, onSelectedNodeChange]);

  const onConnectEdge = useCallback((source: string, target: string) => {
    withParsedPlan((p) => {
      const src = p.nodes?.find((n) => n.id === source);
      const tgtExists = p.nodes?.some((n) => n.id === target);
      if (!src || !tgtExists) return;
      // 若采用 v3 edges，则优先写入 edges；否则回退 children
      if (Array.isArray(p.edges)) {
        const key = `${source}->${target}`;
        const exists = p.edges.some((e) => (e.id ? e.id === key : (e.source === source && e.target === target)));
        if (!exists) p.edges.push({ id: key, source, target });
      } else {
        src.children = Array.isArray(src.children) ? src.children : [];
        if (!src.children.includes(target)) src.children.push(target);
      }
    });
  }, [withParsedPlan]);

  const onDeleteEdge = useCallback((source: string, target: string) => {
    withParsedPlan((p) => {
      if (Array.isArray(p.edges) && p.edges.length > 0) {
        p.edges = p.edges.filter((e) => !(e.source === source && e.target === target));
      } else if (Array.isArray(p.nodes)) {
        const src = p.nodes.find((n) => n.id === source);
        if (src && Array.isArray(src.children)) {
          src.children = src.children.filter((c) => c !== target);
        }
      }
    });
  }, [withParsedPlan]);

  const onCleanupOrphanedNodes = useCallback(() => {
    if (!plan) return;
    const graph = buildPlanGraph(plan);
    if (!graph || graph.orphanNodes.length === 0) {
      alert('没有未连接的节点需要清理');
      return;
    }
    const nodeNames = graph.orphanNodes.map(n => n.label || n.type || n.id).join(', ');
    const confirmed = window.confirm(
      `确定要删除 ${graph.orphanNodes.length} 个未连接节点吗？\n\n${nodeNames}`
    );
    if (confirmed) {
      withParsedPlan((p) => {
        const idsToDelete = new Set(graph.orphanNodes.map(n => n.id));
        p.nodes = p.nodes?.filter(n => !idsToDelete.has(n.id)) || [];
        if (selectedNodeId && idsToDelete.has(selectedNodeId)) {
          onSelectedNodeChange(null);
        }
      });
    }
  }, [plan, withParsedPlan, selectedNodeId, onSelectedNodeChange]);

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

      {/* 编辑器工具栏：MCP 服务器 + 执行 */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2">
        <label className="form-control w-full max-w-sm">
          <div className="label"><span className="label-text text-xs">MCP 服务器</span></div>
          <select
            className="select select-bordered select-sm"
            value={selectedServer ?? ""}
            onChange={(e)=> onServerChange(e.target.value || null)}
            disabled={busy || servers.length === 0}
            aria-label="MCP 服务器"
          >
            {servers.length === 0 ? (
              <option value="">无可用配置</option>
            ) : (
              servers.map((s)=> (
                <option key={s.name} value={s.name}>{s.description ? `${s.name} · ${s.description}` : s.name}</option>
              ))
            )}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={onExecute} disabled={busy || !selectedServer}>
            {busy ? "执行中…" : "执行计划"}
          </button>
        </div>
      </div>

      {/* 画布与检查器 - 占据剩余空间 */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal">
          {/* 画布 */}
          <Panel id="canvas" order={1} defaultSize={100} minSize={60}>
            <div className="h-full overflow-hidden">
              <GraphCanvasShell
                plan={plan}
                bridgeState={bridgeState}
                pendingNodeIds={pendingNodeIds}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectedNodeChange}
                onUpdateNodePositions={onUpdatePositions}
                onCreateNode={onCreateNode}
                onDeleteNode={onDeleteNode}
                onConnectEdge={onConnectEdge}
                onDeleteEdge={onDeleteEdge}
                onCleanupOrphanedNodes={onCleanupOrphanedNodes}
                onUpdateNode={onUpdateNode}
                editable={!busy}
                diagnostics={compileDiagnostics}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
