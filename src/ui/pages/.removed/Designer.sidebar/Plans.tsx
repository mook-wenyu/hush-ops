import React from "react";
import type { PlanSummary } from "../../../services/orchestratorApi";

export function PlansSidebar(props: { plans: PlanSummary[]; onOpen: (id: string) => void }) {
  const { plans, onOpen } = props;
  return (
    <div className="card bg-base-200/50">
      <div className="card-body p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">计划列表</span>
        </div>
        <ul className="menu bg-base-100 rounded-box text-xs">
          {plans.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p.id)} className="justify-between">
                <span>{p.id}</span>
                {p.version && <span className="badge badge-ghost badge-xs">{p.version}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
