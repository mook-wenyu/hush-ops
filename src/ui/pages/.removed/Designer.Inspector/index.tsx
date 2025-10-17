import React from "react";

interface InspectorProps {
  node: any | null;
  onChange: (patch: Partial<any>) => void;
}

export function Inspector({ node, onChange }: InspectorProps) {
  if (!node) {
    return (
      <div className="card bg-base-200/50">
        <div className="card-body p-3">
          <div className="text-xs opacity-60">未选择节点</div>
        </div>
      </div>
    );
  }
  return (
    <div className="card bg-base-200/50">
      <div className="card-body p-3 space-y-2">
        <h3 className="font-semibold text-sm">属性：{node.id}</h3>
        <div className="form-control">
          <label className="label"><span className="label-text">标题/标签</span></label>
          <input className="input input-sm input-bordered" value={node?.data?.label ?? ''}
            onChange={(e)=> onChange({ data: { ...(node.data ?? {}), label: e.target.value } })} />
        </div>
        <div className="form-control">
          <label className="label"><span className="label-text">类型</span></label>
          <input className="input input-sm input-bordered" value={node?.type ?? ''}
            onChange={(e)=> onChange({ type: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
