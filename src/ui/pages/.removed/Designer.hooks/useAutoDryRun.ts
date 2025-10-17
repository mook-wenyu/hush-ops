import { useCallback, useRef } from "react";
import { compileGraph, simulateDryRun } from "../../../services/orchestratorApi";

interface UseAutoDryRunOpts {
  graph: { nodes: any[]; edges: any[] };
  onDiagnostics?: (list: Array<{ code?: string; severity: string; message: string; nodeId?: string; edgeId?: string }>) => void;
  onTimeline?: (items: unknown[]) => void;
  debounceMs?: number;
}

export function useAutoDryRun(opts: UseAutoDryRunOpts) {
  const { graph, onDiagnostics, onTimeline, debounceMs = 400 } = opts;
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestCall = useRef<string>("");

  const trigger = useCallback(() => {
    // 读取设置：是否启用与去抖间隔
    const enabled = (localStorage.getItem('designer:autoDryRun') ?? '1') === '1';
    const delay = Math.min(800, Math.max(200, Number(localStorage.getItem('designer:autoDryRunDelay') ?? debounceMs) || debounceMs));
    if (!enabled) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      // 取消上一次请求
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const correlationId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      latestCall.current = correlationId;
      try {
        const compiled = await compileGraph(graph, { signal: ac.signal });
        onDiagnostics?.(compiled.diagnostics ?? []);
        // 仅在最新一次调用仍有效时触发模拟
        if (latestCall.current !== correlationId) return;
        const sim = await simulateDryRun(compiled.plan, { signal: ac.signal });
        if (latestCall.current !== correlationId) return;
        onTimeline?.(sim.timeline ?? []);
      } catch (e: any) {
        if (e?.name === "AbortError") return; // 被取消
        // 失败不阻断编辑
      }
    }, delay) as unknown as number;
  }, [graph, debounceMs, onDiagnostics, onTimeline]);

  return trigger;
}
