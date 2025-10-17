import type { MemoryMessage } from "./memoryStore.js";
import { appendMessage, getThread } from "./memoryStore.js";

export interface AgentToolEvent {
  toolName: string;
  status: "start" | "success" | "error";
  message?: string;
  timestamp?: string;
  error?: string;
}

export interface AgentRunRequest {
  sessionKey: string;
  userInput: string;
  meta?: Record<string, unknown>;
  onToolEvent?: (ev: AgentToolEvent) => void | Promise<void>;
}

export interface AgentRunResult {
  sessionKey: string;
  reply: MemoryMessage;
  thread: { messages: MemoryMessage[] };
}

// 预留：未来可替换为 openai-agents-js 的真实实现
export async function runAgentEcho(req: AgentRunRequest): Promise<AgentRunResult> {
  const now = new Date().toISOString();
  // 模拟工具事件（最小）：记录一次 start/success
  try { await req.onToolEvent?.({ toolName: "agent.run", status: "start", message: "echo", timestamp: now }); } catch {}
  await appendMessage(req.sessionKey, { role: "user", content: req.userInput, ts: now, meta: req.meta });
  const reply: MemoryMessage = { role: "assistant", content: `Echo: ${req.userInput}`, ts: new Date().toISOString() };
  await appendMessage(req.sessionKey, reply);
  try { await req.onToolEvent?.({ toolName: "agent.run", status: "success", message: "echo complete", timestamp: reply.ts }); } catch {}
  const thread = await getThread(req.sessionKey, 50);
  return { sessionKey: req.sessionKey, reply, thread: { messages: thread.messages } };
}

/**
 * 自动选择 Agent 实现：
 * - 优先尝试动态加载 @openai/agents 真实执行
 * - 失败或未配置 OPENAI_API_KEY 时回退到回声实现
 */
export async function runAgentAuto(req: AgentRunRequest): Promise<AgentRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return runAgentEcho(req);
  }
  try {
    const startTs = new Date().toISOString();
    try { await req.onToolEvent?.({ toolName: "agent.run", status: "start", message: "calling model", timestamp: startTs }); } catch {}
    // 动态导入，避免在未安装或打包阶段报错
    const mod: any = await import("@openai/agents");
    const client: any = new (mod.OpenAI ?? mod.default?.OpenAI ?? function(){})({ apiKey });
    // 规范化历史：将 JSONL 线程转为模型可读的 messages（role+content 文本）
    const hist = await getThread(req.sessionKey, 50);
    const messages = hist.messages.map((m) => ({ role: m.role, content: String(m.content ?? "") }));
    messages.push({ role: "user", content: req.userInput });

    // 尝试使用通用 Chat API；若库提供 createAgent/run 亦可在此替换
    const model = process.env.HUSH_AGENT_MODEL || "gpt-4o-mini";
    const chat = await (client.chat?.completions?.create
      ? client.chat.completions.create({ model, messages })
      : client.responses?.create({ model, input: messages }))
    ;
    const text: string = chat?.choices?.[0]?.message?.content?.[0]?.text
      ?? chat?.choices?.[0]?.message?.content
      ?? chat?.output_text
      ?? chat?.choices?.[0]?.message?.content?.toString?.()
      ?? "(无回复)";

    const now = new Date().toISOString();
    await appendMessage(req.sessionKey, { role: "user", content: req.userInput, ts: now, meta: req.meta });
    const reply: MemoryMessage = { role: "assistant", content: text, ts: new Date().toISOString() };
    await appendMessage(req.sessionKey, reply);
    try { await req.onToolEvent?.({ toolName: "agent.run", status: "success", message: "model replied", timestamp: reply.ts }); } catch {}
    const thread = await getThread(req.sessionKey, 50);
    return { sessionKey: req.sessionKey, reply, thread: { messages: thread.messages } };
  } catch (err: any) {
    try { await req.onToolEvent?.({ toolName: "agent.run", status: "error", message: "failure", error: err?.message ?? String(err) }); } catch {}
    // 任意异常回退回声，确保稳定
    return runAgentEcho(req);
  }
}
