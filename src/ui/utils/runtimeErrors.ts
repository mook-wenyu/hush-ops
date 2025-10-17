export type RuntimeErrorOptions = {
  env?: 'dev' | 'prod';
  onReport?: (payload: { type: 'error' | 'unhandledrejection'; message: string; stack?: string; detail?: unknown }) => void;
};

export function installRuntimeErrorHooks(opts: RuntimeErrorOptions = {}): void {
  const env: 'dev' | 'prod' = opts.env ?? ((import.meta as any)?.env?.DEV ? 'dev' : 'prod');

  if (typeof window !== 'undefined') {
    const onError = (event: ErrorEvent) => {
      const payload = {
        type: 'error' as const,
        message: event?.message ?? 'Unknown runtime error',
        stack: event?.error?.stack,
        detail: { filename: event?.filename, lineno: event?.lineno, colno: event?.colno }
      };
      if (env === 'dev') {
        // 在开发态高亮打印，便于肉眼识别
        console.group('%cRuntimeError', 'color:#fff;background:#dc2626;padding:2px 6px;border-radius:4px');
        console.error(payload.message);
        if (payload.stack) {
          console.error(payload.stack);
        }
        console.groupEnd();
      }
      opts.onReport?.(payload);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const message = typeof reason === 'string' ? reason : reason?.message ?? 'Unhandled promise rejection';
      const payload = {
        type: 'unhandledrejection' as const,
        message,
        stack: typeof reason === 'object' ? reason?.stack : undefined,
        detail: reason
      };
      if (env === 'dev') {
        console.group('%cUnhandledRejection', 'color:#111827;background:#f59e0b;padding:2px 6px;border-radius:4px');
        console.error(payload.message);
        if (payload.stack) {
          console.error(payload.stack);
        }
        console.groupEnd();
      }
      opts.onReport?.(payload);
    };

    // 避免重复注册
    const key = '__HUSH_RUNTIME_ERROR_HOOKS__';
    if (!(window as any)[key]) {
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      (window as any)[key] = { onError, onRejection };
    }
  }
}
