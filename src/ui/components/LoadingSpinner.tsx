/**
 * LoadingSpinner 组件
 * 统一的加载状态指示器
 */

export interface LoadingSpinnerProps {
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 可选的加载文本 */
  text?: string;
  /** 是否居中显示 */
  center?: boolean;
}

/**
 * 加载状态组件
 * 基于DaisyUI loading组件
 *
 * @example
 * <LoadingSpinner size="md" text="加载中…" />
 * <LoadingSpinner size="sm" center />
 */
export function LoadingSpinner({ size = 'md', text, center = false }: LoadingSpinnerProps) {
  const sizeClass = `loading-${size}`;
  const containerClass = center ? 'flex items-center justify-center py-8' : '';

  return (
    <div role="status" aria-live="polite" className={containerClass}>
      <div className="flex items-center gap-3">
        <span className={`loading loading-spinner ${sizeClass}`} />
        {text && <span className="text-base-content/70">{text}</span>}
      </div>
    </div>
  );
}
