import React from "react";
import { PlanNodeEditor } from "../../components/PlanNodeEditor";
import type { PlanJson } from "../../components/graph/PlanCanvas";

export interface InspectorCoreProps {
  plan: PlanJson | null;
  selectedNodeId: string | null;
  disabled?: boolean;
  onUpdateNode?: (nodeId: string, patch: any) => void;
}

export function InspectorCore({ plan, selectedNodeId, disabled, onUpdateNode }: InspectorCoreProps) {
  if (disabled) {
    const node = plan?.nodes?.find((n) => n.id === selectedNodeId) ?? null;
    return (
      <div className="card bg-base-200/50">
        <div className="card-body p-3 text-sm">
          <h3 className="font-semibold text-sm mb-2">节点详情</h3>
          {!node && <div className="opacity-60">未选择节点</div>}
          {node && (
            <ul className="space-y-1">
              <li><span className="opacity-60">ID：</span><span className="font-mono">{node.id}</span></li>
              {node.type && <li><span className="opacity-60">类型：</span>{node.type}</li>}
              {node.label && <li><span className="opacity-60">标签：</span>{node.label}</li>}
              <li><span className="opacity-60">子节点数：</span>{Array.isArray(node.children) ? node.children.length : 0}</li>
            </ul>
          )}
        </div>
      </div>
    );
  }
  return (
    <PlanNodeEditor
      plan={plan}
      selectedNodeId={selectedNodeId}
      onSelectNode={() => void 0}
      onUpdateNode={(id, patch) => onUpdateNode?.(id, patch)}
    />
  );
}

export default InspectorCore;
