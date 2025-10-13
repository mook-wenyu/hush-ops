import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";

import { usePluginCommands } from "../plugins/runtime";
import type { PluginCommandDefinition } from "../plugins/runtime";

interface PlanActionsProps {
  planValue: string;
  onPlanChange: (value: string) => void;
  onDryRun: () => Promise<void>;
  onExecute: () => Promise<void>;
  serverOptions: readonly { name: string; description?: string }[];
  selectedServer: string | null;
  onServerChange: (value: string | null) => void;
  serverError: string | null;
  warnings: string[];
  message: string | null;
  busy: boolean;
  disabled: boolean;
  error: string | null;
}

export function PlanActions({
  planValue,
  onPlanChange,
  onDryRun,
  onExecute,
  serverOptions,
  selectedServer,
  onServerChange,
  serverError,
  warnings,
  message,
  busy,
  disabled,
  error
}: PlanActionsProps) {
  const pluginCommands = usePluginCommands();
  const [pluginPendingId, setPluginPendingId] = useState<string | null>(null);
  const [pluginMessage, setPluginMessage] = useState<string | null>(null);
  const [pluginError, setPluginError] = useState<string | null>(null);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onPlanChange(event.target.value);
    },
    [onPlanChange]
  );

  const handleDryRunClick = useCallback(() => {
    void onDryRun();
  }, [onDryRun]);

  const handleExecuteClick = useCallback(() => {
    void onExecute();
  }, [onExecute]);

  const handleServerChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      onServerChange(value.length > 0 ? value : null);
    },
    [onServerChange]
  );

  const handlePluginCommandClick = useCallback((command: PluginCommandDefinition) => {
    try {
      setPluginError(null);
      setPluginMessage(null);
      const result = command.onClick();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setPluginPendingId(command.id);
        (result as Promise<unknown>)
          .then(() => {
            setPluginMessage(`命令 ${command.label} 执行完成`);
          })
          .catch((error) => {
            console.error("插件命令执行失败", { id: command.id, error });
            setPluginError(`命令 ${command.label} 执行失败：${(error as Error).message ?? "未知错误"}`);
          })
          .finally(() => {
            setPluginPendingId((current) => (current === command.id ? null : current));
          });
      } else {
        setPluginMessage(`命令 ${command.label} 已执行`);
      }
    } catch (error) {
      console.error("插件命令触发异常", { id: command.id, error });
      setPluginError(`命令 ${command.label} 触发异常：${(error as Error).message ?? "未知错误"}`);
    }
  }, []);

  return (
    <div className="card bg-base-300/70 shadow-xl">
      <div className="card-body space-y-4">
        <div>
          <h2 className="card-title text-lg">计划控制</h2>
          <p className="text-sm text-base-content/70">
            将 Plan JSON 粘贴到下方并执行 dry-run 或自动执行；桥接未连接时所有操作将自动禁用。
          </p>
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="form-control w-full max-w-sm">
            <div className="label">
              <span className="label-text text-xs">MCP 服务器</span>
            </div>
            <select
              className="select select-bordered select-sm"
              value={selectedServer ?? ""}
              onChange={handleServerChange}
              disabled={busy || disabled || serverOptions.length === 0}
            >
              {serverOptions.length === 0 ? (
                <option value="">无可用配置</option>
              ) : (
                serverOptions.map((server) => (
                  <option key={server.name} value={server.name}>
                    {server.description ? `${server.name} · ${server.description}` : server.name}
                  </option>
                ))
              )}
            </select>
          </label>
          {serverError && (
            <div className="alert alert-warning text-xs">
              <span>{serverError}</span>
            </div>
          )}
        </div>
        <textarea
          value={planValue}
          onChange={handleInputChange}
          className="textarea textarea-bordered w-full font-mono text-sm"
          rows={12}
          spellCheck={false}
          placeholder={'{ "id": "example", ... }'}
          disabled={busy || disabled}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleDryRunClick}
            disabled={busy || disabled}
          >
            {busy ? "dry-run 中…" : "dry-run"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleExecuteClick}
            disabled={busy || disabled || !selectedServer}
          >
            {busy ? "执行中…" : "执行计划"}
          </button>
          {pluginCommands.map((command) => (
            <button
              key={command.id}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handlePluginCommandClick(command)}
              disabled={busy || disabled || !selectedServer || pluginPendingId === command.id}
              title={command.tooltip}
              aria-label={command.tooltip ?? command.label}
            >
              {pluginPendingId === command.id ? "执行中…" : command.label}
            </button>
          ))}
        </div>

        {pluginMessage && (
          <div className="alert alert-info text-xs">
            <span>{pluginMessage}</span>
          </div>
        )}
        {pluginError && (
          <div className="alert alert-error text-xs">
            <span>{pluginError}</span>
          </div>
        )}

        {message && (
          <div className="alert alert-success text-sm">
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="alert alert-error text-sm">
            <span>{error}</span>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="alert alert-warning text-sm flex flex-col gap-2">
            <strong>Dry-run 警告：</strong>
            <ul className="list-disc list-inside space-y-1 text-xs">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
