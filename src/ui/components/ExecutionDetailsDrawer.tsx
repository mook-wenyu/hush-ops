import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchExecutionById, fetchExecutionToolStreamChunks, fetchExecutionToolStreamSummaries, getBaseUrl, replayExecutionToolStream } from '../services';
import type { ExecutionRecord, RuntimeToolStreamPayload, ToolStreamSummary } from '../types/orchestrator';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorAlert } from './ErrorAlert';
import { RetryButton } from './RetryButton';

export interface ExecutionDetailsDrawerProps {
  executionId: string | null;
  onClose: () => void;
}

export function ExecutionDetailsDrawer({ executionId, onClose }: ExecutionDetailsDrawerProps) {
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [streams, setStreams] = useState<ToolStreamSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RuntimeToolStreamPayload[]>>({});
  const [onlyErrors, setOnlyErrors] = useState(true);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // 打开/关闭
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (executionId) {
      try { dlg.showModal(); } catch {}
      // 抓取数据
      void load();
    } else {
      if (dlg.open) dlg.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId]);

  async function load() {
    if (!executionId) return;
    setError(null); setMessage(null); setLoading(true);
    try {
      const [data, sums] = await Promise.all([
        fetchExecutionById(executionId),
        fetchExecutionToolStreamSummaries(executionId)
      ]);
      setRecord(data); setStreams(sums);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const visibleDetails = useMemo(() => {
    if (!onlyErrors) return details;
    const next: typeof details = {};
    for (const [k, arr] of Object.entries(details)) {
      next[k] = (arr ?? []).filter(c => c.status === 'error' || !!c.error);
    }
    return next;
  }, [details, onlyErrors]);

  return (
    <dialog ref={dialogRef} id="exec-details-drawer" className="modal">
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
      <div className="modal-box w-11/12 max-w-5xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">执行详情{record ? `：${record.id}` : ''}</h3>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={() => void load()}>刷新</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
          </div>
        </div>
        {error && <ErrorAlert message={error} />}
        {loading && <LoadingSpinner size="sm" text="加载中…" />}
        {!loading && record && (
          <div className="space-y-3">
            <div className="text-sm opacity-80">计划：{record.planId} · 状态：{record.status} · 类型：{record.executorType}</div>
            <div className="text-xs opacity-60">开始：{record.startedAt ?? '-'} · 结束：{record.finishedAt ?? '-'}</div>
            {record.error?.message && <div className="alert alert-warning mt-2">{record.error.message}</div>}

            <div>
              <h4 className="font-semibold mb-1">工具流摘要</h4>
              {message && <div className="alert alert-success mb-2">{message}</div>}
              <div className="mb-2 flex items-center gap-2 text-sm">
                <label className="label cursor-pointer gap-2">
                  <input type="checkbox" className="checkbox checkbox-sm" checked={onlyErrors} onChange={(e)=> setOnlyErrors(e.target.checked)} />
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
                    {streams.map((s) => (
                      <React.Fragment key={s.correlationId}>
                        <tr>
                          <td className="font-mono text-xs">{s.toolName}</td>
                          <td>{s.chunkCount}（#{s.latestSequence}）</td>
                          <td className="text-xs opacity-70">{s.updatedAt}</td>
                          <td>{s.hasError ? 'error' : (s.completed ? 'done' : 'running')}</td>
                          <td className="space-x-2">
                            <button className="btn btn-xs min-h-6" disabled={loadingId===s.correlationId} onClick={async()=>{
                              setLoadingId(s.correlationId); setError(null); setMessage(null);
                              try { const arr = await fetchExecutionToolStreamChunks(record.id, s.correlationId); setDetails(prev=>({...prev,[s.correlationId]:arr})); }
                              catch(e){ setError((e as Error).message); }
                              finally{ setLoadingId(null); }
                            }}>查看</button>
                            <button className="btn btn-xs btn-outline min-h-6" disabled={loadingId===s.correlationId} onClick={async()=>{
                              setLoadingId(s.correlationId); setError(null); setMessage(null);
                              try { const n = await replayExecutionToolStream(record.id, s.correlationId); setMessage(`已重放 ${n} 条记录`); }
                              catch(e){ setError((e as Error).message); }
                              finally{ setLoadingId(null); }
                            }}>重放</button>
                            <a className="btn btn-xs btn-outline min-h-6" href={`${getBaseUrl()}/executions/${record.id}/tool-streams/${s.correlationId}/export?format=json&compress=0`} target="_blank" rel="noreferrer">下载JSON</a>
                          </td>
                        </tr>
                        {visibleDetails[s.correlationId] && (
                          <tr>
                            <td colSpan={5}>
                              <div className="text-xs max-h-48 overflow-auto bg-base-200 rounded p-2">
                                {(visibleDetails[s.correlationId] ?? []).map((c,idx)=>(
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
                      <tr><td colSpan={5} className="opacity-60">暂无工具流</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-2">
            <RetryButton size="xs" onClick={() => void load()} />
          </div>
        )}
      </div>
    </dialog>
  );
}
