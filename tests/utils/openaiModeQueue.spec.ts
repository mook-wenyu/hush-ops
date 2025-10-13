import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withOpenAIAPIModeMock: vi.fn(async (_mode: string, task: () => Promise<unknown>) => task())
}));

vi.mock("../../src/utils/openaiApiMode.js", () => ({
  withOpenAIAPIMode: mocks.withOpenAIAPIModeMock
}));

import { OpenAIAPIModeQueue } from "../../src/utils/openaiModeQueue.js";

const { withOpenAIAPIModeMock } = mocks;

describe("OpenAIAPIModeQueue", () => {
  beforeEach(() => {
    withOpenAIAPIModeMock.mockReset();
    withOpenAIAPIModeMock.mockImplementation(async (_mode, task) => task());
  });

  it("应按照模式批次串行执行任务", async () => {
    const queue = new OpenAIAPIModeQueue();
    const executed: string[] = [];

    const first = queue.enqueue("chat_completions", async () => {
      executed.push("chat-1");
      return "A";
    });
    const second = queue.enqueue("responses", async () => {
      executed.push("responses-1");
      return "B";
    });
    const third = queue.enqueue("chat_completions", async () => {
      executed.push("chat-2");
      return "C";
    });

    const results = await Promise.all([first, second, third]);

    expect(results).toEqual(["A", "B", "C"]);
    expect(executed).toEqual(["chat-1", "chat-2", "responses-1"]);
    expect(withOpenAIAPIModeMock).toHaveBeenCalledTimes(2);
    const modeSequence = withOpenAIAPIModeMock.mock.calls.map(([mode]) => mode);
    expect(modeSequence).toEqual(["chat_completions", "responses"]);
  });

  it("任务失败时也应继续处理后续任务", async () => {
    const queue = new OpenAIAPIModeQueue();
    const failure = new Error("队列任务失败");

    const first = queue.enqueue("chat_completions", async () => {
      throw failure;
    });
    const second = queue.enqueue("chat_completions", async () => "成功");

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect(firstResult.status).toBe("rejected");
    if (firstResult.status === "rejected") {
      expect(firstResult.reason).toBe(failure);
    }
    expect(secondResult.status).toBe("fulfilled");
    if (secondResult.status === "fulfilled") {
      expect(secondResult.value).toBe("成功");
    }
  });
});