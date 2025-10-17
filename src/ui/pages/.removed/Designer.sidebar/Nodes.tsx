import React, { useMemo, useState } from "react";
import { IconBolt, IconCloud, IconTerminal2, IconRobot, IconTool, IconGitMerge, IconGitBranch } from "@tabler/icons-react";

const LIB = [
  { type: "function", label: "函数", group: "通用", icon: <IconBolt size={14} /> },
  { type: "http", label: "HTTP", group: "通用", icon: <IconCloud size={14} /> },
  { type: "shell", label: "Shell", group: "通用", icon: <IconTerminal2 size={14} /> },
  { type: "agent", label: "Agent", group: "AI", icon: <IconRobot size={14} /> },
  { type: "mcp", label: "MCP Tool", group: "AI", icon: <IconTool size={14} /> },
  { type: "condition", label: "条件", group: "控制流", icon: <IconGitBranch size={14} /> },
  { type: "join", label: "汇聚", group: "控制流", icon: <IconGitMerge size={14} /> }
];

export function NodesSidebar(props: { onAddNode: (node: any) => void }) {
  const { onAddNode } = props;
  const [q, setQ] = useState("");
  const groups = useMemo(() => Array.from(new Set(LIB.map(i => i.group))), []);
  const filtered = useMemo(() => LIB.filter(i => i.label.toLowerCase().includes(q.toLowerCase()) || i.type.includes(q)), [q]);
  return (
    <div className="card bg-base-200/50">
      <div className="card-body p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">节点库</span>
          <input aria-label="搜索节点" className="input input-xs input-bordered ml-auto" placeholder="搜索…" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        {groups.map(g => (
          <div key={g}>
            <div className="text-xs opacity-70 mb-1">{g}</div>
            <div className="grid grid-cols-2 gap-2">
              {filtered.filter(i => i.group === g).map((n, idx) => (
                <button key={`${g}-${idx}`} aria-label={`添加节点 ${n.label}`} className="btn btn-xs justify-start" onClick={() => onAddNode({ id: `${n.type}-${Date.now()}`, data: { label: n.label }, position: { x: 50, y: 50 } })}>
                  <span className="mr-1">{n.icon}</span>{n.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
