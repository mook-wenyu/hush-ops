import { Agent, run } from "@openai/agents";
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

/**
 * 使用 @openai/agents SDK 执行对话
 * - 优先使用 OPENAI_API_KEY 调用真实模型
 * - 无 API key 时提供简单 echo 回退（用于测试环境）
 */
export async function runAgentAuto(req: AgentRunRequest): Promise<AgentRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  // 无 API key 时的简单 echo 回退（主要用于测试）
  if (!apiKey) {
    const now = new Date().toISOString();
    try {
      await req.onToolEvent?.({
        toolName: "agent.run",
        status: "start",
        message: "echo mode (no API key)",
        timestamp: now
      });
    } catch {}

    const userMsg: MemoryMessage & { meta?: Record<string, unknown> } = {
      role: "user",
      content: req.userInput,
      ts: now
    };
    if (req.meta) {
      userMsg.meta = req.meta;
    }
    await appendMessage(req.sessionKey, userMsg);

    const reply: MemoryMessage = {
      role: "assistant",
      content: `Echo: ${req.userInput}`,
      ts: new Date().toISOString()
    };
    await appendMessage(req.sessionKey, reply);

    try {
      await req.onToolEvent?.({
        toolName: "agent.run",
        status: "success",
        message: "echo complete",
        timestamp: reply.ts
      });
    } catch {}

    const thread = await getThread(req.sessionKey, 50);
    return { sessionKey: req.sessionKey, reply, thread: { messages: thread.messages } };
  }

  try {
    const startTs = new Date().toISOString();
    try {
      await req.onToolEvent?.({
        toolName: "agent.run",
        status: "start",
        message: "calling model",
        timestamp: startTs
      });
    } catch {}

    // 获取历史对话记录并构建完整输入
    const hist = await getThread(req.sessionKey, 50);
    let fullInput = req.userInput;
    
    // 如果有历史记录，将其作为上下文前缀
    if (hist.messages.length > 0) {
      const context = hist.messages
        .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
        .join("\n");
      fullInput = `历史对话：\n${context}\n\n当前输入：\n${req.userInput}`;
    }

    // 创建 Agent 实例
    const agent = Agent.create({
      name: "通用助手",
      instructions: "你是一个有帮助的助手。",
      model: process.env.HUSH_AGENT_MODEL || "gpt-4o-mini"
    });

    // 运行 Agent
    const result = await run(agent, fullInput);
    const text = result.finalOutput || "(无回复)";

    // 保存用户消息和助手回复
    const now = new Date().toISOString();
    const userMsg: MemoryMessage & { meta?: Record<string, unknown> } = {
      role: "user",
      content: req.userInput,
      ts: now
    };
    if (req.meta) {
      userMsg.meta = req.meta;
    }
    await appendMessage(req.sessionKey, userMsg);

    const reply: MemoryMessage = {
      role: "assistant",
      content: text,
      ts: new Date().toISOString()
    };
    await appendMessage(req.sessionKey, reply);

    try {
      await req.onToolEvent?.({
        toolName: "agent.run",
        status: "success",
        message: "model replied",
        timestamp: reply.ts
      });
    } catch {}

    const thread = await getThread(req.sessionKey, 50);
    return { sessionKey: req.sessionKey, reply, thread: { messages: thread.messages } };
  } catch (err: any) {
    try {
      await req.onToolEvent?.({
        toolName: "agent.run",
        status: "error",
        message: "failure",
        error: err?.message ?? String(err)
      });
    } catch {}
    throw err;
  }
}
