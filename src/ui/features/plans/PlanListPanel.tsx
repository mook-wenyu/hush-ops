import React from "react";
// import type { PlanJson } from "../../components/graph/PlanCanvas";

export interface PlanListPanelProps {
  plans: { id: string; description?: string; version?: string }[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onOpen?: (id: string) => void;
  onUpload?: (files: File[]) => Promise<void> | void;
  onImportExamples?: () => Promise<void> | void;
}

export function PlanListPanel({ plans, loading: _loading, error, onRefresh: _onRefresh, onOpen, onUpload, onImportExamples }: PlanListPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs opacity-70">计划列表</span>
        <div className="join">
          <button className="btn btn-xs join-item" onClick={() => onImportExamples?.()}>导入示例</button>
          <label className="btn btn-xs join-item">
            上传
            <input type="file" accept=".json" multiple style={{ display: 'none' }} onChange={async (e)=>{
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              await onUpload?.(files);
              (e.target as HTMLInputElement).value = '';
            }} />
          </label>
        </div>
      </div>
      {error && <div className="alert alert-warning text-xs"><span>{error}</span></div>}
      <ul className="menu menu-sm bg-base-200/60 rounded-box border border-base-content/10 max-h-48 overflow-auto">
        {plans.map((p) => (
          <li key={p.id}>
            <button onClick={() => onOpen?.(p.id)}>
              <span className="font-mono text-xs">{p.id}</span>
              {p.version && <span className="badge badge-ghost badge-xs ml-2">v{p.version}</span>}
            </button>
          </li>
        ))}
        {plans.length === 0 && <li className="px-3 py-2 text-xs opacity-60">暂无计划</li>}
      </ul>
    </div>
  );
}

export default PlanListPanel;
