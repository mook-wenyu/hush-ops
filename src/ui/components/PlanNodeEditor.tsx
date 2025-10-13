import { ChangeEvent, useMemo } from "react";

import type { PlanJson, PlanNodeJson } from "./graph/PlanCanvas";

interface PlanNodeEditorProps {
  readonly plan: PlanJson | null;
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string | null) => void;
  readonly onUpdateNode: (nodeId: string, updates: Partial<Omit<PlanNodeJson, "id">>) => void;
}

function formatOption(node: PlanNodeJson): string {
  const base = node.label ?? node.id;
  if (node.type) {
    return `${base} · ${node.type}`;
  }
  return base;
}

export function PlanNodeEditor({ plan, selectedNodeId, onSelectNode, onUpdateNode }: PlanNodeEditorProps) {
  const nodes = plan?.nodes ?? [];
  const current = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    onSelectNode(value.length > 0 ? value : null);
  };

  const handleTextChange = (field: keyof PlanNodeJson) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!current) {
      return;
    }
    const value = event.target.value;
    onUpdateNode(current.id, { [field]: value.length > 0 ? value : undefined });
  };

  const handleCheckboxChange = (field: keyof PlanNodeJson) => (event: ChangeEvent<HTMLInputElement>) => {
    if (!current) {
      return;
    }
    onUpdateNode(current.id, { [field]: event.target.checked });
  };

  if (!plan || nodes.length === 0) {
    return (
      <div className="card bg-base-300/70 shadow-xl">
        <div className="card-body space-y-3 text-sm text-base-content/70">
          <h2 className="card-title text-lg">Plan 节点编辑器</h2>
          <p>当前 Plan 中没有节点，粘贴或选择一个计划后可进行编辑。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-300/70 shadow-xl">
      <div className="card-body space-y-4">
        <div>
          <h2 className="card-title text-lg">Plan 节点编辑器</h2>
          <p className="text-sm text-base-content/70">选择节点并更新显示名称、描述、风险等级或审批要求，改动将同步写回 Plan JSON。</p>
        </div>

        <div className="form-control gap-2">
          <label className="label p-0">
            <span className="label-text text-sm font-medium">选择节点</span>
          </label>
          <select className="select select-bordered select-sm" value={selectedNodeId ?? ""} onChange={handleSelectChange}>
            <option value="">（不选）</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {formatOption(node)}
              </option>
            ))}
          </select>
        </div>

        {!current && (
          <div className="alert alert-info text-sm">
            <span>选择节点后可编辑属性。</span>
          </div>
        )}

        {current && (
          <div className="space-y-4">
            <div className="form-control gap-2">
              <label className="label p-0 text-sm font-medium">显示名称</label>
              <input
                type="text"
                className="input input-bordered input-sm"
                value={current.label ?? ""}
                onChange={handleTextChange("label")}
                placeholder={current.id}
              />
            </div>

            <div className="form-control gap-2">
              <label className="label p-0 text-sm font-medium">描述</label>
              <textarea
                className="textarea textarea-bordered textarea-sm"
                rows={3}
                value={current.description ?? ""}
                onChange={handleTextChange("description")}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="form-control gap-2">
                <label className="label p-0 text-sm font-medium">风险等级</label>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  value={current.riskLevel ?? ""}
                  onChange={handleTextChange("riskLevel")}
                  placeholder="low / medium / high"
                />
              </div>

              <div className="form-control gap-2">
                <label className="label cursor-pointer justify-start gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={Boolean(current.requiresApproval)}
                    onChange={handleCheckboxChange("requiresApproval")}
                  />
                  <span>需要审批</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
