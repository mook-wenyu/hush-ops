import React, { useEffect, useMemo, useState, useDeferredValue, useTransition } from "react";
import { buildGlobalToolStreamExportUrl, fetchGlobalToolStreamChunks, fetchGlobalToolStreamSummaries } from "../../services";
import type { ToolStreamSummary, RuntimeToolStreamPayload } from "../../types/orchestrator";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorAlert } from "../../components/ErrorAlert";
import { RetryButton } from "../../components/RetryButton";
import { FilterToolbar } from "../../components/FilterToolbar";

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
  const deferredTool = useDeferredValue(tool);
  const [_isPending, startTransition] = useTransition();
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
    { // 构造仅包含已定义字段的查询对象
      const query: any = { onlyErrors, limit: pageSize, offset };
      if (deferredTool) query.tool = deferredTool;
      if (execId) query.executionId = execId;
      if (corrPrefix) query.correlationPrefix = corrPrefix;
      if (isIsoStrict(updatedAfter)) query.updatedAfter = updatedAfter;
      if (isIsoStrict(updatedBefore)) query.updatedBefore = updatedBefore;
      fetchGlobalToolStreamSummaries(query)
        .then(({ total, streams }) => {
          if (cancelled) return;
          startTransition(() => { setTotal(total); setStreams(streams); });
        })
        .catch((e) => { if (!cancelled) setError((e as Error).message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [onlyErrors, offset, deferredTool, execId, corrPrefix, updatedAfter, updatedBefore]);

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
      <FilterToolbar
        onlyErrors={onlyErrors}
        onOnlyErrorsChange={(v)=>{ setOnlyErrors(v); setOffset(0); }}
        tool={tool}
        onToolChange={(v)=>{ setTool(v); setOffset(0); }}
        executionId={execId}
        onExecutionIdChange={(v)=>{ setExecId(v); setOffset(0); }}
        correlationPrefix={corrPrefix}
        onCorrelationPrefixChange={(v)=>{ setCorrPrefix(v); setOffset(0); }}
        updatedAfter={updatedAfter}
        onUpdatedAfterChange={(v)=>{ setUpdatedAfter(v); setOffset(0); }}
        updatedBefore={updatedBefore}
        onUpdatedBeforeChange={(v)=>{ setUpdatedBefore(v); setOffset(0); }}
      >
        {loading && <LoadingSpinner size="xs" text="加载中…" />}
        {error && (
          <div className="flex items-center gap-2">
            <ErrorAlert message={error} size="xs" />
            <RetryButton size="xs" onClick={()=>{ setOffset(0); setError(null); setLoading(true); }} />
          </div>
        )}
      </FilterToolbar>
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
                    <button className="btn btn-xs min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus:outline-offset-2" onClick={async()=>{
                      setError(null);
                      try{ const arr = await fetchGlobalToolStreamChunks(s.correlationId); setDetails(prev=>({...prev,[s.correlationId]:arr})); }
                      catch(e){ setError((e as Error).message); }
                    }}>查看</button>
                    <a className="btn btn-xs btn-outline min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus:outline-offset-2" href={buildGlobalToolStreamExportUrl(s.correlationId, { format: 'json', compress: false })} target="_blank" rel="noreferrer">下载JSON</a>
                    <a className="btn btn-xs btn-outline min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus:outline-offset-2" href={buildGlobalToolStreamExportUrl(s.correlationId, { format: 'ndjson', compress: false })} target="_blank" rel="noreferrer">下载NDJSON</a>
                  </td>
                </tr>
                {details[s.correlationId] && (
                  <tr>
                    <td colSpan={6}>
                      <div role="log" aria-live="polite" aria-relevant="additions" className="text-xs max-h-48 overflow-auto bg-base-200 rounded p-2">
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
