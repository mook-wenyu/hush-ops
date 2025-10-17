import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestJson, HTTPError, TimeoutError, AbortRequestError } from "../../../src/ui/services/core/http.js";

function mockFetchOnce(impl: Parameters<typeof vi.fn>[0]) {
  const f = vi.fn(impl) as unknown as typeof fetch;
  // @ts-ignore stub global fetch
  globalThis.fetch = f;
  return f;
}

describe("requestJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    // @ts-ignore restore
    delete globalThis.fetch;
    vi.useRealTimers();
  });

  it("parses JSON when content-type is json", async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const res = await requestJson<{ ok: boolean }>("GET", "/ping");
    expect(res.ok).toBe(true);
  });

  it("returns text when content-type is not json", async () => {
    mockFetchOnce(async () => new Response("pong", { status: 200, headers: { "Content-Type": "text/plain" } }));
    const res = await requestJson<string>("GET", "/ping");
    expect(res).toBe("pong");
  });

  it("throws HTTPError with message from body on 4xx", async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ error: { message: "bad" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );
    await expect(requestJson("GET", "/oops")).rejects.toMatchObject({ name: "HTTPError", status: 400 });
  });

  it("aborts by timeout and throws TimeoutError", async () => {
    mockFetchOnce(async () => new Promise(() => {}));
    const p = requestJson("GET", "/slow", { timeoutMs: 10 });
    // 附着一次拒绝处理以避免 Node 将短期未处理的拒绝视为未捕获
    // 不影响后续 expect 的断言
    // @ts-ignore
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(20);
    await expect(p).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("respects external AbortSignal and throws AbortError", async () => {
    mockFetchOnce(async () => new Promise(() => {}));
    const ac = new AbortController();
    const p = requestJson("GET", "/slow", { signal: ac.signal });
    // 附着一次拒绝处理避免未捕获提示
    // @ts-ignore
    p.catch(() => {});
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
