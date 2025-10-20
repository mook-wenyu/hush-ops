import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  MiniMap,
  type Node as FlowNode,
  type NodeProps,
  type XYPosition,
  type OnConnectStartParams,
  type Connection,
  ReactFlowProvider,
  useOnSelectionChange,
  useOnViewportChange,
  reconnectEdge,
  MarkerType
} from "@xyflow/react";

import {
  type ExecutionVisualizationStatus,
  type PlanNodeEvent,
  type PlanNodeState
} from "../../visualizationTypes";
import type { BridgeState } from "../../types/orchestrator";
import { cardClasses } from "../../utils/classNames";
import { PlanNodeEditDrawer } from "../PlanNodeEditDrawer";
import { NodeTypeSelector } from "../NodeTypeSelector";

import "@xyflow/react/dist/style.css";

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
  edges?: Array<{ id?: string; source: string; target: string; type?: "straight"|"bezier"|"step"|"smoothstep" }>;
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
  /** 创建新节点回调，支持指定节点类型（type）、连接源（connectFrom）和位置（position） */
  readonly onCreateNode?: (opts: { connectFrom?: string | null; position?: XYPosition; type?: string }) => void;
  readonly onDeleteNode?: (nodeId: string) => void;
  readonly onConnectEdge?: (source: string, target: string) => void;
  readonly onDeleteEdge?: (source: string, target: string) => void;
  readonly onUpdateNode?: (nodeId: string, patch: Partial<Omit<PlanNodeJson, 'id'>>) => void;
  readonly onCleanupOrphanedNodes?: () => void;
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

interface PlanNodeData extends Record<string, unknown> {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly riskLevel?: string;
  readonly requiresApproval?: boolean;
  readonly nodeType?: string;
  readonly pending: boolean;
  readonly state: PlanNodeState;
  readonly description?: string;
  readonly events: readonly PlanNodeEvent[];
  readonly selected: boolean;
  readonly diagErrorCount?: number;
  readonly diagWarnCount?: number;
  readonly diagFirstMessage?: string;
  readonly isEntry?: boolean;
  readonly isTerminal?: boolean;
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
      if (e.id) {
        edges.push({ id: e.id, source: e.source, target: e.target });
      } else {
        edges.push({ source: e.source, target: e.target });
      }
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

  const graph: any = {
    entryId,
    levels,
    orphanNodes,
    edges
  };
  if (plan.id) graph.planId = plan.id;
  if (plan.version) graph.planVersion = plan.version;
  return graph as PlanGraph;
}

export function willCreateCycle(graph: PlanGraph, source: string, target: string): boolean {
  const adj = new Map<string, string[]>();
  const nodesSet = new Set<string>();
  graph.levels.flat().forEach(n=> nodesSet.add(n.id));
  graph.orphanNodes.forEach(n=> nodesSet.add(n.id));
  nodesSet.forEach(id=> adj.set(id, []));
  graph.edges.forEach(e=> (adj.get(e.source) || []).push(e.target));
  // DFS: target ->* source ?
  const stack = [target]; const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const next = adj.get(cur) || [];
    for (const x of next) stack.push(x);
  }
  return false;
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
  const outDegree = new Map<string, number>();
  graph.edges.forEach((e) => outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1));

  graph.levels.forEach((level, levelIndex) => {
    level.forEach((node, nodeIndex) => {
      const isPending = pendingNodeIds.has(node.id);
      const isActive = activeNodeId != null && node.id === activeNodeId;
      const isCompleted = completedNodeIds?.has(node.id) ?? false;
      const isSelected = selectedNodeId != null && node.id === selectedNodeId;
      const events = nodeEvents?.get(node.id) ?? [];

      const stats = diagMap?.get(node.id) ?? { errors: 0, warns: 0 };
      const data: any = {
        id: node.id,
        title: getNodeLabel(node),
        pending: isPending,
        state: isActive ? "active" : isCompleted ? "completed" : "default",
        description: node.description ?? node.id,
        events,
        selected: isSelected,
        diagErrorCount: stats.errors,
        diagWarnCount: stats.warns,
        isEntry: node.id === graph.entryId,
        isTerminal: (outDegree.get(node.id) ?? 0) === 0,
        requiresApproval: node.requiresApproval,
        nodeType: node.type
      };
      const sub = getNodeSubtitle(node);
      if (sub) data.subtitle = sub;
      if (node.riskLevel) data.riskLevel = node.riskLevel;
      if ((stats as any).first) data.diagFirstMessage = (stats as any).first as string;
      const dataTyped = data as PlanNodeData;

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
        data: dataTyped,
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

      const stats = diagMap?.get(node.id) ?? { errors: 0, warns: 0 };
      const data: any = {
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
        isEntry: node.id === graph.entryId,
        isTerminal: (outDegree.get(node.id) ?? 0) === 0
      };
      if ((stats as any).first) data.diagFirstMessage = (stats as any).first as string;
      const dataTyped = data as PlanNodeData;

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
        data: dataTyped,
        position,
        draggable: !!options.editable,
        connectable: false,
        selectable: true,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        className: "orphaned"
      });
    });
  }

  graph.edges.forEach((edge) => {
    const isTargetActive = activeNodeId != null && edge.target === activeNodeId;
    const isTargetCompleted = completedNodeIds?.has(edge.target) ?? false;
    const id = edge.id ?? `${edge.source}->${edge.target}`;
    edges.push({
      id,
      source: edge.source,
      target: edge.target,
      type: (edge as any).type as any,
      animated: isTargetActive,
      selectable: true,  // 显式设置边缘可选中
      deletable: true,   // 显式设置边缘可删除
      style: {
        stroke: isTargetActive
          ? "#8b5cf6"
          : isTargetCompleted
            ? "#10b981"
            : "#9ca3af",
        strokeWidth: isTargetActive ? 3 : isTargetCompleted ? 2.4 : 1.6
      }
    });
  });

  return { nodes, edges };
}

