/**
 * App 组件工具函数
 */

import type { ExecutionRecord } from '../types/orchestrator';

/**
 * 从执行记录列表中提取所有待审批项
 */
export function extractPending(entries: ExecutionRecord[]): ExecutionRecord["pendingApprovals"] {
  return entries.flatMap((execution) => execution.pendingApprovals);
}

/**
 * 标准化错误消息
 * @param input - 任意类型的错误输入
 * @param fallback - 默认消息
 * @returns 格式化后的错误消息字符串
 */
export function normalizeErrorMessage(input: unknown, fallback: string): string {
  if (!input) {
    return fallback;
  }
  if (typeof input === "string") {
    return input;
  }
  if (typeof input === "object") {
    const candidate = input as { message?: unknown };
    if (typeof candidate.message === "string") {
      return candidate.message;
    }
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
