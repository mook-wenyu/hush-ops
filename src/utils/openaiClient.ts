import { setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, setTracingExportApiKey } from "@openai/agents";
import { OpenAI } from "openai";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * 按照环境变量初始化默认的 OpenAI 客户端，并处理自定义网关与追踪设置。
 */
export function configureDefaultOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY，请先在环境变量中配置有效的 API Key。");
  }

  const baseURLRaw = process.env.OPENAI_BASE_URL?.trim();
  const baseURL = baseURLRaw && baseURLRaw.length > 0 ? baseURLRaw : undefined;

  const client = new OpenAI({
    apiKey,
    baseURL
  });

  setDefaultOpenAIClient(
    client as unknown as Parameters<typeof setDefaultOpenAIClient>[0]
  );

  setOpenAIAPI("chat_completions");

  const tracingKey = process.env.OPENAI_TRACING_EXPORT_API_KEY?.trim();
  if (tracingKey && tracingKey.length > 0) {
    setTracingExportApiKey(tracingKey);
  } else if (baseURL && baseURL !== DEFAULT_OPENAI_BASE_URL) {
    setTracingDisabled(true);
  }

  return client;
}