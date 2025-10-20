import React from 'react';

interface Props {
  children: React.ReactNode;
  /**
   * 自定义错误降级 UI
   * @param error - 捕获的错误对象
   * @param resetError - 重置错误状态的函数
   */
  fallback?: (error: Error, resetError: () => void) => React.ReactNode;
  /**
   * 错误发生时的回调钩子，可用于错误上报
   * @param error - 错误对象
   * @param errorInfo - React 错误信息（包含 componentStack）
   */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // 保存 errorInfo 到状态中
    this.setState({ errorInfo });

    // React 19: 捕获组件所有者栈用于生产环境调试
    const ownerStack = React.captureOwnerStack?.();

    // 开发环境：打印详细错误信息
    if (import.meta.env.DEV) {
      console.group('🚨 ErrorBoundary 捕获错误');
      console.error('错误:', error);
      console.error('组件栈:', errorInfo.componentStack);
      if (ownerStack) {
        console.error('所有者栈 (React 19):', ownerStack);
      }
      console.groupEnd();
    }

    // 生产环境：调用 onError 回调进行错误上报
    try {
      this.props.onError?.(error, errorInfo);
    } catch (reportError) {
      // 错误上报本身失败时，避免二次崩溃
      console.error('错误上报失败:', reportError);
    }
  }

  /**
   * 重置错误状态，允许不刷新页面恢复
   */
  resetError = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  handleReload = (): void => {
    try {
      location.reload();
    } catch {}
  };

  handleCopy = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const payload = [
      `错误消息: ${error?.message ?? 'Unknown error'}`,
      `\n错误栈:\n${error?.stack ?? 'No stack trace'}`,
      errorInfo?.componentStack
        ? `\n组件栈:\n${errorInfo.componentStack}`
        : ''
    ].join('');

    try {
      await navigator.clipboard.writeText(payload);
    } catch {}
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    const { fallback } = this.props;

    if (!error) return this.props.children;

    // 优先使用自定义 fallback
    if (fallback) {
      return fallback(error, this.resetError);
    }

    // 默认降级 UI
    return (
      <div role="alert" className="alert alert-error m-4">
        <div className="flex flex-col gap-2">
          <strong>页面发生错误</strong>
          <span className="opacity-80 text-sm">{error.message}</span>
          <div className="flex gap-2">
            <button
              className="btn btn-sm btn-outline"
              onClick={this.handleCopy}
              aria-label="复制错误详情"
            >
              复制错误详情
            </button>
            <button
              className="btn btn-sm"
              onClick={this.resetError}
              aria-label="重试"
            >
              重试
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={this.handleReload}
              aria-label="刷新页面"
            >
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }
}
