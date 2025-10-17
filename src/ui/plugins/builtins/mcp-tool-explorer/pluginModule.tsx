import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";

import type { ToolStreamSummary } from "../../../types/orchestrator";
import type {
  PluginRuntime,
  PluginToolDescriptor,
  PluginManifest,
  PluginToolStreamEvent
} from "../../runtime";
import { MemoVirtualList } from "../../../components/VirtualList";

const refreshListeners = new Set<() => void>();

function notifyRefresh(): void {
  for (const listener of refreshListeners) {
    listener();
  }
}

interface ToolChunkEntry {
  readonly sequence?: number;
  readonly message: string;
  readonly replayed?: boolean;
  readonly status?: "start" | "success" | "error";
  readonly timestamp: string;
  readonly source?: string;
}

interface ToolResultMeta {
  readonly toolName: string;
  readonly correlationId?: string;
  readonly receivedAt: string;
  readonly entries: readonly ToolChunkEntry[];
  readonly latestStatus?: "start" | "success" | "error";
  readonly completed: boolean;
  readonly lastError?: string;
  readonly finalResult?: unknown;
}

function renderStructuredResult(value: unknown): JSX.Element {
  if (value === null || value === undefined) {
    return <span className="text-xs text-base-content/60">未返回结果</span>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return renderStructuredResult(parsed);
      } catch {
        // fall through to plain rendering if JSON.parse fails
      }
    }
    return <pre className="mockup-code whitespace-pre-wrap break-words text-xs">{value}</pre>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <pre className="mockup-code whitespace-pre-wrap break-words text-xs">{String(value)}</pre>;
  }
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    const rows = value as Array<Record<string, unknown>>;
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
    return (
      <div className="overflow-x-auto">
        <table className="table table-zebra table-xs">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`row-${index}`}>
                {columns.map((column) => (
                  <td key={`${index}-${column}`} className="max-w-xs whitespace-pre-wrap break-words">
                    {typeof row[column] === "object" ? JSON.stringify(row[column], null, 2) : String(row[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <pre className="mockup-code whitespace-pre-wrap break-words text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function upsertChunkEntry(entries: readonly ToolChunkEntry[], next: ToolChunkEntry): ToolChunkEntry[] {
  const buffer = [...entries];
  if (typeof next.sequence === "number") {
    const index = buffer.findIndex((item) => typeof item.sequence === "number" && item.sequence === next.sequence);
    if (index >= 0) {
      buffer[index] = next;
    } else {
      buffer.push(next);
    }
  } else {
    buffer.push(next);
  }
  buffer.sort((a, b) => {
    if (typeof a.sequence === "number" && typeof b.sequence === "number") {
      return a.sequence - b.sequence;
    }
    if (typeof a.sequence === "number") {
      return -1;
    }
    if (typeof b.sequence === "number") {
      return 1;
    }
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
  return buffer;
}

function ToolExplorerPanel({ runtime }: { runtime: PluginRuntime }) {
  const [tools, setTools] = useState<readonly PluginToolDescriptor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMap, setResultMap] = useState<Record<string, ToolResultMeta>>({});
  const [invokingToolId, setInvokingToolId] = useState<string | null>(null);
  const [filterKeyword, setFilterKeyword] = useState("");
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [historySummaries, setHistorySummaries] = useState<readonly ToolStreamSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<
    { correlationId: string; events: readonly PluginToolStreamEvent[] } | null
  >(null);

  const bridge = runtime.getBridge();
  const supportsInvocation = runtime.supportsToolInvocation();
  const supportsReplay = runtime.supportsToolReplay();
  const supportsHistory = supportsReplay || typeof bridge.listToolStreamSummaries === "function";

  useEffect(() => {
    setHistorySummaries([]);
    setSelectedHistory(null);
    setHistoryError(null);
  }, [activeExecutionId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await runtime.listTools();
      setTools(list);
    } catch (err) {
      setError((err as Error).message ?? "加载 MCP 工具列表失败");
    } finally {
      setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    refresh().catch((err) => setError((err as Error).message ?? "加载失败"));
    const listener = () => {
      refresh().catch((err) => setError((err as Error).message ?? "加载失败"));
    };
    refreshListeners.add(listener);
    return () => {
      refreshListeners.delete(listener);
    };
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = runtime.subscribeBridgeOutput((event) => {
      if (event.executionId) {
        setActiveExecutionId(event.executionId);
      }
      setResultMap((prev) => {
        const key = event.toolName;
        const existing = prev[key];
        const displayMessage = typeof event.message === "string" && event.message.length > 0
          ? event.message
          : typeof event.error === "string" && event.error.length > 0
            ? event.error
            : "";
        let nextEntries = existing ? [...existing.entries] : [];
        if (displayMessage) {
          const entry: ToolChunkEntry = {
            sequence: typeof event.sequence === "number" ? event.sequence : undefined,
            message: displayMessage,
            replayed: Boolean(event.replayed),
            status: event.status,
            timestamp: event.timestamp,
            source: event.source
          };
          nextEntries = upsertChunkEntry(nextEntries, entry);
        }
        const nextStatus = event.status ?? existing?.latestStatus;
        const completed =
          nextStatus === "success" || nextStatus === "error"
            ? true
            : existing?.completed ?? false;
        const nextLastError =
          nextStatus === "error"
            ? (event.error ?? (displayMessage || existing?.lastError) ?? existing?.lastError)
            : existing?.lastError;
        const nextFinalResult =
          typeof event.result !== "undefined" ? event.result : existing?.finalResult;
        const nextMeta: ToolResultMeta = {
          toolName: event.toolName,
          correlationId: event.correlationId ?? existing?.correlationId,
          receivedAt: event.timestamp,
          entries: nextEntries,
          latestStatus: nextStatus,
          completed,
          lastError: nextLastError ?? undefined,
          finalResult: nextFinalResult
        };
        return {
          ...prev,
          [key]: nextMeta
        };
      });
    });
    return unsubscribe;
  }, [runtime]);

  const loadHistory = useCallback(async () => {
    if (!supportsHistory) {
      setHistoryError("当前运行时不支持历史查询");
      return;
    }
    if (!activeExecutionId) {
      setHistoryError("尚未检测到执行 ID");
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const summaries = await runtime.listToolStreamSummaries(activeExecutionId);
      setHistorySummaries(summaries);
      setSelectedHistory(null);
    } catch (err) {
      setHistoryError((err as Error).message ?? "加载历史记录失败");
    } finally {
      setHistoryLoading(false);
    }
  }, [supportsHistory, activeExecutionId, runtime]);

  const viewHistory = useCallback(
    async (summary: ToolStreamSummary) => {
      if (!activeExecutionId) {
        setHistoryError("尚未检测到执行 ID");
        return;
      }
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const events = await runtime.fetchToolStreamChunks(activeExecutionId, summary.correlationId);
        setSelectedHistory({ correlationId: summary.correlationId, events });
      } catch (err) {
        setHistoryError((err as Error).message ?? "加载历史明细失败");
      } finally {
        setHistoryLoading(false);
      }
    },
    [activeExecutionId, runtime]
  );

  const replayHistory = useCallback(
    async (summary: ToolStreamSummary) => {
      if (!supportsReplay) {
        setHistoryError("当前运行时不支持重放");
        return;
      }
      if (!activeExecutionId) {
        setHistoryError("尚未检测到执行 ID");
        return;
      }
      try {
        setHistoryError(null);
        await runtime.replayToolStream(activeExecutionId, summary.correlationId);
      } catch (err) {
        setHistoryError((err as Error).message ?? "重放流式输出失败");
      }
    },
    [supportsReplay, activeExecutionId, runtime]
  );

  const handleInvoke = useCallback(
    async (toolName: string) => {
      if (!supportsInvocation) {
        return;
      }
      setInvokingToolId(toolName);
      setError(null);
      try {
        const response = await runtime.callTool(toolName, { input: "Hello from hush-ops" });
        setResultMap((prev) => ({
          ...prev,
          [toolName]: {
            toolName,
            correlationId: undefined,
            receivedAt: new Date().toISOString(),
            entries: [],
            latestStatus: "success",
            completed: true,
            finalResult: response
          }
        }));
      } catch (err) {
        setError((err as Error).message ?? "调用 MCP 工具失败");
      } finally {
        setInvokingToolId(null);
      }
    },
    [runtime, supportsInvocation]
  );

  const renderedTools = useMemo(() => {
    if (!filterKeyword.trim()) {
      return tools;
    }
    const keyword = filterKeyword.trim().toLowerCase();
    return tools.filter((tool) => {
      return [tool.name, tool.description]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(keyword));
    });
  }, [filterKeyword, tools]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-outline btn-sm" onClick={refresh} disabled={loading}>
            {loading ? "刷新中…" : "刷新工具列表"}
          </button>
          {!supportsInvocation && (
            <span className="badge badge-warning badge-sm">当前桥接模式不支持直接调用</span>
          )}
        </div>
        <label className="input input-sm input-bordered flex items-center gap-2 max-w-md">
          <span className="text-xs">筛选</span>
          <input
            type="text"
            className="grow"
            placeholder="输入名称或描述关键字"
            value={filterKeyword}
            onChange={(event) => setFilterKeyword(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}
      {renderedTools.length === 0 && !loading && (
        <p className="text-sm text-base-content/70">未找到匹配的 MCP 工具。</p>
      )}
      <ul className="space-y-3">
        {renderedTools.map((tool) => {
          const meta = resultMap[tool.name];
          const structuredValue =
            meta?.finalResult ?? (meta?.entries.length ? meta.entries.map((entry) => entry.message).join("\n") : undefined);
          const hasReplay = meta?.entries.some((entry) => entry.replayed) ?? false;
          const statusLabel = meta
            ? meta.completed
              ? meta.latestStatus === "success"
                ? "已完成"
                : "执行失败"
              : "进行中"
            : "未触发";
          const entryLines = meta?.entries.length
            ? meta.entries
                .map((entry) => {
                  const prefixParts = [
                    typeof entry.sequence === "number" ? `#${entry.sequence}` : null,
                    entry.status,
                    entry.replayed ? "重放" : null,
                    entry.source ?? null
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  return `${prefixParts ? `[${prefixParts}] ` : ""}${entry.message}`;
                })
                .join("\n")
            : "";
          return (
            <li key={tool.name} className="card bg-base-200/70 border border-base-content/10 shadow-sm">
              <div className="card-body space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base-content">{tool.name}</span>
                      {tool.riskLevel && (
                        <span className="badge badge-outline badge-sm uppercase">
                          风险 {tool.riskLevel}
                        </span>
                      )}
                      {hasReplay && <span className="badge badge-info badge-outline badge-sm">含重放</span>}
                    </div>
                    {tool.description && (
                      <p className="text-xs text-base-content/70">{tool.description}</p>
                    )}
                  </div>
                  {supportsInvocation && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => handleInvoke(tool.name)}
                      disabled={invokingToolId === tool.name}
                    >
                      {invokingToolId === tool.name ? "调用中…" : "试运行"}
                    </button>
                  )}
                </div>
                {meta && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/60">
                      <div className="flex items-center gap-2">
                        <span>最新结果</span>
                        {meta.correlationId && (
                          <span className="badge badge-outline badge-xs">
                            CID {meta.correlationId.slice(-6)}
                          </span>
                        )}
                        <span className="badge badge-outline badge-xs">{statusLabel}</span>
                      </div>
                      <span>接收于 {new Date(meta.receivedAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="bg-base-300/60 rounded p-2 border border-base-content/10">
                      {renderStructuredResult(structuredValue ?? null)}
                    </div>
                    {meta.entries.length > 0 ? (
                      <div className="bg-base-300/40 rounded p-2 border border-dashed border-base-content/20 space-y-1">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-base-content/50">
                          <span>事件轨迹</span>
                          <span>{statusLabel}</span>
                        </div>
                        <pre className="mockup-code whitespace-pre-wrap break-words text-xs">
                          {entryLines}
                        </pre>
                      </div>
                    ) : null}
                    {meta.lastError && (
                      <div className="alert alert-warning text-xs">
                        <span>{meta.lastError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {supportsHistory && (
        <div className="rounded-lg border border-base-content/10 bg-base-200/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-base-content/70">
            <span>
              {activeExecutionId ? `当前执行 ${activeExecutionId.slice(-8)}` : "等待实时事件以获取执行 ID"}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={loadHistory}
              disabled={historyLoading || !activeExecutionId}
            >
              {historyLoading ? "载入中…" : "加载历史流"}
            </button>
          </div>
          {historyError && (
            <div className="alert alert-error text-xs">
              <span>{historyError}</span>
            </div>
          )}
          {historySummaries.length > 0 ? (
            <ul className="space-y-2">
              {historySummaries.map((summary) => {
                const correlationLabel = summary.correlationId.slice(-8);
                const updatedTime = summary.updatedAt ? new Date(summary.updatedAt) : null;
                const updatedLabel =
                  updatedTime && !Number.isNaN(updatedTime.valueOf())
                    ? updatedTime.toLocaleString()
                    : summary.updatedAt;
                return (
                  <li
                    key={summary.correlationId}
                    className="card border border-base-content/10 bg-base-100/60 shadow-sm"
                  >
                    <div className="card-body space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-base-content">
                            <span>{summary.toolName}</span>
                            <span className="badge badge-outline badge-xs">CID {correlationLabel}</span>
                            {summary.hasError && <span className="badge badge-warning badge-xs">有错误</span>}
                            {summary.completed ? (
                              <span className="badge badge-success badge-xs">已完成</span>
                            ) : (
                              <span className="badge badge-outline badge-xs">未完成</span>
                            )}
                          </div>
                          <div className="text-[11px] text-base-content/60">
                            更新于 {updatedLabel} · 片段 {summary.chunkCount}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => viewHistory(summary)}
                            disabled={historyLoading}
                          >
                            查看
                          </button>
                          {supportsReplay && (
                            <button
                              type="button"
                              className="btn btn-outline btn-xs"
                              onClick={() => replayHistory(summary)}
                            >
                              重放
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            !historyLoading && (
              <p className="text-xs text-base-content/60">
                {activeExecutionId ? "暂无历史流记录，执行完成后可刷新。" : "等待实时事件后可加载历史流。"}
              </p>
            )
          )}
          {selectedHistory && (
            <div className="space-y-1 rounded border border-dashed border-base-content/20 bg-base-300/40 p-2">
              <div className="flex items-center justify-between text-xs text-base-content/70">
                <span>历史输出 CID {selectedHistory.correlationId.slice(-8)}</span>
                <span className="text-[10px] text-base-content/50">{selectedHistory.events.length} 条记录</span>
              </div>
              <div className="mockup-code whitespace-pre-wrap break-words text-xs">
                <MemoVirtualList
                  items={selectedHistory.events}
                  estimateSize={18}
                  overscan={4}
                  height={260}
                  roleLabel="工具流历史明细"
                  renderItem={(event) => {
                    const origin = event.source && event.source !== "live" ? event.source : null;
                    const parts = [
                      typeof event.sequence === "number" ? `#${event.sequence}` : null,
                      event.status ?? null,
                      event.replayed ? "重放" : null,
                      origin
                    ].filter(Boolean);
                    const prefix = parts.length ? `[${parts.join(" | ")}] ` : "";
                    const content = event.status === "error" ? event.error ?? event.message : event.message;
                    return <div className="py-0.5">{prefix}{content}</div>;
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export async function register(runtime: PluginRuntime, _manifest: PluginManifest): Promise<void> {
  runtime.registerPanel({
    id: "core:mcp-tool-explorer",
    title: "MCP 工具浏览器",
    description: "查看可用 MCP 工具并快速试运行",
    render: () => <ToolExplorerPanel runtime={runtime} />
  });

  runtime.registerCommand({
    id: "core:mcp-tool-explorer:refresh",
    label: "刷新 MCP 工具",
    onClick: () => {
      notifyRefresh();
    },
    priority: 50,
    tooltip: "重新加载 MCP 工具列表"
  });
}
