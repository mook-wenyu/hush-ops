import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchExecutions, fetchExecutionById, stopExecution } from "../../../src/ui/services/executions.js";

function mockFetchOnce(impl: Parameters<typeof vi.fn>[0]) {
  const f = vi.fn(impl) as unknown as typeof fetch;
  // @ts-ignore stub global fetch
  globalThis.fetch = f;
  return f;
}

describe("executions services", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    // @ts-ignore restore
    delete globalThis.fetch;
    vi.useRealTimers();
  });

  it("fetchExecutions returns list", async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ executions: [{ id: "e1", status: "running" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const list = await fetchExecutions();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe("e1");
  });

  it("fetchExecutionById returns detail", async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ id: "e42", status: "succeeded" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const rec = await fetchExecutionById("e42");
    expect(rec.id).toBe("e42");
  });

  it("stopExecution propagates server error", async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ error: { message: "cannot stop" } }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      })
    );
    await expect(stopExecution("e1")).rejects.toMatchObject({ name: "HTTPError", status: 409 });
  });
});
