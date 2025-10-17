import { memo, useCallback, useMemo, useRef, useState } from "react";

import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  applyNodeChanges,
  type NodeChange,
  type Node as FlowNode,
  type NodeProps,
  type XYPosition,
  type OnConnectStartParams,
  ReactFlowProvider
} from "reactflow";

import {
  type ExecutionVisualizationStatus,
  type PlanNodeEvent,
  type PlanNodeState
} from "../../visualizationTypes";
import type { BridgeState } from "../../types/orchestrator";

import "reactflow/dist/style.css";

export interface PlanNodeJson {
  id: string;
  type?: string;
  children?: string[];
  riskLevel?: string;
  requiresApproval?: boolean;
  effectScope?: string;
  label?: string;
  description?: string;
  ui?: PlanNodeUI | null;
}

export interface PlanJson {
  id?: string;
  version?: string;
  entry?: string;
  nodes?: PlanNodeJson[];
  // v3: 显式边定义（优先于 children 推断）
  edges?: Array<{ id?: string; source: string; target: string }>;
  description?: string;
}

export interface DiagnosticsItem { severity: string; message: string; nodeId?: string; edgeId?: string }

interface PlanCanvasProps {
  readonly plan: PlanJson | null;
  readonly bridgeState: BridgeState;
  readonly pendingNodeIds: ReadonlySet<string>;
  readonly currentNodeId?: string | null;
  readonly completedNodeIds?: ReadonlySet<string>;
  readonly executionStatus?: ExecutionVisualizationStatus;
  readonly selectedNodeId?: string | null;
  readonly onSelectNode?: (nodeId: string | null) => void;
  readonly onUpdateNodePositions?: (updates: readonly PlanNodePositionUpdate[]) => void;
  readonly onCreateNode?: (opts: { connectFrom?: string | null }) => void;
  readonly onDeleteNode?: (nodeId: string) => void;
  readonly onConnectEdge?: (source: string, target: string) => void;
  readonly editable?: boolean; // 只读/编辑开关（默认 true）
  readonly onlyRenderVisibleElements?: boolean; // 仅渲染可视区域（默认 true）
  readonly diagnostics?: DiagnosticsItem[]; // 编译/校验诊断（用于错误高亮）
}

interface PlanGraph {
  readonly planId?: string;
  readonly planVersion?: string;
  readonly entryId?: string;
  readonly levels: PlanNodeJson[][];
  readonly orphanNodes: PlanNodeJson[];
  readonly edges: Array<{ id?: string; source: string; target: string }>;
}

interface PlanNodeData {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly riskLevel?: string;
  readonly pending: boolean;
  readonly state: PlanNodeState;
  readonly description?: string;
  readonly events: readonly PlanNodeEvent[];
  readonly selected: boolean;
  readonly diagErrorCount?: number;
  readonly diagWarnCount?: number;
  readonly diagFirstMessage?: string;
}

export interface PlanNodePositionUpdate {
  readonly id: string;
  readonly position: XYPosition;
}

export interface PlanNodeUI {
  readonly position?: XYPosition;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 130;
const HORIZONTAL_GAP = 320;
const VERTICAL_GAP = 170;
// const EMPTY_NODE_EVENTS: ReadonlyMap<string, readonly PlanNodeEvent[]> = new Map();

const EXECUTION_STATUS_LABELS: Record<ExecutionVisualizationStatus, string> = {
  idle: "空闲",
  pending: "排队中",
  running: "执行中",
  success: "成功",
  failed: "失败",
  cancelled: "已取消"
};

// bridge state badge helper (unused)

function getNodeLabel(node: PlanNodeJson): string {
  if (node.label) {
    return node.label;
  }
  if (node.type) {
    return node.type;
  }
  return "节点";
}

function getNodeSubtitle(node: PlanNodeJson): string | undefined {
  if (node.type === "local_task" && node.effectScope) {
    return `作用域：${node.effectScope}`;
  }
  if (node.requiresApproval) {
    return "需要审批";
  }
  if (node.riskLevel) {
    return `风险：${node.riskLevel}`;
  }
  return undefined;
}

export function buildPlanGraph(plan: PlanJson | null): PlanGraph | null {
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    return null;
  }

  const entryId = plan.entry ?? plan.nodes[0]?.id;
  if (!entryId) {
    return null;
  }

