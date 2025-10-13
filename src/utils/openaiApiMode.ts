import { setOpenAIAPI } from "@openai/agents";

export type OpenAIAPIMode = "chat_completions" | "responses";

let currentMode: OpenAIAPIMode = "chat_completions";

export async function withOpenAIAPIMode<T>(
  mode: OpenAIAPIMode,
  task: () => Promise<T>
): Promise<T> {
  const previous = currentMode;

  if (previous !== mode) {
    setOpenAIAPI(mode);
    currentMode = mode;
  }

  try {
    const result = await task();
    return result;
  } finally {
    if (previous !== mode) {
      setOpenAIAPI(previous);
      currentMode = previous;
    }
  }
}
