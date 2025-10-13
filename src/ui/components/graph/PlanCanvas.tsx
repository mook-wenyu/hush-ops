import { createContext, memo, useCallback, useContext, useMemo } from "react";

import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  type NodeChange,
  type Node as FlowNode,
  type NodeProps,
  type XYPosition,
  ReactFlowProvider
} from "reactflow";

import { usePlanNodeOverlays, type PlanNodeOverlayDefinition } from "../../plugins/planOverlays";
import {
  type ExecutionVisualizationStatus,
  type PlanNodeEvent,
  type PlanNodeOverlayRenderContext,
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
  description?: string;
}

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
}

interface PlanGraph {
  readonly planId?: string;
  readonly planVersion?: string;
  readonly entryId?: string;
  readonly levels: PlanNodeJson[][];
  readonly orphanNodes: PlanNodeJson[];
  readonly edges: Array<{ source: string; target: string }>;
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
const EMPTY_NODE_EVENTS: ReadonlyMap<string, readonly PlanNodeEvent[]> = new Map();

const EXECUTION_STATUS_LABELS: Record<ExecutionVisualizationStatus, string> = {
  idle: "空闲",
  pending: "排队中",
  running: "执行中",
  success: "成功",
  failed: "失败",
  cancelled: "已取消"
};

function bridgeBadgeClass(state: BridgeState): string {
  switch (state) {
    case "connected":
      return "badge-success";
    case "connecting":
      return "badge-warning";
    case "reconnecting":
      return "badge-info";
    case "disconnected":
    default:
      return "badge-error";
  }
}

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

  const visited = new Set<string>();
  const levels: PlanNodeJson[][] = [];
  let frontier: string[] = [entryId];

  while (frontier.length > 0) {
    const nextFrontier = new Set<string>();
    const levelNodes: PlanNodeJson[] = [];

    for (const nodeId of frontier) {
      if (visited.has(nodeId)) {
        continue;
      }
      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }
      visited.add(nodeId);
      levelNodes.push(node);
      if (Array.isArray(node.children)) {
        for (const childId of node.children) {
          if (typeof childId === "string" && !visited.has(childId)) {
            nextFrontier.add(childId);
          }
        }
      }
    }

    if (levelNodes.length > 0) {
      levels.push(levelNodes);
    }

    if (nextFrontier.size === 0) {
      break;
    }
    frontier = Array.from(nextFrontier);
  }

  const orphanNodes = plan.nodes.filter((node) => !visited.has(node.id));
  const edges: Array<{ source: string; target: string }> = [];
  levels.forEach((level) => {
    for (const node of level) {
      if (Array.isArray(node.children)) {
        for (const childId of node.children) {
          edges.push({ source: node.id, target: childId });
        }
      }
    }
  });

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
  }
): { nodes: FlowNode<PlanNodeData>[]; edges: Edge[] } {
  const { pendingNodeIds, activeNodeId, completedNodeIds, nodeEvents, selectedNodeId } = options;
  const nodes: FlowNode<PlanNodeData>[] = [];
  const edges: Edge[] = [];

  graph.levels.forEach((level, levelIndex) => {
    level.forEach((node, nodeIndex) => {
      const isPending = pendingNodeIds.has(node.id);
      const isActive = activeNodeId != null && node.id === activeNodeId;
      const isCompleted = completedNodeIds?.has(node.id) ?? false;
      const isSelected = selectedNodeId != null && node.id === selectedNodeId;
      const events = nodeEvents?.get(node.id) ?? [];

      const data: PlanNodeData = {
        id: node.id,
        title: getNodeLabel(node),
        subtitle: getNodeSubtitle(node),
        riskLevel: node.riskLevel,
        pending: isPending,
        state: isActive ? "active" : isCompleted ? "completed" : "default",
        description: node.description ?? node.id,
        events,
        selected: isSelected
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
        draggable: true,
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

      const data: PlanNodeData = {
        id: node.id,
        title: getNodeLabel(node),
        subtitle: "未连接",
        pending: isPending,
        state: isActive ? "active" : isCompleted ? "completed" : "default",
        description: node.description ?? node.id,
        events,
        selected: isSelected
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
        draggable: true,
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
      id: `${edge.source}->${edge.target}`,
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
        {data.riskLevel && <span className="badge badge-outline badge-error badge-xs">{data.riskLevel}</span>}
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
  bridgeState,
  pendingNodeIds,
  currentNodeId,
  completedNodeIds,
  executionStatus,
  selectedNodeId,
  onSelectNode,
  onUpdateNodePositions
}: PlanCanvasProps) {
  const graph = useMemo(() => buildPlanGraph(plan), [plan]);

  if (!graph) {
    return (
      <div className="card bg-base-300/70 shadow-xl">
        <div className="card-body space-y-3">
          <h2 className="card-title text-lg">Plan 画布</h2>
          <p className="text-sm text-base-content/70">
            当前没有可视化数据。请在上方粘贴 Plan JSON 或从 Registry 选择计划。
          </p>
        </div>
      </div>
    );
  }

  const { nodes, edges } = useMemo(
    () =>
      createFlowElements(graph, {
        pendingNodeIds,
        activeNodeId: currentNodeId,
        completedNodeIds,
        selectedNodeId
      }),
    [graph, pendingNodeIds, currentNodeId, completedNodeIds, selectedNodeId]
  );

  const nodeTypes = useMemo(() => ({ planNode: PlanNode }), []);
  const nodeCount = graph.levels.reduce((sum, level) => sum + level.length, 0) + graph.orphanNodes.length;
  const statusLabel = executionStatus ? EXECUTION_STATUS_LABELS[executionStatus] : null;

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!onUpdateNodePositions) {
        return;
      }
      const updates: PlanNodePositionUpdate[] = [];
      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          updates.push({ id: change.id, position: change.position });
        }
      }
      if (updates.length > 0) {
        onUpdateNodePositions(updates);
      }
    },
    [onUpdateNodePositions]
  );

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
          <span className={`badge badge-lg ${bridgeBadgeClass(bridgeState)}`}>
            {bridgeState === "connected" && "在线"}
            {bridgeState === "connecting" && "连接中"}
            {bridgeState === "reconnecting" && "重连中"}
            {bridgeState === "disconnected" && "已断开"}
          </span>
        </div>

        <ReactFlowProvider>
          <div className="h-[520px] rounded-2xl border border-base-content/10 bg-base-200/60">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2, minZoom: 0.3, maxZoom: 1.5 }}
              nodesConnectable={false}
              panOnDrag
              zoomOnScroll
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, node) => {
                onSelectNode?.(node?.id ?? null);
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