  const nodeMap = new Map<string, PlanNodeJson>();
  plan.nodes.forEach((node) => {
    if (node?.id) {
      nodeMap.set(node.id, node);
    }
  });

  if (!nodeMap.has(entryId)) {
    return null;
  }

  // v3: 若存在显式 edges，则以 edges 构建邻接表；否则回退 children 推断
  const useEdges = Array.isArray(plan.edges) && plan.edges.length > 0;
  const adjacency = new Map<string, string[]>();
  if (useEdges) {
    for (const nodeId of nodeMap.keys()) adjacency.set(nodeId, []);
    for (const e of plan.edges!) {
      const src = e.source;
      const tgt = e.target;
      if (!nodeMap.has(src) || !nodeMap.has(tgt)) continue;
      const arr = adjacency.get(src)!;
      arr.push(tgt);
    }
  }

  const visited = new Set<string>();
  const levels: PlanNodeJson[][] = [];
  let frontier: string[] = [entryId];

  while (frontier.length > 0) {
    const nextFrontier = new Set<string>();
    const levelNodes: PlanNodeJson[] = [];

    for (const nodeId of frontier) {
      if (visited.has(nodeId)) continue;
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      visited.add(nodeId);
      levelNodes.push(node);
      const successors = useEdges
        ? adjacency.get(nodeId) ?? []
        : Array.isArray(node.children)
          ? node.children.filter((c): c is string => typeof c === "string")
          : [];
      for (const childId of successors) {
        if (!visited.has(childId)) nextFrontier.add(childId);
      }
    }

    if (levelNodes.length > 0) levels.push(levelNodes);
    if (nextFrontier.size === 0) break;
    frontier = Array.from(nextFrontier);
  }

  const orphanNodes = plan.nodes.filter((node) => !visited.has(node.id));
  const edges: Array<{ id?: string; source: string; target: string }> = [];
  if (useEdges) {
    for (const e of plan.edges!) {
      edges.push({ id: e.id, source: e.source, target: e.target });
    }
  } else {
    levels.forEach((level) => {
      for (const node of level) {
        if (Array.isArray(node.children)) {
          for (const childId of node.children) {
            edges.push({ source: node.id, target: childId });
          }
        }
      }
    });
  }

  return {
    planId: plan.id,
    planVersion: plan.version,
    entryId,
    levels,
    orphanNodes,
    edges
  };
}

