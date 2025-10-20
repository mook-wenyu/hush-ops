import { useEffect, useMemo, useState } from 'react';
import { fetchSchedules } from '../../services/schedules';
import { executePlanById } from '../../services/plans';
import { reloadSchedules } from '../../services/schedules';
import { getBaseUrl } from '../../services';
import type { ScheduleItem } from '../../services/schedules';
import { filterAndSortSchedules, type SourceFilter, type SortMode } from '../../utils/schedules';
import { ErrorAlert } from '../../components/ErrorAlert';
import { RetryButton } from '../../components/RetryButton';

export default function SchedulesPage() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('nextAsc');
  const [within, setWithin] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const view = useMemo(()=> filterAndSortSchedules(items, source, search, sort, within ?? undefined), [items, source, search, sort, within]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSchedules();
        if (!cancelled) setItems(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Schedules</h1>
        <div className="flex items-center gap-2">
          <a className="btn btn-sm" href={`${getBaseUrl()}/schedules/export?format=json`} target="_blank" rel="noreferrer">导出JSON</a>
          <a className="btn btn-sm" href={`${getBaseUrl()}/schedules/export?format=csv`} target="_blank" rel="noreferrer">导出CSV</a>
        </div>
      </div>
      {error && (
        <div className="mb-3 flex items-center gap-2">
          <ErrorAlert message={error} size="sm" />
          <RetryButton size="sm" onClick={async()=>{
            setMessage(null); setError(null);
            try{
              const cnt = await reloadSchedules();
              setMessage(`已重载调度：${cnt} 条`);
              const data = await fetchSchedules();
              setItems(data);
            }catch(e){ setError((e as Error).message); }
          }} />
        </div>
      )}
      <div className="mb-2 flex items-center gap-2">
        <select className="select select-xs select-bordered" value={source} onChange={(e)=>setSource(e.target.value as any)}>
          <option value="all">全部来源</option>
          <option value="repo">repo</option>
          <option value="config">config</option>
        </select>
        <input className="input input-xs input-bordered" placeholder="搜索 planId 或文件名" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <select className="select select-xs select-bordered" value={within ?? ''} onChange={(e)=>{
          const v = e.target.value; setWithin(v===''?null:Number(v));
        }}>
          <option value="">未来任意时间</option>
          <option value="5">未来 5 分钟</option>
          <option value="15">未来 15 分钟</option>
          <option value="60">未来 60 分钟</option>
        </select>
        <button className="btn btn-xs" onClick={()=> setSort(sort==='nextAsc'?'nextDesc':'nextAsc') }>
          按 Next {sort==='nextAsc'?'↑':'↓'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Cron</th>
              <th>Next Run</th>
              <th>Last Run</th>
              <th>Source</th>
              <th>File</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {view.slice((page-1)*pageSize, (page-1)*pageSize + pageSize).map((it) => (
              <tr key={`${it.dir}/${it.file}`}>
                <td>{it.planId}</td>
                <td><code>{it.cron}</code></td>
                <td>{it.nextRunISO ?? '-'}</td>
                <td>{it.lastRun ? (<a className="link link-hover" href={`#/executions/${it.lastRun.executionId}`}>{it.lastRun.status}{it.lastRun.finishedAt ? ` @ ${it.lastRun.finishedAt}` : ''}</a>) : '-'}</td>
                <td><span className="badge badge-ghost badge-xs">{it.source}</span></td>
                <td className="opacity-70">{it.file}</td>
                <td>
                  <button className="btn btn-xs" onClick={async ()=>{
                    setMessage(null); setError(null);
                    try {
                      const res = await executePlanById(it.planId);
                      setMessage(`Triggered ${res.planId} → ${res.executionId}`);
                    } catch(e){
                      setError((e as Error).message);
                    }
                  }}>Run</button>
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={7} className="opacity-60">No schedules found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <div className="alert alert-success mt-3">{message}</div>}

      <div className="mt-2 flex items-center gap-2 justify-end">
        <span className="text-xs opacity-70">共 {view.length} 条</span>
        <select className="select select-xs select-bordered" value={pageSize} onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1); }}>
          <option value={10}>10/页</option>
          <option value={20}>20/页</option>
          <option value={50}>50/页</option>
        </select>
        <div className="join">
          <button className="btn btn-xs join-item" disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>上一页</button>
          <button className="btn btn-xs join-item" disabled={page*pageSize>=view.length} onClick={()=>setPage((p)=>p+1)}>下一页</button>
        </div>
      </div>

    </div>
  );
}
