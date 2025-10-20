/*
 * 前端服务内核：HTTP 客户端与基础工具
 * - 统一 Base URL 解析
 * - 统一超时/中止（AbortController + setTimeout）
 * - 统一错误分流（HTTPError/TimeoutError/AbortError）
 * - JSON/Text 响应解析
 */

export const DEFAULT_BASE_URL = "/api/v1";

export function getBaseUrl(): string {
  // 与原 orchestratorApi 保持一致：读取 VITE_ORCHESTRATOR_BASE_URL，回退默认
  const value = (import.meta as any)?.env?.VITE_ORCHESTRATOR_BASE_URL as string | undefined;
  if (typeof value === "string" && value.trim().length > 0) return value.replace(/\/$/, "");
  return DEFAULT_BASE_URL;
}

export interface HttpErrorShape {
  name: string;
  message: string;
  status?: number;
  data?: unknown;
}

export class HTTPError extends Error implements HttpErrorShape {
  status?: number;
  data?: unknown;
  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = "HTTPError";
    if (typeof status !== "undefined") this.status = status;
    if (typeof data !== "undefined") this.data = data;
  }
}

export class TimeoutError extends Error implements HttpErrorShape {
  constructor(message = "Request timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class AbortRequestError extends Error implements HttpErrorShape {
  constructor(message = "Request aborted") {
    super(message);
    this.name = "AbortError";
  }
}

// 网络不可达短期熔断（开发期友好）：
// - 连续出现网络级错误（如 Failed to fetch / ECONNREFUSED）时，短时间内直接短路，避免洪泛请求
let __lastNetworkErrorAt = 0;
const __NETWORK_DOWN_COOLDOWN_MS = 5000; // 5s

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined | null>): string {
  const base = getBaseUrl();
  const fullPath = path.startsWith("/") ? path : `/${path}`;

  // 如果 base 是相对路径（以 / 开头且不含协议），手动拼接
  if (base.startsWith("/") && !base.includes("://")) {
    let result = base + fullPath;

    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        params.set(k, String(v));
      }
      const queryStr = params.toString();
      if (queryStr) result += `?${queryStr}`;
    }

    return result;
  }

  // 如果 base 是完整 URL（包含协议），使用 URL 构造函数
  const url = new URL(fullPath, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function jsonHeaders(hasBody: boolean) {
  return hasBody ? { "Content-Type": "application/json" } : undefined;
}

/**
 * 重试配置选项
 */
export interface RetryOptions {
  /**
   * 最大重试次数（默认 3）
   */
  maxRetries?: number;
  /**
   * 基础延迟时间（毫秒，默认 1000）
   */
  baseDelayMs?: number;
  /**
   * 可重试的 HTTP 状态码（默认 [408, 500, 502, 503, 504]）
   */
  retriableStatuses?: number[];
}

/**
 * 请求拦截器接口
 */
export interface RequestInterceptor {
  /**
   * 请求发送前拦截
   */
  onRequest?: (url: string, init: RequestInit) => void | Promise<void>;
  /**
   * 响应接收后拦截
   */
  onResponse?: (response: Response) => void | Promise<void>;
  /**
   * 错误发生时拦截
   */
  onError?: (error: Error) => void | Promise<void>;
}

export interface RequestJsonOptions<TBody = unknown> {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: TBody;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /**
   * 重试配置：
   * - true: 使用默认重试配置
   * - false/undefined: 不重试
   * - RetryOptions 对象: 自定义重试配置
   */
  retry?: RetryOptions | boolean;
  /**
   * 请求拦截器
   */
  interceptors?: RequestInterceptor;
}

/**
 * 判断 HTTP 状态码是否可重试
 */
function shouldRetry(status: number | undefined, retriableStatuses: number[]): boolean {
  if (!status) return false;
  return retriableStatuses.includes(status);
}

/**
 * 计算重试延迟时间（指数退避）
 * @param retryCount 当前重试次数（从 1 开始）
 * @param baseDelayMs 基础延迟时间（毫秒）
 * @returns 延迟时间（毫秒）
 */
function calculateRetryDelay(retryCount: number, baseDelayMs: number): number {
  // 指数退避：baseDelay * retryCount²
  return baseDelayMs * (retryCount * retryCount);
}

/**
 * 异步延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 统一的 JSON/Text 请求封装
 * - 非 OK：尝试解析 { error } 或纯文本，抛出 HTTPError
 * - OK：Content-Type 含 json 返回对象，否则返回 text
 * - 支持重试机制（指数退避）
 * - 支持请求/响应拦截器
 */
export async function requestJson<T = unknown, TBody = unknown>(
  method: string,
  path: string,
  opts?: RequestJsonOptions<TBody>
): Promise<T> {
  // 解析重试配置
  const retryConfig: RetryOptions = (() => {
    if (!opts?.retry) return { maxRetries: 0 }; // 禁用重试
    if (opts.retry === true) {
      // 使用默认配置
      return {
        maxRetries: 3,
        baseDelayMs: 1000,
        retriableStatuses: [408, 500, 502, 503, 504]
      };
    }
    // 合并用户配置和默认值
    return {
      maxRetries: opts.retry.maxRetries ?? 3,
      baseDelayMs: opts.retry.baseDelayMs ?? 1000,
      retriableStatuses: opts.retry.retriableStatuses ?? [408, 500, 502, 503, 504]
    };
  })();

  // 开启短期熔断：若近期判定后端网络不可达，则直接短路抛出统一错误
  if (__lastNetworkErrorAt && Date.now() - __lastNetworkErrorAt < __NETWORK_DOWN_COOLDOWN_MS) {
    throw new HTTPError("后端不可用或未启动", 0);
  }

  const url = buildUrl(path, opts?.query);
  const interceptors = opts?.interceptors;

  // 核心请求执行函数
  const attemptRequest = async (): Promise<T> => {
    const controller = new AbortController();
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    // 组装需要传入 fetch 的最终 AbortSignal
    let signalToUse: AbortSignal = controller.signal;
    const extraSignals: AbortSignal[] = [];

    // 外部信号（若存在）
    if (opts?.signal) {
      extraSignals.push(opts.signal);
    }

    // 超时信号（优先使用 AbortSignal.timeout；不可用则回退 setTimeout + controller.abort）
    if (opts?.timeoutMs && opts.timeoutMs > 0) {
      try {
        const AS: any = (globalThis as any).AbortSignal;
        if (AS && typeof AS.timeout === "function") {
          const ts: AbortSignal = AS.timeout(opts.timeoutMs);
          extraSignals.push(ts);
        } else {
          // 回退：使用定时器触发 controller.abort（标注 TimeoutError 原因以便后续判定）
          timers.push(
            setTimeout(() => {
              try {
                // DOMException 在部分运行时不可用，失败时退化为无参 abort
                const domErr = typeof (globalThis as any).DOMException === "function"
                  ? new (globalThis as any).DOMException("Timed out", "TimeoutError")
                  : undefined;
                if (domErr) {
                  // 部分运行时不存在 DOMException，已做显式判空
                  controller.abort(domErr as any);
                } else {
                  controller.abort();
                }
              } catch {
                controller.abort();
              }
            }, opts.timeoutMs)
          );
        }
      } catch {
        // 防御：任意异常都回退到 setTimeout 方案
        timers.push(
          setTimeout(() => {
            try { controller.abort(); } catch {}
          }, opts.timeoutMs)
        );
      }
    }

    // 若存在任何额外信号，优先使用 AbortSignal.any 组合；否则将其事件转发到 controller
    if (extraSignals.length > 0) {
      try {
        const AS: any = (globalThis as any).AbortSignal;
        if (AS && typeof AS.any === "function") {
          signalToUse = AS.any([controller.signal, ...extraSignals]);
        } else {
          const onAbort = () => { try { controller.abort(); } catch {} };
          for (const s of extraSignals) s.addEventListener("abort", onAbort, { once: true });
          signalToUse = controller.signal;
        }
      } catch {
        const onAbort = () => { try { controller.abort(); } catch {} };
        for (const s of extraSignals) s.addEventListener("abort", onAbort, { once: true });
        signalToUse = controller.signal;
      }
    }

    // 确保无论使用 any 还是回退方案，一旦最终信号触发也会同步触发 controller（供 abortPromise 竞态使用）
    if (signalToUse !== controller.signal) {
      try {
        signalToUse.addEventListener("abort", () => { try { controller.abort(); } catch {} }, { once: true });
      } catch {}
    }

    try {
      const requestInit: RequestInit = {
        method,
        headers: { ...(jsonHeaders(!!opts?.body)), ...(opts?.headers ?? {}) },
        signal: signalToUse
      };
      if (opts && "body" in (opts as any) && typeof (opts as any).body !== "undefined") {
        requestInit.body = JSON.stringify((opts as any).body);
      }

      // 请求拦截器
      if (interceptors?.onRequest) {
        await interceptors.onRequest(url, requestInit);
      }

      const fetchPromise = fetch(url, requestInit);

      // 同步兼容：即使上层 fetch 未处理 AbortSignal，也会因竞态在超时/中止时尽快返回
      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => {
          const err: any = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });

      const res = (await Promise.race([fetchPromise, abortPromise])) as Response;

      // 响应拦截器
      if (interceptors?.onResponse) {
        await interceptors.onResponse(res);
      }

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");

      if (!res.ok) {
        let detail: any = undefined;
        if (isJson) {
          try { detail = await res.json(); } catch {}
        } else {
          try { detail = { message: await res.text() }; } catch {}
        }
        const message = detail?.error?.message ?? detail?.message ?? `HTTP ${res.status}`;
        throw new HTTPError(message, res.status, detail);
      }

      if (isJson) return (await res.json()) as T;
      const text = (await res.text()) as unknown as T;
      return text;
    } catch (err: any) {
      // 统一中止/超时语义（浏览器可能抛出 DOMException: TimeoutError；Node/WHATWG fetch 通常抛 AbortError）
      const name = err?.name || "";
      if (name === "TimeoutError") {
        // 原生 TimeoutError（来自 AbortSignal.timeout 或实现细节）
        throw new TimeoutError();
      }
      if (name === "AbortError") {
        // 根据上下文判断是否由超时触发（外部 signal 未标记 aborted 且配置了 timeoutMs）
        if (opts?.timeoutMs && !(opts?.signal?.aborted)) {
          throw new TimeoutError();
        }
        throw new AbortRequestError();
      }
      // 统一网络级错误包装（后端不可达/未启动等）：TypeError / Failed to fetch / ECONNREFUSED / ECONNRESET
      const maybeMsg = String(err?.message || "");
      if (
        err instanceof TypeError ||
        maybeMsg.includes("Failed to fetch") ||
        maybeMsg.includes("ECONNREFUSED") ||
        maybeMsg.includes("ECONNRESET") ||
        maybeMsg.toLowerCase().includes("networkerror") ||
        maybeMsg.toLowerCase().includes("fetch failed")
      ) {
        try { __lastNetworkErrorAt = Date.now(); } catch {}
        throw new HTTPError("后端不可用或未启动", 0);
      }
      throw err;
    } finally {
      for (const t of timers) clearTimeout(t);
    }
  };

  // 重试循环
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retryConfig.maxRetries!; attempt++) {
    try {
      const result = await attemptRequest();
      return result;
    } catch (err: any) {
      lastError = err;

      // 错误拦截器
      if (interceptors?.onError) {
        try {
          await interceptors.onError(err);
        } catch {}
      }

      // 最后一次尝试失败，直接抛出
      if (attempt >= retryConfig.maxRetries!) {
        throw err;
      }

      // 判断是否可重试
      const isHTTPError = err instanceof HTTPError;
      const canRetry = isHTTPError && shouldRetry(err.status, retryConfig.retriableStatuses!);

      if (!canRetry) {
        // 不可重试的错误（如 401, 403, 404, TimeoutError, AbortError）
        throw err;
      }

      // 计算延迟时间并等待
      const retryCount = attempt + 1;
      const delayMs = calculateRetryDelay(retryCount, retryConfig.baseDelayMs!);

      if (import.meta.env?.DEV) {
        console.warn(
          `[HTTP Retry] ${method} ${path} 失败 (状态 ${err.status}), ` +
          `${retryCount}/${retryConfig.maxRetries} 次重试, ` +
          `${delayMs}ms 后重试...`
        );
      }

      await delay(delayMs);
    }
  }

  // 理论上不应该到达这里，但为了类型安全
  throw lastError || new Error("请求失败且无错误信息");
}
