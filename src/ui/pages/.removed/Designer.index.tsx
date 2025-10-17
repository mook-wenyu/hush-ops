import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow } from "reactflow";
import "reactflow/dist/style.css";
import { fetchPlans, fsRead, fsWrite, type PlanSummary } from "../../services/orchestratorApi";
import { PlansSidebar } from "./sidebar/Plans";
import { NodesSidebar } from "./sidebar/Nodes";
import { Inspector } from "./Inspector";
import { RHFInspector } from "./Inspector/RHFInspector";
import { useAutoDryRun } from "./hooks/useAutoDryRun";
import { applyElkLayout } from "./Canvas/Layout";
import { perfFlowProps } from "./Canvas/Performance";
import { useDesignerHotkeys } from "./hooks/useDesignerHotkeys";
import { savePlanOrThrow, savePlanAsOrThrow, exportPlanToText, importPlanFromText, triggerDownload } from "./actions/save";

function DesignerInner() {
  const rf = useReactFlow();
  // 简易成环检测：判断添加边(source->target)后是否可从 target 回到 source
  const wouldCreateCycle = (nodes: any[], edges: any[], source: string, target: string): boolean => {
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      const list = adj.get(e.source) ?? [];
      list.push(e.target);
      adj.set(e.source, list);
    }
    // 加上待连线
    adj.set(source, [...(adj.get(source) ?? []), target]);
    // DFS from target to see if reaches source
    const seen = new Set<string>();
    const stack = [target];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === source) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const nxt of adj.get(cur) ?? []) stack.push(nxt);
    }
    return false;
  };
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Array<{ severity: string; message: string; nodeId?: string; edgeId?: string }>>([]);

  useEffect(() => { void fetchPlans().then(setPlans).catch(()=>setPlans([])); }, []);

  // 自动 dry-run：编辑后去抖触发（默认 400ms），返回诊断/模拟状态
  const onDryRun = useAutoDryRun({
    graph,
    onDiagnostics: (list) => setDiagnostics(list ?? []),
    onTimeline: () => void 0
  });

  // 保存：先编译与校验（有 error 级诊断则阻断），再写盘（以 Plan 为准，同时保留 graph 以便再次打开）
  const handleSave = async () => {
    if (!activePlanId) return;
    try {
      await savePlanOrThrow({ planId: activePlanId, graph });
      alert("已保存");
    } catch (e) {
      alert(`保存失败：${(e as Error).message}`);
    }
  };

  const handleSaveAs = async () => {
    const newId = prompt("另存为 Plan ID：", activePlanId ?? "");
    if (!newId) return;
    try { await savePlanAsOrThrow({ planId: activePlanId ?? newId, graph }, newId); alert("已另存"); }
    catch (e) { alert(`另存失败：${(e as Error).message}`); }
  };

  const handleExport = () => {
    const pid = activePlanId ?? `export-${Date.now()}`;
    const text = exportPlanToText({ planId: pid, graph });
    triggerDownload(`${pid}.json`, text);
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      const text = await f.text();
      try {
        const ctx = await importPlanFromText(text);
        setActivePlanId(ctx.planId);
        setGraph(ctx.graph);
        alert(`已导入：${ctx.planId}`);
      } catch (e) { alert(`导入失败：${(e as Error).message}`); }
    };
    input.click();
  };

  // 一键布局
  const handleLayout = async () => {
    const laid = await applyElkLayout(graph);
    setGraph(laid);
    try { rf.fitView?.(); } catch {}
  };

  // 快捷键绑定
  useDesignerHotkeys({ save: handleSave, layout: handleLayout, resetView: ()=>{ try { rf.fitView?.(); } catch {} } });

  return (
    <div className="grid grid-cols-12 gap-3">
      {/* 左：计划列表 / 节点库 */}
      <aside className="col-span-3 space-y-3">
        <div className="tabs tabs-bordered">
          <a className="tab tab-active">Plans</a>
          <a className="tab">Nodes</a>
        </div>
        <PlansSidebar plans={plans} onOpen={async (id) => {
          setActivePlanId(id);
          try {
            const text = await fsRead("plansConfig", `${id}.json`);
            const json = JSON.parse(text);
            // 兼容：若已有 graph 字段，直接使用；否则给出空图
            const g = (json && json.graph && typeof json.graph === 'object') ? json.graph : { nodes: [], edges: [] };
            setGraph(g);
          } catch {
            setGraph({ nodes: [], edges: [] });
          }
        }} />
        <NodesSidebar onAddNode={(node) => {
          setGraph((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
          onDryRun();
        }} />
      </aside>

      {/* 中：React Flow 画布 */}
      <section className="col-span-6 h-[70vh] rounded-lg border border-base-content/10">
        <ReactFlow
          nodes={graph.nodes as any}
          edges={graph.edges as any}
          {...(perfFlowProps as any)}
          onNodeClick={(_, node)=>{ setSelectedNodeId(node.id); }}
          onNodesChange={(changes)=>{
            setGraph((prev)=>({ ...prev, nodes: (prev.nodes as any).map((n: any)=>{
              const change = (changes as any[]).find((c)=>c.id===n.id);
              return change && change.position ? { ...n, position: change.position } : n;
            }) }));
            onDryRun();
          }}
          onConnect={(params)=>{
            const { source, target } = params as any;
            if (!source || !target) return;
            if (wouldCreateCycle(graph.nodes, graph.edges, source, target)) {
              // 简单提示：避免依赖外部 toast
              console.warn('检测到成环，已阻止连线');
              return;
            }
            setGraph((prev)=> ({ ...prev, edges: [...prev.edges, { id: `${source}-${target}-${Date.now()}`, source, target }] }));
            onDryRun();
          }}
          onEdgesChange={()=>{ onDryRun(); }}
          fitView>
          <MiniMap />
          <Controls />
          <Background gap={12} size={1} />
        </ReactFlow>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-sm" role="button" aria-label="保存当前计划 (Ctrl+S)" onClick={handleSave}>保存</button>
          <button className="btn btn-sm" role="button" aria-label="另存为新计划" onClick={handleSaveAs}>另存为</button>
          <button className="btn btn-sm" role="button" aria-label="导出计划为JSON" onClick={handleExport}>导出</button>
          <button className="btn btn-sm" role="button" aria-label="从JSON导入计划" onClick={handleImport}>导入</button>
          <button className="btn btn-sm" role="button" aria-label="一键布局图形 (Ctrl+L)" onClick={handleLayout}>一键布局</button>
          <button className="btn btn-sm" role="button" aria-label="重置视图 (Ctrl+0)" onClick={()=>{ try { rf.fitView?.(); } catch {} }}>重置视图</button>
          {activePlanId && <span className="text-xs opacity-70">当前：{activePlanId}</span>}
        </div>
      </section>

      {/* 右：属性面板 + 诊断 */}
      <aside className="col-span-3 space-y-3">
        <div>
          <RHFInspector
            node={graph.nodes.find((n:any)=> n.id===selectedNodeId) ?? null}
            onChange={(patch)=> {
              setGraph((prev)=> ({
                ...prev,
                nodes: prev.nodes.map((n:any)=> n.id===selectedNodeId ? { ...n, ...patch } : n)
              }));
              onDryRun();
            }}
          />
        </div>
        <div className="card bg-base-200/50">
          <div className="card-body p-3">
            <h3 className="font-semibold text-sm">诊断</h3>
            <ul className="mt-2 space-y-1 max-h-60 overflow-auto">
              {diagnostics.length === 0 && <li className="text-xs opacity-60">无错误</li>}
              {diagnostics.map((d, i)=> (
                <li key={i} className={`text-xs ${d.severity==='error'?'text-error':'text-warning'}`}>{d.message}</li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function DesignerPage() {
  return (
    <ReactFlowProvider>
      <DesignerInner />
    </ReactFlowProvider>
  );
}
