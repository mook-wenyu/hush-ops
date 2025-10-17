import type { ReactNode } from 'react';

/**
 * EmptyState 组件
 * 统一的空状态展示
 */

export interface EmptyStateProps {
  /** 图标元素（可选） */
  icon?: ReactNode;
  /** 主标题 */
  title: string;
  /** 描述文本（可选） */
  description?: string;
  /** 操作按钮（可选） */
  action?: ReactNode;
}

/**
 * 空状态组件
 * 用于展示列表为空、暂无数据等场景
 *
 * @example
 * <EmptyState
 *   icon={<IconInbox size={48} />}
 *   title="暂无执行记录"
 *   description="当前没有可显示的执行记录"
 * />
 *
 * <EmptyState
 *   title="暂无待审批项"
 *   action={<button className="btn btn-primary btn-sm">刷新</button>}
 * />
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="mb-4 text-base-content/40">{icon}</div>}
      <h3 className="text-lg font-medium text-base-content mb-2">{title}</h3>
      {description && <p className="text-sm text-base-content/60 mb-4 max-w-md">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
