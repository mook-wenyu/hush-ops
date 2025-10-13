import { withOpenAIAPIMode, type OpenAIAPIMode } from "./openaiApiMode.js";

type TaskEntry = {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type ModeKey = "chat_completions" | "responses";

const MODES: ModeKey[] = ["chat_completions", "responses"];

export class OpenAIAPIModeQueue {
  private queues: Map<ModeKey, TaskEntry[]> = new Map(
    MODES.map((mode) => [mode, []])
  );

  private processing = false;
  private nextIndex = 0;

  enqueue<T>(mode: OpenAIAPIMode, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const modeKey: ModeKey = mode === "responses" ? "responses" : "chat_completions";
      const queue = this.queues.get(modeKey);
      if (!queue) {
        reject(new Error(`不支持的 API 模式: ${mode}`));
        return;
      }

      queue.push({
        execute: async () => task(),
        resolve: (value) => resolve(value as T),
        reject
      });
      void this.process();
    });
  }

  private async process() {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      while (true) {
        const nextMode = this.pickNextMode();
        if (nextMode === undefined) {
          break;
        }

        await this.processMode(nextMode as ModeKey);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processMode(mode: ModeKey) {
    const modeKey = mode;

    await withOpenAIAPIMode(modeKey, async () => {
      const queue = this.queues.get(modeKey);
      if (!queue) {
        return;
      }

      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) {
          continue;
        }
        try {
          const result = await entry.execute();
          entry.resolve(result);
        } catch (error) {
          entry.reject(error);
        }
      }
    });
  }

  private pickNextMode(): ModeKey | undefined {
    for (let offset = 0; offset < MODES.length; offset += 1) {
      const index = (this.nextIndex + offset) % MODES.length;
      const mode = MODES[index];
      if (!mode) {
        continue;
      }
      const queue = this.queues.get(mode);
      if (queue && queue.length > 0) {
        this.nextIndex = (index + 1) % MODES.length;
        return mode;
      }
    }
    return undefined;
  }
}

export const openaiModeQueue = new OpenAIAPIModeQueue();

export function enqueueOpenAITask<T>(
  mode: OpenAIAPIMode,
  task: () => Promise<T>
): Promise<T> {
  return openaiModeQueue.enqueue(mode, task);
}