import styles from "./PlanCanvas.module.css";
import { IconPlus, IconTrash, IconLink, IconZoomReset } from "@tabler/icons-react";
import { applyElkLayout } from "../../features/graph/Layout";
import { Handle, Position } from "@xyflow/react";
import { createContext, useContext } from "react";

const NodeEditCtx = createContext<{
  onUpdateNode: ((id: string, patch: Partial<Omit<PlanNodeJson,'id'>>) => void) | undefined;
  onEditNode: ((id: string) => void) | undefined;
  editable: boolean;
  connectMode: boolean;
}>({ editable: true, onUpdateNode: undefined, onEditNode: undefined, connectMode: false });

const PlanNode = memo(({ data }: NodeProps<FlowNode<PlanNodeData>>) => {
  const classes = [styles.planNode, "card bg-base-200 border-base-content/10 shadow-lg px-4 py-3 space-y-2 transition-colors duration-200"];
  const { onEditNode, editable, connectMode } = useContext(NodeEditCtx);

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
  if (connectMode) {
    classes.push(styles.connectMode);
  }

  return (
    <article className={classes.join(" ")} title={data.description ?? data.id} data-node-id={data.id}>
      {/* 连接句柄：左侧 target / 右侧 source */}
      <Handle
        id={`${data.id}-target`}
        type="target"
        position={Position.Left}
        isConnectable={editable}
        title={connectMode ? '拖拽到空白处创建新节点' : undefined}
      />
      <Handle
        id={`${data.id}-source`}
        type="source"
        position={Position.Right}
        isConnectable={editable}
        title={connectMode ? '拖拽到空白处创建新节点' : undefined}
      />

      <header className="rf-drag flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-base-content/60">
        <span className="inline-flex items-center gap-2">
          {data.isEntry && <span className="badge badge-success badge-xs" title="起点">起点</span>}
          {data.isTerminal && <span className="badge badge-info badge-xs" title="终点">终点</span>}
          <span className="opacity-70">{data.id}</span>
        </span>
        <div className="inline-flex items-center gap-1">
          {typeof data.diagWarnCount === 'number' && data.diagWarnCount > 0 && (
            <span className="badge badge-warning badge-xs" title={data.diagFirstMessage ?? '存在告警'}>{data.diagWarnCount}</span>
          )}
          {typeof data.diagErrorCount === 'number' && data.diagErrorCount > 0 && (
            <span className="badge badge-error badge-xs" title={data.diagFirstMessage ?? '存在错误'}>{data.diagErrorCount}</span>
          )}
          {data.riskLevel && <span className="badge badge-outline badge-error badge-xs">{data.riskLevel}</span>}
          {editable && (
            <button
              type="button"
              className="btn btn-ghost btn-xs nodrag nowheel"
              onClick={() => onEditNode?.(data.id)}
              aria-label="编辑节点"
            >
              编辑
            </button>
          )}
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
  onDeleteEdge,
  onCleanupOrphanedNodes,
  onUpdateNode,
  editable = true,
  onlyRenderVisibleElements,
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
      const prev = map.get(key) ?? { errors: 0, warns: 0 };
      const sev = String(d.severity || '').toLowerCase();
      if (sev === 'error') prev.errors += 1; else if (sev === 'warning' || sev === 'warn') prev.warns += 1;
      if (!('first' in prev) || !prev.first) (prev as any).first = d.message;
      map.set(key, prev as { errors: number; warns: number; first?: string });
    });
    return map;
  }, [diagnostics]);

  const edgeDiagMap = useMemo(() => {
    const map = new Map<string, { errors: number; warns: number; first?: string }>();
    (diagnostics ?? []).forEach((d) => {
      if (!d || !d.edgeId) return;
      const key = String(d.edgeId);
      const prev = map.get(key) ?? { errors: 0, warns: 0 };
      const sev = String(d.severity || '').toLowerCase();
      if (sev === 'error') prev.errors += 1; else if (sev === 'warning' || sev === 'warn') prev.warns += 1;
      if (!('first' in prev) || !prev.first) (prev as any).first = d.message;
      map.set(key, prev as { errors: number; warns: number; first?: string });
    });
    return map;
  }, [diagnostics]);

  // 连接模式与视图控制（必须在 early return 之前）
  const flowInstanceRef = useRef<import("@xyflow/react").ReactFlowInstance<FlowNode<PlanNodeData>, Edge> | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Array<{ id: string; source: string; target: string }>>([]);

  // 用户偏好状态管理
  const [autoCreateEnabled, setAutoCreateEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('plancanvas_auto_create');
      return stored !== '0';
    } catch {
      return true;
    }
  });

  const [showGuide, setShowGuide] = useState(() => {
    try {
      const seen = localStorage.getItem('plancanvas_guide_seen');
      return seen !== '1';
    } catch {
      return false;
    }
  });

  const [showNodeSelector, setShowNodeSelector] = useState(false);
  const [nodeSelectorPosition, setNodeSelectorPosition] = useState<{ x: number; y: number } | null>(null);

  // 持久化用户偏好到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('plancanvas_auto_create', autoCreateEnabled ? '1' : '0');
    } catch {
      // localStorage 不可用时静默失败
    }
  }, [autoCreateEnabled]);

  // 节点编辑抽屉状态
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const lastSelectionRef = useRef<{ edges: Array<{ id: string; source: string; target: string }>; nodes: string[] }>({ edges: [], nodes: [] });
  const isSameSelection = (a: any[], b: any[], key?: (x: any) => any) => {
    if (a.length !== b.length) return false;
    if (!key) {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    for (let i = 0; i < a.length; i++) if (key(a[i]) !== key(b[i])) return false;
    return true;
  };
  const [edgeType] = useState<"straight"|"bezier"|"step"|"smoothstep">("smoothstep");
  const [snapToGrid] = useState(true);
  // 使用 ref 管理对齐线，避免在拖拽中通过 setState 造成高频渲染/潜在循环
  const guideXRef = useRef<HTMLDivElement | null>(null);
  const guideYRef = useRef<HTMLDivElement | null>(null);

  // 所有其他 hooks 也必须在 early return 之前
  const { nodes, edges } = useMemo(
    () =>
      graph ? createFlowElements(graph, {
        pendingNodeIds,
        activeNodeId: currentNodeId ?? null,
        completedNodeIds: completedNodeIds ?? new Set<string>(),
        selectedNodeId: selectedNodeId ?? null,
        editable,
        diagMap
      }) : { nodes: [], edges: [] },
    [graph, pendingNodeIds, currentNodeId, completedNodeIds, selectedNodeId, editable, diagMap]
  );

  // 本地维护边缘选中状态（用于单击选中交互）
  const [edgeSelectionState, setEdgeSelectionState] = useState<Record<string, boolean>>({});

  const edgesWithDiag = useMemo(() => {
    const base = edges.map((e) => ({
      ...e,
      type: (e as any).type ?? edgeType,
      selected: edgeSelectionState[e.id] ?? false  // 注入选中状态
    } as Edge));
    if (edgeDiagMap.size === 0) return base;
    return base.map((e) => {
      const stats = edgeDiagMap.get(e.id);
      if (!stats) return e;
      const stroke = stats.errors > 0 ? '#ef4444' : stats.warns > 0 ? '#d97706' : (e.style as any)?.stroke;
      const strokeWidth = stats.errors > 0 ? 3 : stats.warns > 0 ? 2.4 : (e.style as any)?.strokeWidth;
      return { ...e, style: { ...(e.style ?? {}), stroke, strokeWidth } } as Edge;
    });
  }, [edges, edgeDiagMap, edgeType, edgeSelectionState]);

  const nodeTypes = useMemo(() => ({ planNode: PlanNode }), []);
  const nodeCount = (graph?.levels.reduce((sum, level) => sum + level.length, 0) ?? 0) + (graph?.orphanNodes.length ?? 0);
  const VISIBLE_ONLY_THRESHOLD = 200; // ≥200 节点默认仅渲染可见元素（小图关闭以避免额外开销）
  const renderVisibleOnly = (typeof onlyRenderVisibleElements === 'boolean')
    ? onlyRenderVisibleElements
    : (nodeCount >= VISIBLE_ONLY_THRESHOLD);
  const statusLabel = executionStatus ? EXECUTION_STATUS_LABELS[executionStatus] : null;

  // 节点编辑回调
  const handleEditNode = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
  }, []);

  // NodeTypeSelector 回调：选择节点类型后创建节点
  const handleNodeTypeSelect = useCallback((type: string) => {
    setShowNodeSelector(false);
    setConnectMode(false);
    if (nodeSelectorPosition && flowInstanceRef.current) {
      const flowPos = flowInstanceRef.current.screenToFlowPosition(nodeSelectorPosition);
      const snapped = snapToGrid ? { x: Math.round(flowPos.x / 16) * 16, y: Math.round(flowPos.y / 16) * 16 } : flowPos;
      onCreateNode?.({ connectFrom: connectingFrom ?? selectedNodeId ?? null, position: snapped, type });
    }
  }, [nodeSelectorPosition, connectingFrom, selectedNodeId, onCreateNode, snapToGrid]);

  // 查找当前编辑的节点
  const editingNode = useMemo(() => {
    if (!editingNodeId || !plan?.nodes) return null;
    return plan.nodes.find(n => n.id === editingNodeId) ?? null;
  }, [editingNodeId, plan]);

  // 拖拽中仅更新对齐线（DOM），不触发 React 渲染
  const handleNodeDrag = useCallback((_: React.MouseEvent, node: FlowNode<PlanNodeData>) => {
    if (!node) return;
    const centers = nodes.filter((n) => n.id !== node.id).map((n) => ({ x: n.position.x + (n.width||NODE_WIDTH)/2, y: n.position.y + (n.height||NODE_HEIGHT)/2 }));
    const cx = node.position.x + (NODE_WIDTH/2);
    const cy = node.position.y + (NODE_HEIGHT/2);
    const nearX = centers.find((c) => Math.abs(c.x - cx) <= 6);
    const nearY = centers.find((c) => Math.abs(c.y - cy) <= 6);
    const gxEl = guideXRef.current; const gyEl = guideYRef.current;
    if (gxEl) { if (nearX) { gxEl.style.left = `${nearX.x}px`; gxEl.style.display = ""; } else { gxEl.style.display = 'none'; } }
    if (gyEl) { if (nearY) { gyEl.style.top = `${nearY.y}px`; gyEl.style.display = ""; } else { gyEl.style.display = 'none'; } }
  }, [nodes]);

  // 拖拽结束才写回坐标（幂等过滤），从源头避免循环
  const handleNodeDragStop = useCallback((_: React.MouseEvent, node: { id: string; position: XYPosition }) => {
    const gxEl = guideXRef.current; const gyEl = guideYRef.current;
    if (gxEl) gxEl.style.display = 'none';
    if (gyEl) gyEl.style.display = 'none';
    if (!onUpdateNodePositions) return;
    const snapped = snapToGrid ? { x: Math.round(node.position.x / 16) * 16, y: Math.round(node.position.y / 16) * 16 } : node.position;
    // 幂等过滤：与 plan 当前坐标一致时不写回
    let same = false;
    if (plan && Array.isArray(plan.nodes)) {
      const cur = plan.nodes.find((n) => n?.id === node.id)?.ui?.position;
      if (cur && Number.isFinite(cur.x) && Number.isFinite(cur.y)) {
        same = cur.x === snapped.x && cur.y === snapped.y;
      }
    }
    if (!same) onUpdateNodePositions([{ id: node.id, position: snapped }]);
  }, [onUpdateNodePositions, snapToGrid, plan]);

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

  /**
   * 键盘快捷键处理
   *
   * 节点操作：
   * - 方向键（↑↓←→）：移动选中节点（Shift 加速 24px，普通 8px）
   * - Delete/Backspace：删除选中节点
   * - [ / ]：切换选择上一个/下一个节点
   * - Ctrl/Cmd + A：全选所有节点
   *
   * 边缘操作：
   * - Delete/Backspace：删除选中的边缘
   * - 支持同时删除多个边缘
   * - 可与节点删除同时执行
   *
   * 实现说明：
   * - 统一在父容器处理所有键盘事件，保持架构一致性
   * - 通过 selectedEdges 状态跟踪选中的边缘
   * - 调用 onDeleteEdge 回调通知父组件执行删除
   *
   * @param e - 键盘事件对象
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const STEP = e.shiftKey ? 24 : 8;
      const mod = e.metaKey || e.ctrlKey;
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
      } else if ((e.key === "Delete" || e.key === "Backspace")) {
        // 删除选中的边缘
        if (selectedEdges.length > 0) {
          e.preventDefault();
          for (const edge of selectedEdges) {
            onDeleteEdge?.(edge.source, edge.target);
          }
        }

        // 删除选中的节点
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          for (const id of selectedNodeIds) {
            onDeleteNode?.(id);
          }
        }
      } else if (mod && e.key.toLowerCase() === 'a') {
        // 选择全部节点（简单实现）
        e.preventDefault();
        setSelectedNodeIds(nodes.map((n)=>n.id));
      }
    },
    [moveSelected, selectByIndex, selectedNodeIds, selectedEdges, nodes, onDeleteNode, onDeleteEdge]
  );

  // 在 ReactFlowProvider 环境内桥接 v12 hooks，避免将 hooks 绑定到 ReactFlow 组件 props 上
  function FlowEventBridge() {
    // 选择变化：采用 v12 useOnSelectionChange，避免 prop 级别回调带来的不必要渲染
    useOnSelectionChange({
      onChange: ({ nodes: n, edges: e }) => {
        const pickedE = e.map((ed) => ({ id: ed.id!, source: ed.source!, target: ed.target! }));
        const pickedN = n.map((nd) => nd.id!);
        const prev = lastSelectionRef.current;
        const edgesSame = isSameSelection(prev.edges, pickedE, (x) => `${x.id}|${x.source}|${x.target}`);
        const nodesSame = isSameSelection(prev.nodes, pickedN);
        if (!edgesSame) setSelectedEdges(pickedE);
        if (!nodesSame) setSelectedNodeIds(pickedN);
        if (!edgesSame || !nodesSame) lastSelectionRef.current = { edges: pickedE, nodes: pickedN };
      }
    });

    // 视口变化：结束时记录到 data-*，用于后续可能的持久化/诊断（当前不外传）
    useOnViewportChange({
      onEnd: (vp) => {
        const el = paneRef.current;
        if (el) {
          (el.dataset as any).vpX = String(Math.round(vp.x));
          (el.dataset as any).vpY = String(Math.round(vp.y));
          (el.dataset as any).vpZ = String(Number(vp.zoom).toFixed(2));
        }
      }
    });
    return null;
  }

  if (!graph) {
    return (
      <div className={cardClasses()}>
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
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-outline btn-xs" disabled>
              ↑
            </button>
            <div className="inline-flex gap-1">
              <button type="button" className="btn btn-outline btn-xs" disabled>
                ←
              </button>
              <button type="button" className="btn btn-outline btn-xs" disabled>
                →
              </button>
            </div>
            <button type="button" className="btn btn-outline btn-xs" disabled>
              ↓
            </button>
            <button type="button" className="btn btn-outline btn-xs" disabled>
              连线
            </button>
          </div>
          )}

          <div
            className="h-[520px] rounded-2xl border border-base-content/10 bg-base-100"
            tabIndex={0}
          />
        </div>
      </div>
    );
  }

  // graph 不为 null 时使用前面已经声明的 hooks 计算的值
  return (
    <div className={cardClasses()}>
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
        <div className="flex flex-wrap items-center gap-2">

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
            title="删除选中"
            disabled={selectedNodeIds.length === 0 && !selectedNodeId}
            onClick={() => {
              const ids = selectedNodeIds.length > 0 ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : []);
              ids.forEach(id => onDeleteNode?.(id));
            }}
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
              } catch {
                // 回退：简单网格布局（保证“有变化”且可见可读）
                const COLS = Math.max(1, Math.round(Math.sqrt(nodes.length)));
                const GRID_X = 280; const GRID_Y = 160;
                const updates = nodes.map((n, i) => ({
                  id: n.id,
                  position: { x: (i % COLS) * GRID_X, y: Math.floor(i / COLS) * GRID_Y }
                }));
                onUpdateNodePositions?.(updates);
                flowInstanceRef.current?.fitView({ padding: 0.2 });
              }
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

        {connectMode && (
          <div className="text-xs text-info/80">从源节点右侧句柄拖到目标左侧句柄以创建连接</div>
        )}
        <ReactFlowProvider>
          <NodeEditCtx.Provider value={{ onUpdateNode, onEditNode: handleEditNode, editable, connectMode }}>
            <div
              ref={paneRef}
              className="h-[520px] rounded-2xl border border-base-content/10 bg-base-200 relative"
              role="region"
              aria-label="计划画布区域"
              tabIndex={0}
              data-visible-only={renderVisibleOnly ? '1' : '0'}
              onKeyDown={handleKeyDown}
            >
              {/* 对齐线提示：使用 ref 控制显示/位置，默认隐藏；禁用指针事件避免拦截拖拽 */}
              <div ref={guideXRef} style={{ position:'absolute', left:0, top:0, bottom:0, width:1, background:'oklch(var(--bc) / 0.25)', display:'none', pointerEvents:'none' }} />
              <div ref={guideYRef} style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'oklch(var(--bc) / 0.25)', display:'none', pointerEvents:'none' }} />

              {/*
                React Flow 交互配置说明：

                【边缘选择配置】
                1. interactionWidth: 30 - 边缘交互区域宽度 30px，使细边缘更容易点击
                2. onEdgeClick - 边缘点击事件处理，手动管理选中状态

                【手势冲突修复】
                3. selectionOnDrag={false} - ⚠️ 关键修复：禁用拖动选择框
                   - 默认为 true 时会拦截边缘点击事件，导致边缘无法选中
                   - 设为 false 后边缘点击优先级最高，可正常选中
                   - 用户仍可通过 Ctrl+点击进行多选

                4. panOnDrag={[2]} - 限制画布平移仅响应右键拖动
                   - 左键（0）专用于节点/边缘选择和连接操作
                   - 右键（2）专用于画布平移
                   - 符合常见 CAD 软件的交互习惯

                【删除机制】
                5. 统一的键盘删除处理 + onEdgesDelete回调
                   - selectionOnDrag={false} 允许单击直接选中边缘（默认true需要拖动框选）
                   - 节点和边缘的删除逻辑统一在父容器的 handleKeyDown 中处理
                   - 通过 selectedNodeIds 和 selectedEdges 状态跟踪选中元素
                   - 按 Delete/Backspace 键触发删除，调用 onDeleteNode 和 onDeleteEdge 回调
                   - 支持同时删除多个节点和边缘
                   - onEdgesDelete 回调用于React Flow内部边缘删除事件

                【设计理由】
                - React Flow v12 不再支持 edgesSelectable 和 edgesDeletable props
                - 边缘选择通过 onEdgeClick 手动管理状态，删除通过键盘事件处理
                - 通过明确分离选择（左键）和平移（右键）手势，提升交互清晰度
                - interactionWidth 配置参考 React Flow 官方最佳实践
                - 统一在父容器处理键盘删除，保持架构一致性和可维护性
              */}
              <ReactFlow
                nodes={nodes}
                edges={edgesWithDiag}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2, minZoom: 0.3, maxZoom: 1.5 }}
                onlyRenderVisibleElements={renderVisibleOnly}
                nodesConnectable={editable && connectMode}
                nodesDraggable={!!editable}
                selectionOnDrag={false}  // 允许单击选中边缘，而不是只能框选
                defaultEdgeOptions={{
                  type: edgeType,
                  markerEnd: { type: MarkerType.ArrowClosed } as any,
                  interactionWidth: 30  // 添加30px的不可见交互区域，使边缘更容易点击选中
                }}
                connectionLineStyle={{
                  strokeDasharray: '5,5',
                  stroke: 'oklch(var(--p))',
                  strokeWidth: 2,
                  animation: 'dash 0.5s linear infinite'
                }}
                isValidConnection={(conn: Edge | Connection) => {
                  if (!editable) return false;
                  if (!conn.source || !conn.target) return false;
                  if (conn.source === conn.target) return false;
                  // 重复与环检测
                  const key = `${conn.source}->${conn.target}`;
                  const duplicate = edges.some((e) => (e.id ? e.id === key : (e.source === conn.source && e.target === conn.target)));
                  if (duplicate) return false;
                  const adj = new Map<string,string[]>();
                  nodes.forEach(n=>adj.set(n.id, []));
                  edges.forEach(e=> { (adj.get(e.source)||[]).push(e.target); });
                  // DFS: 是否存在 target ->* source 的路径
                  const stack=[conn.target]; const seen=new Set<string>();
                  while(stack.length){
                    const cur = stack.pop()!; if (cur===conn.source) return false; // 成环
                    if (seen.has(cur)) continue; seen.add(cur);
                    const next = adj.get(cur)||[]; next.forEach(x=> stack.push(x));
                  }
                  return true;
                }}
                onEdgesDelete={(eds: Edge[]) => {
                  for (const e of eds) {
                    if (e.source && e.target) onDeleteEdge?.(e.source, e.target);
                  }
                }}
                onReconnect={(oldEdge: Edge, newConn: Connection) => {
                  const next = reconnectEdge(oldEdge, newConn, edges);
                  const newEdge = next.find((e) => !edges.some((ee) => ee.id === e.id));
                  if (oldEdge.source && oldEdge.target && (oldEdge.source !== newConn.source || oldEdge.target !== newConn.target)) {
                    onDeleteEdge?.(oldEdge.source, oldEdge.target);
                  }
                  if (newEdge && newEdge.source && newEdge.target) {
                    onConnectEdge?.(newEdge.source, newEdge.target);
                  }
                }}
                onConnectStart={(_, params: OnConnectStartParams) => {
                  setConnectingFrom(params?.nodeId ?? null);
                }}
                onConnectEnd={(event) => {
                  const target = event.target as HTMLElement | null;
                  const endedOnPane = !!target && target.classList.contains('react-flow__pane');
                  if (endedOnPane) {
                    const isTouch = (event as any).changedTouches && (event as any).changedTouches.length > 0;
                    const pt = isTouch ? (event as any).changedTouches[0] : (event as any);
                    const clientX = Number(pt?.clientX ?? 0);
                    const clientY = Number(pt?.clientY ?? 0);
                    const flowPos = flowInstanceRef.current?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: 0, y: 0 };
                    const snapped = snapToGrid ? { x: Math.round(flowPos.x / 16) * 16, y: Math.round(flowPos.y / 16) * 16 } : flowPos;

                    if (autoCreateEnabled) {
                      // 自动创建模式：直接创建 local_task 类型节点
                      onCreateNode?.({ connectFrom: connectingFrom ?? selectedNodeId ?? null, position: snapped, type: 'local_task' });
                      setConnectMode(false);
                    } else {
                      // 手动选择模式：显示 NodeTypeSelector
                      setNodeSelectorPosition({ x: clientX, y: clientY });
                      setShowNodeSelector(true);
                    }
                  } else {
                    setConnectMode(false);
                  }
                  setConnectingFrom(null);
                }}
                onConnect={(conn: import("@xyflow/react").Connection) => {
                  if (conn.source && conn.target) {
                    onConnectEdge?.(conn.source, conn.target);
                  }
                  setConnectMode(false);
                }}
                onInit={(inst: import("@xyflow/react").ReactFlowInstance<FlowNode<PlanNodeData>, Edge>) => { flowInstanceRef.current = inst; }}
                panOnDrag={[2]}  // 仅右键可平移画布，左键专用于选择
                zoomOnScroll
                proOptions={{ hideAttribution: true }}
                onNodeClick={(_: React.MouseEvent, node: FlowNode<PlanNodeData>) => {
                  onSelectNode?.(node?.id ?? null);
                  const el = document.querySelector<HTMLElement>(`[data-node-id="${node?.id}"]`);
                  el?.scrollIntoView({ block: "nearest", inline: "nearest" });
                  if (liveRef.current && node?.id) {
                    liveRef.current.textContent = `已选择节点 ${node.id}`;
                  }
                }}
                onPaneClick={() => onSelectNode?.(null)}
                onNodeDrag={handleNodeDrag}
                onNodeDragStop={handleNodeDragStop}
                onEdgeClick={(event, edge) => {
                  if (!editable) return;

                  console.log('[DEBUG] Edge clicked:', {
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    selectable: edge.selectable,
                    deletable: edge.deletable
                  });

                  // 🔧 关键修复：聚焦容器以接收键盘事件
                  paneRef.current?.focus();

                  const isMultiSelect = event.shiftKey || event.ctrlKey || event.metaKey;
                  
                  // 手动设置边缘选中状态（视觉效果）
                  setEdgeSelectionState((prev) => {
                    if (isMultiSelect) {
                      return { ...prev, [edge.id]: !prev[edge.id] };
                    } else {
                      return { [edge.id]: !prev[edge.id] };
                    }
                  });

                  // 🔧 关键修复：同步更新 selectedEdges 状态（用于删除逻辑）
                  setSelectedEdges((prev) => {
                    const edgeInfo = { id: edge.id, source: edge.source, target: edge.target };
                    const exists = prev.some(e => e.id === edge.id);
                    
                    if (isMultiSelect) {
                      // 多选模式：切换当前边缘
                      return exists 
                        ? prev.filter(e => e.id !== edge.id)
                        : [...prev, edgeInfo];
                    } else {
                      // 单选模式：只选中当前边缘
                      return exists ? [] : [edgeInfo];
                    }
                  });
                }}
                onSelectionChange={({ nodes, edges }) => {
                  if (import.meta.env.DEV && edges.length > 0) {
                    console.log('[DEBUG] Selected edges:', edges.map(e => e.id));
                  }
                }}
              >
                <FlowEventBridge />
                <MiniMap pannable zoomable nodeStrokeColor={"oklch(var(--bc))"} nodeColor={"oklch(var(--b3))"} maskColor={"oklch(var(--b1) / 0.55)"} />
                <Controls showInteractive={false} />
                <Background gap={24} color={"oklch(var(--bc) / 0.2)"} style={{ zIndex: 0, backgroundColor: 'transparent', pointerEvents: 'none' }} />

                {/* 偏好切换 UI - 画布右上角 */}
                {editable && (
                  <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
                    <label className="label cursor-pointer gap-2 bg-base-100 rounded-box px-3 py-1 shadow-sm">
                      <span className="label-text text-xs">自动创建节点</span>
                      <input
                        type="checkbox"
                        className="toggle toggle-sm"
                        checked={autoCreateEnabled}
                        onChange={(e) => setAutoCreateEnabled(e.target.checked)}
                        aria-label="切换自动创建节点模式"
                      />
                    </label>
                    {onCleanupOrphanedNodes && (
                      <button
                        type="button"
                        onClick={onCleanupOrphanedNodes}
                        className="btn btn-xs btn-outline gap-1 bg-base-100 shadow-sm"
                        title="清理未连接节点"
                        aria-label="清理未连接节点"
                      >
                        🧹 清理孤立节点
                      </button>
                    )}
                  </div>
                )}

                {/* 首次引导提示 - 画布顶部居中 */}
                {showGuide && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md">
                    <div className="alert alert-info shadow-lg">
                      <span className="text-sm">💡 从节点右侧圆点拖拽到空白处可创建新节点</span>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          setShowGuide(false);
                          try {
                            localStorage.setItem('plancanvas_guide_seen', '1');
                          } catch {
                            // localStorage 不可用时静默失败
                          }
                        }}
                        aria-label="关闭引导提示"
                      >
                        知道了
                      </button>
                    </div>
                  </div>
                )}
              </ReactFlow>
            </div>
          </NodeEditCtx.Provider>
        </ReactFlowProvider>

        {/* NodeTypeSelector - 浮动在拖拽结束位置 */}
        {showNodeSelector && nodeSelectorPosition && (
          <NodeTypeSelector
            position={nodeSelectorPosition}
            onSelect={handleNodeTypeSelect}
            onCancel={() => {
              setShowNodeSelector(false);
              setConnectMode(false);
            }}
          />
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-base-content/70">
          <span>入口节点：{graph.entryId ?? "未知"}</span>
          <span>节点总数：{nodeCount}</span>
          <span>待审批节点：{pendingNodeIds.size}</span>
        </footer>

        {/* 节点编辑抽屉 */}
        <PlanNodeEditDrawer
          node={editingNode}
          onClose={() => setEditingNodeId(null)}
          onSave={(id, updates) => {
            onUpdateNode?.(id, updates);
            setEditingNodeId(null);
          }}
        />
      </div>
    </div>
  );
}
