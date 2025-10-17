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
    this.status = status;
    this.data = data;
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

export interface RequestJsonOptions<TBody = unknown> {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: TBody;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * 统一的 JSON/Text 请求封装
 * - 非 OK：尝试解析 { error } 或纯文本，抛出 HTTPError
 * - OK：Content-Type 含 json 返回对象，否则返回 text
 */
export async function requestJson<T = unknown, TBody = unknown>(
  method: string,
  path: string,
  opts?: RequestJsonOptions<TBody>
): Promise<T> {
  const controller = new AbortController();
  const timers: Array<ReturnType<typeof setTimeout>> = [];

  if (opts?.signal) {
    // 将外部中止接入本控制器
    const onAbort = () => controller.abort();
    opts.signal.addEventListener("abort", onAbort, { once: true });
  }
  if (opts?.timeoutMs && opts.timeoutMs > 0) {
    timers.push(
      setTimeout(() => {
        try {
          controller.abort();
        } catch {}
      }, opts.timeoutMs)
    );
  }

  const url = buildUrl(path, opts?.query);
  try {
    const fetchPromise = fetch(url, {
      method,
      headers: { ...(jsonHeaders(!!opts?.body)), ...(opts?.headers ?? {}) },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    } as RequestInit);

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
    // 统一中止/超时语义（Node 与浏览器可能抛出 AbortError DOMException）
    const name = err?.name || "";
    if (name === "AbortError") {
      if (opts?.timeoutMs && !opts?.signal?.aborted) {
        throw new TimeoutError();
      }
      throw new AbortRequestError();
    }
    throw err;
  } finally {
    for (const t of timers) clearTimeout(t);
  }
}
