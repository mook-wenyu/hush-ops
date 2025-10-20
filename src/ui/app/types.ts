/**
 * App 组件类型定义
 */

import { RUNTIME_EXECUTION_STATUSES } from './constants';

/**
 * 运行时执行状态类型
 */
export type RuntimeExecutionStatus = (typeof RUNTIME_EXECUTION_STATUSES)[number];

/**
 * 运行时快照
 */
export interface RuntimeSnapshot {
  readonly planId: string | null;
  readonly executionStatus: RuntimeExecutionStatus;
  readonly running: boolean;
  readonly currentNodeId: string | null;
  readonly completedNodeIds: ReadonlySet<string>;
  readonly pendingNodeIds: ReadonlySet<string>;
}

/**
 * 类型守卫：检查字符串是否为有效的运行时执行状态
 */
export function isRuntimeExecutionStatus(value: string): value is RuntimeExecutionStatus {
  return (RUNTIME_EXECUTION_STATUSES as readonly string[]).includes(value);
}
