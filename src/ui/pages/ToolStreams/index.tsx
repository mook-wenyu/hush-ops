import React, { useEffect, useMemo, useState } from "react";
import { buildGlobalToolStreamExportUrl, fetchGlobalToolStreamChunks, fetchGlobalToolStreamSummaries } from "../../services";
import type { ToolStreamSummary, RuntimeToolStreamPayload } from "../../types/orchestrator";

function isIsoStrict(v: string): boolean {
  if (!v) return false;
  // yyyy-MM-ddTHH:mm:ss(.SSS)Z
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v);
}

export default function ToolStreamsPage() {
  const [onlyErrors, setOnlyErrors] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<ToolStreamSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [details, setDetails] = useState<Record<string, RuntimeToolStreamPayload[]>>({});

  const pageSize = 50;
  const [offset, setOffset] = useState(0);
  const [tool, setTool] = useState('');
  const [execId, setExecId] = useState('');
  const [corrPrefix, setCorrPrefix] = useState('');
  const [updatedAfter, setUpdatedAfter] = useState('');
  const [updatedBefore, setUpdatedBefore] = useState('');

  useEffect(() => {
    // 初始化：从 URL 查询参数恢复筛选与分页
    const sp = new URLSearchParams(location.search);
    const oe = sp.get('onlyErrors');
    if (oe) setOnlyErrors(!(oe === '0' || oe === 'false'));
    setTool(sp.get('tool') ?? '');
    setExecId(sp.get('executionId') ?? '');
    setCorrPrefix(sp.get('correlationPrefix') ?? '');
    setUpdatedAfter(sp.get('updatedAfter') ?? '');
    setUpdatedBefore(sp.get('updatedBefore') ?? '');
    const off = parseInt(sp.get('offset') ?? '0', 10);
    if (!Number.isNaN(off) && off > 0) setOffset(off);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetchGlobalToolStreamSummaries({
      onlyErrors,
      limit: pageSize,
      offset,
      tool: tool || undefined,
      executionId: execId || undefined,
      correlationPrefix: corrPrefix || undefined,
      updatedAfter: isIsoStrict(updatedAfter) ? updatedAfter : undefined,
      updatedBefore: isIsoStrict(updatedBefore) ? updatedBefore : undefined
    })
      .then(({ total, streams }) => {
        if (cancelled) return; setTotal(total); setStreams(streams);
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onlyErrors, offset, tool, execId, corrPrefix, updatedAfter, updatedBefore]);

  useEffect(() => {
    // 将筛选与分页同步到 URL，便于分享/刷新后保持
    const sp = new URLSearchParams();
    if (!onlyErrors) sp.set('onlyErrors','0');
    if (tool) sp.set('tool', tool);
    if (execId) sp.set('executionId', execId);
    if (corrPrefix) sp.set('correlationPrefix', corrPrefix);
    if (isIsoStrict(updatedAfter)) sp.set('updatedAfter', updatedAfter);
    if (isIsoStrict(updatedBefore)) sp.set('updatedBefore', updatedBefore);
    if (offset) sp.set('offset', String(offset));
    const q = sp.toString();
    const url = q ? `?${q}` : location.pathname;
    // 采用微任务调度，降低对计时器/批量渲染节奏的依赖，提升测试稳定性
    queueMicrotask(() => {
      window.history.replaceState(null, '', url);
    });
  }, [onlyErrors, tool, execId, corrPrefix, updatedAfter, updatedBefore, offset]);

  const pages = useMemo(() => Math.ceil(total / pageSize), [total]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">工具流汇总</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="label cursor-pointer gap-2">
          <input type="checkbox" className="checkbox checkbox-sm" checked={onlyErrors} onChange={(e)=>{ setOnlyErrors(e.target.checked); setOffset(0); }} />
          <span className="label-text">仅显示错误</span>
        </label>
        <input className="input input-xs input-bordered" placeholder="Tool contains..." value={tool} onChange={(e)=>{ setTool(e.target.value); setOffset(0); }} />
        <input className="input input-xs input-bordered" placeholder="Execution ID" value={execId} onChange={(e)=>{ setExecId(e.target.value); setOffset(0); }} />
        <input className="input input-xs input-bordered" placeholder="Correlation prefix" value={corrPrefix} onChange={(e)=>{ setCorrPrefix(e.target.value); setOffset(0); }} />
        <input className="input input-xs input-bordered" style={{minWidth:220}} placeholder="Updated After (ISO)" value={updatedAfter} onChange={(e)=>{ setUpdatedAfter(e.target.value); setOffset(0); }} />
        <input className="input input-xs input-bordered" style={{minWidth:220}} placeholder="Updated Before (ISO)" value={updatedBefore} onChange={(e)=>{ setUpdatedBefore(e.target.value); setOffset(0); }} />
        {loading && <span className="opacity-60">加载中…</span>}
        {error && <span className="text-error">{error}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Correlation</th>
              <th>Tool</th>
              <th>Chunks</th>
              <th>Updated</th>
              <th>Status</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => (
              <React.Fragment key={s.correlationId}>
                <tr>
                  <td className="font-mono text-xs">{s.correlationId}</td>
                  <td className="text-xs">{s.toolName}</td>
                  <td>{s.chunkCount}（#{s.latestSequence}）</td>
                  <td className="text-xs opacity-70">{s.updatedAt}</td>
                  <td>{s.hasError ? 'error' : (s.completed ? 'done' : 'running')}</td>
                  <td className="space-x-2">
                    <button className="btn btn-xs" onClick={async()=>{
                      setError(null);
                      try{ const arr = await fetchGlobalToolStreamChunks(s.correlationId); setDetails(prev=>({...prev,[s.correlationId]:arr})); }
                      catch(e){ setError((e as Error).message); }
                    }}>查看</button>
                    <a className="btn btn-xs btn-outline" href={buildGlobalToolStreamExportUrl(s.correlationId, { format: 'json', compress: false })} target="_blank" rel="noreferrer">下载JSON</a>
                    <a className="btn btn-xs btn-outline" href={buildGlobalToolStreamExportUrl(s.correlationId, { format: 'ndjson', compress: false })} target="_blank" rel="noreferrer">下载NDJSON</a>
                  </td>
                </tr>
                {details[s.correlationId] && (
                  <tr>
                    <td colSpan={6}>
                      <div className="text-xs max-h-48 overflow-auto bg-base-200/60 rounded p-2">
                        {(details[s.correlationId] ?? []).map((c,idx)=>(
                          <div key={idx} className="mb-1">
                            <span className="opacity-60">[{c.status ?? 'msg'}] </span>
                            <span className="font-mono">{String(c.message)}</span>
                            {c.error && <span className="text-error"> · {c.error}</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {streams.length === 0 && (
              <tr><td colSpan={6} className="opacity-60">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="join">
          {Array.from({ length: pages }).map((_,i)=> (
            <button key={i} className={"btn btn-xs join-item "+(i*pageSize===offset?"btn-primary":"btn-ghost")} onClick={()=>setOffset(i*pageSize)}>{i+1}</button>
          ))}
        </div>
      )}
    </div>
  );
}
