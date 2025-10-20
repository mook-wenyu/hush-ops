import { useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { fetchExecutionById, fetchExecutionToolStreamSummaries, fetchExecutionToolStreamChunks, replayExecutionToolStream, getBaseUrl } from '../../services';
import type { ExecutionRecord, ToolStreamSummary, RuntimeToolStreamPayload } from '../../types/orchestrator';

export default function ExecutionPage() {
  const params = useParams({ from: '/executions/$id' });
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [streams, setStreams] = useState<ToolStreamSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RuntimeToolStreamPayload[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchExecutionById(params.id);
        const s = await fetchExecutionToolStreamSummaries(params.id);
        if (!cancelled) { setRecord(data); setStreams(s); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!record) return <div className="opacity-60">加载中…</div>;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">执行详情：{record.id}</h1>
      <div className="text-sm opacity-80">计划：{record.planId} · 状态：{record.status} · 类型：{record.executorType}</div>
      <div className="text-xs opacity-60">开始：{record.startedAt ?? '-'} · 结束：{record.finishedAt ?? '-'}</div>
      {record.error?.message && <div className="alert alert-warning mt-2">{record.error.message}</div>}

      <div>
        <h2 className="font-semibold mb-1">待审批</h2>
        {record.pendingApprovals.length === 0 ? (
          <div className="text-sm opacity-60">无</div>
        ) : (
          <ul className="list-disc list-inside text-sm">
            {record.pendingApprovals.map(p => (
              <li key={p.id}>{p.id} · {p.nodeId} · {p.riskLevel}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-semibold mb-1">工具流摘要</h2>
        {message && <div className="alert alert-success mb-2">{message}</div>}
        <div className="mb-2 flex items-center gap-2">
          <label className="label cursor-pointer gap-2 text-xs">
            <input type="checkbox" className="checkbox checkbox-xs" onChange={(e)=>{
              const only = e.target.checked; setDetails(prev=>{
                const next: typeof prev = {}; Object.entries(prev).forEach(([k, arr])=>{
                  next[k] = only ? arr.filter(c=> (c.status==='error' || !!c.error)) : arr; }); return next; });
            }} />
            <span className="label-text">仅显示错误</span>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Chunks</th>
                <th>Updated</th>
                <th>Status</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {streams.map(s => (
                <>
                <tr key={s.correlationId}>
                  <td className="font-mono text-xs">{s.toolName}</td>
                  <td>{s.chunkCount}（#{s.latestSequence}）</td>
                  <td className="text-xs opacity-70">{s.updatedAt}</td>
                  <td>{s.hasError ? 'error' : (s.completed ? 'done' : 'running')}</td>
                  <td className="space-x-2">
                    <button className="btn btn-xs min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus:outline-offset-2" disabled={loadingId===s.correlationId} onClick={async()=>{
                      setLoadingId(s.correlationId); setError(null); setMessage(null);
                      try{ const arr = await fetchExecutionToolStreamChunks(params.id, s.correlationId); setDetails(prev=>({...prev,[s.correlationId]:arr})); }
                      catch(e){ setError((e as Error).message); }
                      finally{ setLoadingId(null); }
                    }}>查看</button>
                    <button className="btn btn-xs btn-outline min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus:outline-offset-2" disabled={loadingId===s.correlationId} onClick={async()=>{
                      setLoadingId(s.correlationId); setError(null); setMessage(null);
                      try{ const n = await replayExecutionToolStream(params.id, s.correlationId); setMessage(`已重放 ${n} 条记录`); }
                      catch(e){ setError((e as Error).message); }
                      finally{ setLoadingId(null); }
                    }}>重放</button>
                  </td>
                </tr>
                {details[s.correlationId] && (
                  <tr>
                    <td colSpan={5}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs opacity-70">{s.toolName} · {s.correlationId}</span>
                        <button className="btn btn-xs btn-outline" onClick={async()=>{
                          try { await navigator.clipboard?.writeText(JSON.stringify(details[s.correlationId], null, 2)); setMessage('已复制 JSON'); } catch { /* ignore */ }
                        }}>复制JSON</button>
                        <a className="btn btn-xs min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus:outline-offset-2" href={`${getBaseUrl()}/executions/${params.id}/tool-streams/${s.correlationId}/export?format=json&compress=0`} target="_blank" rel="noreferrer">下载JSON</a>
                      </div>
                      <div role="log" aria-live="polite" aria-relevant="additions" className="text-xs max-h-48 overflow-auto bg-base-200 rounded p-2">
                        {(details[s.correlationId] ?? []).map((c,idx)=>(
                          <div key={idx} className="mb-1">
                            <span className="opacity-60">[{c.status ?? 'msg'}] </span>
                            <span className="font-mono">{c.message}</span>
                            {c.error && <span className="text-error"> · {c.error}</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </>
              ))}
              {streams.length === 0 && (
                <tr><td colSpan={5} className="opacity-60">暂无工具流</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
