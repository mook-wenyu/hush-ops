import React, { useState } from "react";
import { deletePlan } from "../../services/plans";
import { CreatePlanModal } from "../../components/CreatePlanModal";

export interface PlanListPanelProps {
  plans: { id: string; description?: string; version?: string }[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onOpen?: (id: string) => void;
  onUpload?: (files: File[]) => Promise<void> | void;
  onImportExamples?: () => Promise<void> | void;
}

export function PlanListPanel({ plans, loading, error, onRefresh, onOpen, onUpload, onImportExamples: _onImportExamples }: PlanListPanelProps) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 打开创建计划模态窗口
  const handleCreatePlan = () => {
    setModalOpen(true);
  };

  // 创建计划成功回调
  const handleCreateSuccess = async (planId: string) => {
    setMsg(`计划已创建：${planId}`);
    await onRefresh?.();
    onOpen?.(planId);
  };

  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm(`确认删除计划 "${planId}"？此操作不可恢复。`)) {
      return;
    }

    setMsg(null);
    setErr(null);
    try {
      await deletePlan(planId);
      setMsg(`已删除计划：${planId}`);
      await onRefresh?.();
    } catch (e) {
      setErr((e as Error).message ?? '删除失败');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex-shrink-0 flex items-center justify-between">
        <span className="text-xs opacity-70">计划列表</span>
        <div className="join">
          <button
            className="btn btn-xs join-item min-h-6"
            onClick={handleCreatePlan}
          >
            新建计划
          </button>
          <label className="btn btn-xs join-item min-h-6">
            导入
            <input
              type="file"
              accept=".json"
              multiple
              style={{ display: 'none' }}
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) return;
                await onUpload?.(files);
                (e.target as HTMLInputElement).value = '';
              }}
            />
          </label>
        </div>
      </div>
      {(error || err || msg) && (
        <div className={`alert ${error || err ? 'alert-warning' : 'alert-success'} text-xs`}>
          <span>{error ?? err ?? msg}</span>
        </div>
      )}
      <ul className="menu menu-compact menu-xs bg-base-200/60 rounded-box border border-base-content/10 flex-1 min-h-0 overflow-auto">
        {loading && (
          <li className="px-3 py-2 text-xs opacity-60">加载中…</li>
        )}
        {!loading && plans.map((p) => {
          return (
            <li key={p.id} className="">
              <div className="justify-between items-start gap-2">
                <button onClick={() => onOpen?.(p.id)} className="justify-start flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs truncate" title={p.id}>{p.id}</span>
                    {p.version && <span className="badge badge-ghost badge-xs ml-1">v{p.version}</span>}
                  </div>

                </button>
                <div className="flex items-center gap-1">
                  <button
                    className="btn btn-ghost btn-xs"
                    title="删除计划"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleDeletePlan(p.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>

            </li>
          );
        })}
        {!loading && plans.length === 0 && <li className="px-3 py-2 text-xs opacity-60">暂无计划</li>}
      </ul>

      {/* 创建计划模态窗口 */}
      <CreatePlanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

export default PlanListPanel;
