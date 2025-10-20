import React, { useEffect, useState } from "react";
import { PlanCanvas } from "../../components/graph/PlanCanvas";
import type { PlanJson, PlanNodePositionUpdate, DiagnosticsItem } from "../../components/graph/PlanCanvas";
import type { ExecutionVisualizationStatus } from "../../visualizationTypes";
import type { BridgeState } from "../../types/orchestrator";
import type { XYPosition } from "@xyflow/react";

export interface GraphCanvasShellProps {
  plan: PlanJson | null;
  bridgeState: BridgeState;
  pendingNodeIds: ReadonlySet<string>;
  currentNodeId?: string | null;
  completedNodeIds?: ReadonlySet<string>;
  executionStatus?: ExecutionVisualizationStatus;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onUpdateNodePositions?: (updates: readonly PlanNodePositionUpdate[]) => void;
  onCreateNode?: (opts: { connectFrom?: string | null; position?: XYPosition }) => void;
  onDeleteNode?: (nodeId: string) => void;
  onConnectEdge?: (source: string, target: string) => void;
  onDeleteEdge?: (source: string, target: string) => void;
  onCleanupOrphanedNodes?: () => void;
  onUpdateNode?: (nodeId: string, patch: any) => void;
  editable?: boolean;
  diagnostics?: Array<{ severity: string; message: string; nodeId?: string; edgeId?: string }>;
}

const EMPTY_DIAGNOSTICS: DiagnosticsItem[] = [];

export function GraphCanvasShell(props: GraphCanvasShellProps) {
  // 从设置读取 onlyRenderVisibleElements（默认开启），并监听设置变更事件
  const readOnlyRenderVisible = () => {
    try { return localStorage.getItem('designer:onlyRenderVisible') !== '0'; } catch { return true; }
  };
  const [onlyRenderVisible, setOnlyRenderVisible] = useState<boolean>(() => readOnlyRenderVisible());
  useEffect(() => {
    const handler = (e: any) => {
      if (e?.type === 'designer:settings-changed' && typeof e.detail?.onlyRenderVisible === 'boolean') {
        setOnlyRenderVisible(Boolean(e.detail.onlyRenderVisible));
      }
    };
    window.addEventListener('designer:settings-changed', handler as any);
    return () => window.removeEventListener('designer:settings-changed', handler as any);
  }, []);

  // 重要：不要在此处用 `?? []` 生成新数组（将导致每次渲染 diagnostics 都变更）
  // 使用模块级常量 EMPTY_DIAGNOSTICS 保持引用稳定，满足 exactOptionalPropertyTypes 要求
  return (
    <PlanCanvas
      {...props}
      onlyRenderVisibleElements={onlyRenderVisible}
      diagnostics={props.diagnostics ?? EMPTY_DIAGNOSTICS}
    />
  );
}

export default GraphCanvasShell;
