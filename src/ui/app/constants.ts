/**
 * App 组件常量定义
 */

/**
 * Bridge 订阅主题
 */
export const TOPICS = ["runtime", "bridge", "execution", "approvals"] as const;

/**
 * 运行时执行状态枚举
 */
export const RUNTIME_EXECUTION_STATUSES = [
  "idle",
  "pending",
  "running",
  "success",
  "failed",
  "cancelled"
] as const;
