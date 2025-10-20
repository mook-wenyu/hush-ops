import React, { useMemo } from "react";

export interface FilterToolbarProps {
  onlyErrors?: boolean;
  onOnlyErrorsChange?: (v: boolean) => void;
  tool?: string;
  onToolChange?: (v: string) => void;
  executionId?: string;
  onExecutionIdChange?: (v: string) => void;
  correlationPrefix?: string;
  onCorrelationPrefixChange?: (v: string) => void;
  updatedAfter?: string;
  onUpdatedAfterChange?: (v: string) => void;
  updatedBefore?: string;
  onUpdatedBeforeChange?: (v: string) => void;
  children?: React.ReactNode;
}

function isIsoStrict(v: string | undefined): boolean {
  if (!v) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v);
}

export function FilterToolbar(props: FilterToolbarProps) {
  const {
    onlyErrors = false,
    onOnlyErrorsChange,
    tool = "",
    onToolChange,
    executionId = "",
    onExecutionIdChange,
    correlationPrefix = "",
    onCorrelationPrefixChange,
    updatedAfter = "",
    onUpdatedAfterChange,
    updatedBefore = "",
    onUpdatedBeforeChange,
    children,
  } = props;

  const hasTimeA = useMemo(() => isIsoStrict(updatedAfter), [updatedAfter]);
  const hasTimeB = useMemo(() => isIsoStrict(updatedBefore), [updatedBefore]);

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {onOnlyErrorsChange && (
        <label className="label cursor-pointer gap-2">
          <input type="checkbox" className="checkbox checkbox-sm" checked={onlyErrors} onChange={(e)=> onOnlyErrorsChange?.(e.target.checked)} />
          <span className="label-text">仅显示错误</span>
        </label>
      )}
      {onToolChange && (
        <input className="input input-xs input-bordered" placeholder="Tool contains..." value={tool} onChange={(e)=> onToolChange?.(e.target.value)} />
      )}
      {onExecutionIdChange && (
        <input className="input input-xs input-bordered" placeholder="Execution ID" value={executionId} onChange={(e)=> onExecutionIdChange?.(e.target.value)} />
      )}
      {onCorrelationPrefixChange && (
        <input className="input input-xs input-bordered" placeholder="Correlation prefix" value={correlationPrefix} onChange={(e)=> onCorrelationPrefixChange?.(e.target.value)} />
      )}
      {onUpdatedAfterChange && (
        <input className="input input-xs input-bordered" style={{minWidth:220}} placeholder="Updated After (ISO)" value={updatedAfter} onChange={(e)=> onUpdatedAfterChange?.(e.target.value)} />
      )}
      {onUpdatedBeforeChange && (
        <input className="input input-xs input-bordered" style={{minWidth:220}} placeholder="Updated Before (ISO)" value={updatedBefore} onChange={(e)=> onUpdatedBeforeChange?.(e.target.value)} />
      )}
      {children}
      {(hasTimeA || hasTimeB) && (
        <span className="text-xs opacity-60">时间格式需严格 ISO，如 2025-10-18T12:00:00Z</span>
      )}
    </div>
  );
}

export default FilterToolbar;