function createFlowElements(
  graph: PlanGraph,
  options: {
    pendingNodeIds: ReadonlySet<string>;
    activeNodeId?: string | null;
    completedNodeIds?: ReadonlySet<string>;
    nodeEvents?: ReadonlyMap<string, readonly PlanNodeEvent[]>;
    selectedNodeId?: string | null;
    editable?: boolean;
    diagMap?: ReadonlyMap<string, { errors: number; warns: number; first?: string }>
  }
): { nodes: FlowNode<PlanNodeData>[]; edges: Edge[] } {
  const { pendingNodeIds, activeNodeId, completedNodeIds, nodeEvents, selectedNodeId, diagMap } = options;
  const nodes: FlowNode<PlanNodeData>[] = [];
  const edges: Edge[] = [];

  graph.levels.forEach((level, levelIndex) => {
    level.forEach((node, nodeIndex) => {
      const isPending = pendingNodeIds.has(node.id);
      const isActive = activeNodeId != null && node.id === activeNodeId;
      const isCompleted = completedNodeIds?.has(node.id) ?? false;
      const isSelected = selectedNodeId != null && node.id === selectedNodeId;
      const events = nodeEvents?.get(node.id) ?? [];

      const stats = diagMap?.get(node.id) ?? { errors: 0, warns: 0, first: undefined };
      const data: PlanNodeData = {
        id: node.id,
        title: getNodeLabel(node),
        subtitle: getNodeSubtitle(node),
        riskLevel: node.riskLevel,
        pending: isPending,
        state: isActive ? "active" : isCompleted ? "completed" : "default",
        description: node.description ?? node.id,
        events,
        selected: isSelected,
        diagErrorCount: stats.errors,
        diagWarnCount: stats.warns,
        diagFirstMessage: stats.first
      };

      const storedPosition = node.ui?.position;
      const position: XYPosition =
        storedPosition && Number.isFinite(storedPosition.x) && Number.isFinite(storedPosition.y)
          ? { x: storedPosition.x, y: storedPosition.y }
          : {
              x: levelIndex * HORIZONTAL_GAP,
              y: nodeIndex * VERTICAL_GAP
            };

      nodes.push({
        id: node.id,
        type: "planNode",
        data,
        position,
        draggable: !!options.editable,
        connectable: false,
        selectable: true,
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
    });
  });

  if (graph.orphanNodes.length > 0) {
    const orphanLevel = graph.levels.length;
    graph.orphanNodes.forEach((node, index) => {
      const isPending = pendingNodeIds.has(node.id);
      const isActive = activeNodeId != null && node.id === activeNodeId;
      const isCompleted = completedNodeIds?.has(node.id) ?? false;
      const isSelected = selectedNodeId != null && node.id === selectedNodeId;
      const events = nodeEvents?.get(node.id) ?? [];

      const stats = diagMap?.get(node.id) ?? { errors: 0, warns: 0, first: undefined };
      const data: PlanNodeData = {
        id: node.id,
        title: getNodeLabel(node),
        subtitle: "未连接",
        pending: isPending,
        state: isActive ? "active" : isCompleted ? "completed" : "default",
        description: node.description ?? node.id,
        events,
        selected: isSelected,
        diagErrorCount: stats.errors,
        diagWarnCount: stats.warns,
        diagFirstMessage: stats.first
      };

      const storedPosition = node.ui?.position;
      const position: XYPosition =
        storedPosition && Number.isFinite(storedPosition.x) && Number.isFinite(storedPosition.y)
          ? { x: storedPosition.x, y: storedPosition.y }
          : {
              x: orphanLevel * HORIZONTAL_GAP,
              y: index * VERTICAL_GAP
            };

      nodes.push({
        id: node.id,
        type: "planNode",
        data,
        position,
        draggable: !!options.editable,
        connectable: false,
        selectable: true,
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
    });
  }

  graph.edges.forEach((edge) => {
    const isTargetActive = activeNodeId != null && edge.target === activeNodeId;
    const isTargetCompleted = completedNodeIds?.has(edge.target) ?? false;
    edges.push({
      id: edge.id ?? `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      animated: isTargetActive,
      style: {
        stroke: isTargetActive
          ? "var(--color-brand)"
          : isTargetCompleted
            ? "var(--color-brand-accent)"
            : "rgba(148, 163, 184, 0.45)",
        strokeWidth: isTargetActive ? 3 : isTargetCompleted ? 2.4 : 1.6
      }
    });
  });

  return { nodes, edges };
}

import styles from "./PlanCanvas.module.css";
import { IconPlus, IconTrash, IconLink, IconZoomReset } from "@tabler/icons-react";
import { applyElkLayout } from "../../features/graph/Layout";

const PlanNode = memo(({ data }: NodeProps<PlanNodeData>) => {
  const classes = [styles.planNode, "card bg-base-200/80 border-base-content/10 shadow-lg px-4 py-3 space-y-2 transition-colors duration-200"];
  if (data.pending) {
    classes.push(styles.pending);
  }
  if (data.state === "active") {
    classes.push(styles.active);
  }
  if (data.state === "completed") {
    classes.push(styles.completed);
  }
  if (data.selected) {
    classes.push(styles.selected);
  }

  return (
    <article className={classes.join(" ")} title={data.description ?? data.id} data-node-id={data.id}>
      <header className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-base-content/60">
        <span>{data.id}</span>
        <div className="inline-flex items-center gap-1">
          {typeof data.diagWarnCount === 'number' && data.diagWarnCount > 0 && (
            <span className="badge badge-warning badge-xs" title={data.diagFirstMessage ?? '存在告警'}>{data.diagWarnCount}</span>
          )}
          {typeof data.diagErrorCount === 'number' && data.diagErrorCount > 0 && (
            <span className="badge badge-error badge-xs" title={data.diagFirstMessage ?? '存在错误'}>{data.diagErrorCount}</span>
          )}
          {data.riskLevel && <span className="badge badge-outline badge-error badge-xs">{data.riskLevel}</span>}
        </div>
      </header>
      <div className="text-base font-semibold text-base-content">{data.title}</div>
      {data.subtitle && <div className="text-sm text-base-content/70">{data.subtitle}</div>}
      {data.pending && <div className="badge badge-warning badge-sm">待审批</div>}
      <div className="text-xs text-base-content/60" data-node-overlay-id={data.id} />
    </article>
  );
});
PlanNode.displayName = "PlanNode";

export function PlanCanvas({
  plan,
  bridgeState: _bridgeState,
  pendingNodeIds,
  currentNodeId,
  completedNodeIds,
  executionStatus,
  selectedNodeId,
  onSelectNode,
  onUpdateNodePositions,
  onCreateNode,
  onDeleteNode,
  onConnectEdge,
  editable = true,
  onlyRenderVisibleElements = true,
  diagnostics
}: PlanCanvasProps) {
  const graph = useMemo(() => buildPlanGraph(plan), [plan]);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);

  // 必须在 early return 之前调用所有 hooks，避免 Hooks 顺序变化
  const diagMap = useMemo(() => {
    const map = new Map<string, { errors: number; warns: number; first?: string }>();
    (diagnostics ?? []).forEach((d) => {
      if (!d || !d.nodeId) return;
      const key = String(d.nodeId);
      const prev = map.get(key) ?? { errors: 0, warns: 0, first: undefined };
      const sev = String(d.severity || '').toLowerCase();
      if (sev === 'error') prev.errors += 1; else if (sev === 'warning' || sev === 'warn') prev.warns += 1;
      if (!prev.first) prev.first = d.message;
      map.set(key, prev);
    });
    return map;
  }, [diagnostics]);

  const edgeDiagMap = useMemo(() => {
    const map = new Map<string, { errors: number; warns: number; first?: string }>();
    (diagnostics ?? []).forEach((d) => {
      if (!d || !d.edgeId) return;
      const key = String(d.edgeId);
      const prev = map.get(key) ?? { errors: 0, warns: 0, first: undefined };
      const sev = String(d.severity || '').toLowerCase();
      if (sev === 'error') prev.errors += 1; else if (sev === 'warning' || sev === 'warn') prev.warns += 1;
      if (!prev.first) prev.first = d.message;
      map.set(key, prev);
    });
    return map;
  }, [diagnostics]);

  // 连接模式与视图控制（必须在 early return 之前）
  const flowInstanceRef = useRef<import("reactflow").ReactFlowInstance | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // 所有其他 hooks 也必须在 early return 之前
  const { nodes, edges } = useMemo(
    () =>
      graph ? createFlowElements(graph, {
        pendingNodeIds,
        activeNodeId: currentNodeId,
        completedNodeIds,
        selectedNodeId,
        editable,
        diagMap
      }) : { nodes: [], edges: [] },
    [graph, pendingNodeIds, currentNodeId, completedNodeIds, selectedNodeId, editable, diagMap]
  );

  const edgesWithDiag = useMemo(() => {
    if (edgeDiagMap.size === 0) return edges;
    return edges.map((e) => {
      const stats = edgeDiagMap.get(e.id);
      if (!stats) return e;
      const stroke = stats.errors > 0 ? '#ef4444' : stats.warns > 0 ? '#d97706' : (e.style as any)?.stroke;
      const strokeWidth = stats.errors > 0 ? 3 : stats.warns > 0 ? 2.4 : (e.style as any)?.strokeWidth;
      return { ...e, style: { ...(e.style ?? {}), stroke, strokeWidth } } as Edge;
    });
  }, [edges, edgeDiagMap]);

  const nodeTypes = useMemo(() => ({ planNode: PlanNode }), []);
  const nodeCount = (graph?.levels.reduce((sum, level) => sum + level.length, 0) ?? 0) + (graph?.orphanNodes.length ?? 0);
  const statusLabel = executionStatus ? EXECUTION_STATUS_LABELS[executionStatus] : null;

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!onUpdateNodePositions) return;
      const updated = applyNodeChanges(changes, nodes);
      const posAfter = new Map(updated.map((n) => [n.id, n.position] as const));
      const updates: PlanNodePositionUpdate[] = [];
      for (const change of changes) {
        if (change.type === "position" && !change.dragging) {
          const p = posAfter.get(change.id);
          if (p) updates.push({ id: change.id, position: p });
        }
      }
      if (updates.length > 0) onUpdateNodePositions(updates);
    },
    [onUpdateNodePositions, nodes]
  );

  const selectByIndex = useCallback(
    (indexDelta: number) => {
      const ids = nodes.map((n) => n.id);
      if (ids.length === 0) return;
      const currentIndex = selectedNodeId ? ids.indexOf(selectedNodeId) : -1;
      const nextIndex = (currentIndex + indexDelta + ids.length) % ids.length;
      const nextId = ids[nextIndex] ?? null;
      onSelectNode?.(nextId);
      if (liveRef.current && nextId) {
        liveRef.current.textContent = `已选择节点 ${nextId}`;
      }
      const el = document.querySelector<HTMLElement>(`[data-node-id="${nextId}"]`);
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [nodes, onSelectNode, selectedNodeId]
  );

  const moveSelected = useCallback(
    (dx: number, dy: number) => {
      if (!onUpdateNodePositions || !selectedNodeId) return;
      const cur = nodes.find((n) => n.id === selectedNodeId);
      if (!cur) return;
      const { x, y } = cur.position;
      onUpdateNodePositions([{ id: selectedNodeId, position: { x: x + dx, y: y + dy } }]);
    },
    [nodes, onUpdateNodePositions, selectedNodeId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const STEP = e.shiftKey ? 24 : 8;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelected(0, -STEP);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelected(0, STEP);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelected(-STEP, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelected(STEP, 0);
      } else if (e.key === "]") {
        e.preventDefault();
        selectByIndex(1);
      } else if (e.key === "[") {
        e.preventDefault();
        selectByIndex(-1);
      }
    },
    [moveSelected, selectByIndex]
  );

  if (!graph) {
    return (
      <div className="card bg-base-300/70 shadow-xl">
        <div className="card-body space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="card-title text-lg">Plan 画布</h2>
              <div className="text-sm text-base-content/70">当前没有可视化数据。请在上方粘贴 Plan JSON 或从 Registry 选择计划。</div>
            </div>
            {/* 状态徽章已移除，避免干扰空态 UI */}
          </div>

          {/* 非拖拽替代：仅在可编辑时展示占位 toolbar */}
          {editable && (
          <div role="toolbar" aria-label="节点编辑工具" className="flex flex-wrap items-center gap-2">
            <div className="sr-only" aria-live="polite">
              使用方向键微移选中节点；按 [ 与 ] 在节点间切换；按 Shift+方向键快速移动。
            </div>
            <div className="sr-only" aria-live="polite" />

            <button type="button" className="btn btn-outline btn-xs" aria-label="上移" disabled>
              ↑
            </button>
            <div className="inline-flex gap-1">
              <button type="button" className="btn btn-outline btn-xs" aria-label="左移" disabled>
                ←
              </button>
              <button type="button" className="btn btn-outline btn-xs" aria-label="右移" disabled>
                →
              </button>
            </div>
            <button type="button" className="btn btn-outline btn-xs" aria-label="下移" disabled>
              ↓
            </button>
            {/* 与正式画布一致的占位操作，便于测试用例与 a11y 一致性 */}
            <button type="button" className="btn btn-outline btn-xs" title="开始连线" disabled>
              连线
            </button>
          </div>
          )}

          {/* 可达的画布区域占位，满足 a11y region 要求（焦点不被遮挡由 tokens 控制）*/}
          <div
            className="h-[520px] rounded-2xl border border-base-content/10 bg-base-200/60"
            tabIndex={0}
            role="region"
            aria-label="计划画布区域"
          />
        </div>
      </div>
    );
  }

  // graph 不为 null 时使用前面已经声明的 hooks 计算的值
  return (
    <div className="card bg-base-300/70 shadow-xl">
      <div className="card-body space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="card-title text-lg">Plan 画布</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/70">
              <span>{graph.planId ?? "未命名计划"}</span>
              {graph.planVersion && <span>· 版本 {graph.planVersion}</span>}
              {statusLabel && <span className="badge badge-outline badge-secondary badge-sm">{statusLabel}</span>}
            </div>
          </div>

        </div>

        {/* 非拖拽替代：键盘与按钮微移（toolbar）。后续将接入 useReactFlow 新增/删除节点、连边与视图重置 */}
        {editable && (
        <div role="toolbar" aria-label="节点编辑工具" className="flex flex-wrap items-center gap-2">
          <div className="sr-only" aria-live="polite">
            使用方向键微移选中节点；按 [ 与 ] 在节点间切换；按 Shift+方向键快速移动。
          </div>
          <div ref={liveRef} className="sr-only" aria-live="polite" />

          {/* 计划编辑 */}
          <button
            type="button"
            className="btn btn-outline btn-xs"
            title="新增节点"
            onClick={() => onCreateNode?.({ connectFrom: selectedNodeId ?? null })}
          >
            <IconPlus size={16} className="mr-1" /> 新增
          </button>
          <button
            type="button"
            className="btn btn-outline btn-error btn-xs"
            title="删除选中节点"
            disabled={!selectedNodeId}
            onClick={() => selectedNodeId && onDeleteNode?.(selectedNodeId)}
          >
            <IconTrash size={16} className="mr-1" /> 删除
          </button>
          <button
            type="button"
            className={`btn btn-outline btn-xs ${connectMode ? "btn-active" : ""}`}
            title={connectMode ? "退出连线模式" : "开始连线"}
            onClick={() => setConnectMode((v) => !v)}
          >
            <IconLink size={16} className="mr-1" /> {connectMode ? "连线中…" : "连线"}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-xs"
            title="自动布局 (ELK)"
            onClick={async () => {
              // 依据当前可视 nodes/edges 计算布局，并批量回写位置
              try {
                const result = await applyElkLayout({
                  nodes: nodes.map((n) => ({ id: n.id, position: n.position })),
                  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
                }, { useWorker: true });
                const updates = result.nodes.map((n: any) => ({ id: n.id, position: n.position }));
                onUpdateNodePositions?.(updates);
                flowInstanceRef.current?.fitView({ padding: 0.2 });
              } catch {}
            }}
          >
            <IconZoomReset size={16} className="mr-1" /> 布局
          </button>

          <button
            type="button"
            className="btn btn-outline btn-xs"
            title="重置视图"
            onClick={() => flowInstanceRef.current?.fitView({ padding: 0.2 })}
          >
            <IconZoomReset size={16} className="mr-1" /> 重置
          </button>
        </div>
        )}

        <ReactFlowProvider>
          <div
            ref={paneRef}
            className="h-[520px] rounded-2xl border border-base-content/10 bg-base-200/60"
            tabIndex={0}
            role="region"
            aria-label="计划画布区域"
            onKeyDown={handleKeyDown}
          >
            <ReactFlow
              nodes={nodes}
              edges={edgesWithDiag}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2, minZoom: 0.3, maxZoom: 1.5 }}
              onlyRenderVisibleElements={onlyRenderVisibleElements !== false}
              nodesConnectable={editable && connectMode}
              isValidConnection={(conn) => {
                if (!editable) return false;
                if (!conn.source || !conn.target) return false;
                if (conn.source === conn.target) return false;
                const key = `${conn.source}->${conn.target}`;
                return !edges.some((e) => e.id === key);
              }}
              onConnectStart={(_, params: OnConnectStartParams) => {
                setConnectingFrom(params?.nodeId ?? null);
              }}
              onConnectEnd={(event) => {
                const target = event.target as HTMLElement | null;
                const endedOnPane = !!target && target.classList.contains('react-flow__pane');
                if (endedOnPane) {
                  onCreateNode?.({ connectFrom: connectingFrom ?? selectedNodeId ?? null });
                }
                setConnectingFrom(null);
                setConnectMode(false);
              }}
              onConnect={(conn) => {
                if (conn.source && conn.target) {
                  onConnectEdge?.(conn.source, conn.target);
                }
                setConnectMode(false);
              }}
              onInit={(inst) => { flowInstanceRef.current = inst; }}
              panOnDrag
              zoomOnScroll
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, node) => {
                onSelectNode?.(node?.id ?? null);
                const el = document.querySelector<HTMLElement>(`[data-node-id="${node?.id}"]`);
                el?.scrollIntoView({ block: "nearest", inline: "nearest" });
                if (liveRef.current && node?.id) {
                  liveRef.current.textContent = `已选择节点 ${node.id}`;
                }
              }}
              onPaneClick={() => onSelectNode?.(null)}
              onNodesChange={handleNodesChange}
            >
              <MiniMap pannable zoomable nodeStrokeColor="#5eff9d" nodeColor="#20242c" maskColor="rgba(24,26,34,0.55)" />
              <Controls showInteractive={false} />
              <Background gap={24} color="rgba(92,102,122,0.15)" />
            </ReactFlow>
          </div>
        </ReactFlowProvider>

        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-base-content/70">
          <span>入口节点：{graph.entryId ?? "未知"}</span>
          <span>节点总数：{nodeCount}</span>
          <span>待审批节点：{pendingNodeIds.size}</span>
        </footer>
      </div>
    </div>
  );
}
