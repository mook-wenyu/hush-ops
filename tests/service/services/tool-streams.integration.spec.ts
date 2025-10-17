import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchGlobalToolStreamSummaries,
  buildGlobalToolStreamExportUrl,
  fetchExecutionToolStreamSummaries
} from "../../../src/ui/services/tool-streams.js";

function mockFetchOnce(impl: Parameters<typeof vi.fn>[0]) {
  const f = vi.fn(impl) as unknown as typeof fetch;
  // @ts-ignore stub global fetch
  globalThis.fetch = f;
  return f;
}

describe("tool-streams services", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    // @ts-ignore restore
    delete globalThis.fetch;
    vi.useRealTimers();
  });

  it("buildGlobalToolStreamExportUrl produces expected url", () => {
    const url = buildGlobalToolStreamExportUrl("corr-1", { format: "ndjson", compress: true });
    expect(url).toMatch(/tool-streams\/corr-1\/export\?format=ndjson&compress=1$/);
  });

  it("fetchGlobalToolStreamSummaries returns list with total fallback", async () => {
    mockFetchOnce(async (url: any) => {
      expect(String(url)).toMatch(/\/tool-streams/);
      return new Response(JSON.stringify({ streams: [{ correlationId: "c1", tool: "x" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    const res = await fetchGlobalToolStreamSummaries({ onlyErrors: true, limit: 10, offset: 0 });
    expect(res.total).toBe(1);
    expect(res.streams.length).toBe(1);
  });

  it("encodes updatedAfter/updatedBefore in query when provided", async () => {
    const after = '2025-01-01T00:00:00.000Z';
    const before = '2025-12-31T23:59:59.999Z';
    mockFetchOnce(async (url: any) => {
      const href = String(url);
      expect(href).toMatch(/updatedAfter=2025-01-01T00%3A00%3A00.000Z/);
      expect(href).toMatch(/updatedBefore=2025-12-31T23%3A59%3A59.999Z/);
      return new Response(JSON.stringify({ streams: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    await fetchGlobalToolStreamSummaries({ updatedAfter: after, updatedBefore: before, onlyErrors: false, limit: 5, offset: 0 });
  });

  it("fetchExecutionToolStreamSummaries propagates server error", async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ error: { message: "boom" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    );
    await expect(fetchExecutionToolStreamSummaries("exe-1")).rejects.toMatchObject({ name: "HTTPError", status: 500 });
  });
});
