import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestJson, HTTPError, TimeoutError, AbortRequestError } from "../../src/ui/services/core/http";

// Helper to mock fetch
function mockFetchImpl(impl: (url: any, init?: any) => Promise<Response>) {
  // @ts-ignore
  global.fetch = vi.fn(impl);
}

describe("core/http.requestJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns JSON when content-type is application/json", async () => {
    mockFetchImpl(async () => new Response(JSON.stringify({ ok: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const data = await requestJson<{ ok: number }>("GET", "/test-json");
    expect(data.ok).toBe(1);
  });

  it("returns text when content-type is not json", async () => {
    mockFetchImpl(async () => new Response("hello", {
      status: 200,
      headers: { "content-type": "text/plain" }
    }));
    const text = await requestJson<string>("GET", "/test-text");
    expect(text).toBe("hello");
  });

  it("throws HTTPError with status and message on 4xx", async () => {
    mockFetchImpl(async () => new Response(JSON.stringify({ message: "bad" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    }));
    await expect(requestJson("GET", "/bad"))
      .rejects.toBeInstanceOf(HTTPError);
    await requestJson("GET", "/bad").catch((e: any) => {
      expect(e).toBeInstanceOf(HTTPError);
      expect(e.status).toBe(400);
      expect(String(e.message)).toContain("bad");
    });
  });

  it("omits undefined/null in query params", async () => {
    mockFetchImpl(async (url) => {
      const s = String(url);
      expect(s).toContain("a=1");
      expect(s).toContain("d=x");
      expect(s).not.toContain("b=");
      expect(s).not.toContain("c=");
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });
    await requestJson("GET", "/tool-streams", { query: { a: 1, b: undefined, c: null, d: "x" } });
  });

  it("times out with TimeoutError when timeoutMs elapses", async () => {
    vi.useFakeTimers();
    mockFetchImpl(async () => new Promise(() => { /* never resolves */ }));
    const p = requestJson("GET", "/slow", { timeoutMs: 20 });
    // 避免 Node 对短期未处理的拒绝发出未捕获告警（不影响后续断言）
    // 详见 AGENTS.md：超时/中止用例的建议
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(25);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  it("aborts with AbortRequestError when external signal aborts", async () => {
    mockFetchImpl(async () => new Promise(() => { /* never resolves */ }));
    const ac = new AbortController();
    const p = requestJson("GET", "/abort", { signal: ac.signal });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    p.catch(() => {});
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(AbortRequestError);
  });
});
