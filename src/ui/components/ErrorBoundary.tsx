import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // 开发态打印，生产态可改为上报
    if ((import.meta as any)?.env?.DEV) {
      console.error('ErrorBoundary caught:', error, info);
    }
  }

  handleReload = (): void => {
    try { location.reload(); } catch {}
  };

  handleCopy = async (): Promise<void> => {
    const payload = `${this.state.error?.message ?? 'Unknown error'}\n${this.state.error?.stack ?? ''}`;
    try { await navigator.clipboard.writeText(payload); } catch {}
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="alert alert-error m-4">
        <div className="flex flex-col gap-2">
          <strong>页面发生错误</strong>
          <span className="opacity-80 text-sm">{this.state.error.message}</span>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-outline" onClick={this.handleCopy}>
              复制错误详情
            </button>
            <button className="btn btn-sm btn-primary" onClick={this.handleReload}>
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }
}
