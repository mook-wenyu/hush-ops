import { useEffect, useMemo, useState } from 'react';
import type { ExecutionRecord } from '../../types/orchestrator.js';
import { fetchExecutionHistory, buildExecutionsExportUrl, getBaseUrl } from '../../services';
import { ErrorAlert } from '../../components/ErrorAlert';
import { RetryButton } from '../../components/RetryButton';

export default function RunsPage() {
  const [items, setItems] = useState<ExecutionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const q = useMemo(() => ({ planId: planId.trim() || undefined, limit: pageSize, offset: (page-1)*pageSize }), [planId, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { total, executions } = await fetchExecutionHistory(q as any);
        if (!cancelled) { setTotal(total); setItems(executions); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [q]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">运行历史（Runs）</h1>
        <div className="flex items-center gap-2">
          <a className="btn btn-sm" href={`${getBaseUrl()}${buildExecutionsExportUrl('json', planId.trim() ? { planId: planId.trim() } : undefined)}`} target="_blank" rel="noreferrer">导出JSON</a>
          <a className="btn btn-sm" href={`${getBaseUrl()}${buildExecutionsExportUrl('ndjson', planId.trim() ? { planId: planId.trim() } : undefined)}`} target="_blank" rel="noreferrer">导出NDJSON</a>
        </div>
      </div>
      {error && (
        <div className="mb-3 flex items-center gap-2">
          <ErrorAlert message={error} size="sm" />
          <RetryButton size="sm" onClick={async()=>{
            try{ setError(null); const { total, executions } = await fetchExecutionHistory(q as any); setTotal(total); setItems(executions); } catch(e){ setError((e as Error).message); }
          }} />
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <input className="input input-xs input-bordered" placeholder="按 planId 过滤" value={planId} onChange={(e)=>{ setPage(1); setPlanId(e.target.value); }} />
      </div>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Created</th>
              <th>Started</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td><a className="link link-hover" href={`#/executions/${it.id}`}>{it.id}</a></td>
                <td>{it.planId}</td>
                <td><span className="badge badge-ghost badge-xs">{it.status}</span></td>
                <td className="opacity-70">{it.createdAt}</td>
                <td className="opacity-70">{it.startedAt ?? '-'}</td>
                <td className="opacity-70">{it.finishedAt ?? '-'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="opacity-60">暂无运行记录。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center gap-2 justify-end">
        <span className="text-xs opacity-70">共 {total} 条</span>
        <select className="select select-xs select-bordered" value={pageSize} onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1); }}>
          <option value={10}>10/页</option>
          <option value={20}>20/页</option>
          <option value={50}>50/页</option>
        </select>
        <div className="join">
          <button className="btn btn-xs join-item" disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>上一页</button>
          <button className="btn btn-xs join-item" disabled={page*pageSize>=total} onClick={()=>setPage((p)=>p+1)}>下一页</button>
        </div>
      </div>
    </div>
  );
}
