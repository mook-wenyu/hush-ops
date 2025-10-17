import React, { useEffect, useState } from "react";

export function DesignerSettings() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [delay, setDelay] = useState<number>(400);
  const [onlyRenderVisible, setOnlyRenderVisible] = useState<boolean>(true);

  useEffect(() => {
    const raw = localStorage.getItem('designer:autoDryRun');
    const rawDelay = localStorage.getItem('designer:autoDryRunDelay');
    const rawOnly = localStorage.getItem('designer:onlyRenderVisible');
    if (raw != null) setEnabled(raw === '1');
    if (rawDelay != null) setDelay(Math.min(800, Math.max(200, Number(rawDelay) || 400)));
    if (rawOnly != null) setOnlyRenderVisible(rawOnly !== '0');
  }, []);

  useEffect(() => {
    localStorage.setItem('designer:autoDryRun', enabled ? '1' : '0');
    localStorage.setItem('designer:autoDryRunDelay', String(delay));
    localStorage.setItem('designer:onlyRenderVisible', onlyRenderVisible ? '1' : '0');
    window.dispatchEvent(new CustomEvent('designer:settings-changed', { detail: { autoDryRun: enabled, delay, onlyRenderVisible } }));
  }, [enabled, delay, onlyRenderVisible]);

  return (
    <div className="space-y-2">
      <div className="form-control">
        <label className="label cursor-pointer justify-start gap-3">
          <input type="checkbox" className="toggle toggle-sm" checked={enabled} onChange={(e)=>setEnabled(e.target.checked)} />
          <span className="label-text">自动 dry‑run</span>
        </label>
      </div>
      <div className="form-control">
        <label className="label"><span className="label-text">去抖间隔（ms）</span></label>
        <input type="number" min={200} max={800} step={50} value={delay} onChange={(e)=>setDelay(Number(e.target.value))} className="input input-sm input-bordered w-28" />
      </div>
      <div className="form-control">
        <label className="label cursor-pointer justify-start gap-3">
          <input type="checkbox" className="toggle toggle-sm" checked={onlyRenderVisible} onChange={(e)=>setOnlyRenderVisible(e.target.checked)} />
          <span className="label-text">仅渲染可视区域</span>
        </label>
      </div>
    </div>
  );
}
