import { alertClasses } from '../utils/classNames';

/**
 * ErrorAlert 组件
 * 统一的错误提示样式
 */

export interface ErrorAlertProps {
  /** 错误消息 */
  message: string;
  /** 错误对象（可选，用于显示技术详情） */
  error?: Error;
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md';
  /** 是否显示错误堆栈（开发模式） */
  showStack?: boolean;
}

/**
 * 错误提示组件
 * 基于DaisyUI alert组件，使用classNames工具函数
 *
 * @example
 * <ErrorAlert message="加载失败，请重试" />
 * <ErrorAlert
 *   message="执行失败"
 *   error={new Error("Network error")}
 *   size="sm"
 * />
 */
export function ErrorAlert({ message, error, size = 'sm', showStack = false }: ErrorAlertProps) {
  const isDev = (import.meta as any)?.env?.DEV ?? false;

  return (
    <div className={alertClasses({ variant: 'error', size })} role="alert" aria-live="assertive">
      <div className="flex flex-col gap-1 w-full">
        <span className="font-medium">{message}</span>
        {error && (
          <span className="text-xs opacity-80">
            {error.message || '未知错误'}
          </span>
        )}
        {isDev && showStack && error?.stack && (
          <pre className="text-xs opacity-60 mt-2 overflow-auto max-h-32 bg-base-300/30 p-2 rounded" role="region" aria-label="错误堆栈">
            {error.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
