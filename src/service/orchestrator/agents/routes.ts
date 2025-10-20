import { clearThread, exportThread, getThread, importThread } from "./memoryStore.js";
import { runAgentAuto } from "./agentRunner.js";
import type { OrchestratorController } from "../controller.js";

export function registerAgentRoutes(app: any, basePath: string, controller?: OrchestratorController) {
  const agentsBase = `${basePath}/agents`;

  app.post(`${agentsBase}/session/messages`, async (request: any, _reply: any) => {
    const body = (request?.body ?? {}) as { sessionKey?: string; message?: string };
    const sessionKey = body.sessionKey || `session-${Date.now()}`;
    const message = body.message ?? "";
    const result = await runAgentAuto({
      sessionKey,
      userInput: message,
      onToolEvent: async (ev) => {
        try {
          const chunk: any = {
            correlationId: `agents:${sessionKey}:auto`,
            toolName: ev.toolName,
            message: ev.message ?? "",
            status: ev.status,
            source: "agent"
          };
          if (ev.error) chunk.error = ev.error;
          if (ev.timestamp) chunk.timestamp = ev.timestamp;
          controller?.appendGlobalToolStreamChunk(chunk);
        } catch {}
      }
    });
    // 将对话结果作为工具流审计的最小事件写入（全局，无 executionId）
    try {
      const chunk: any = {
        correlationId: `agents:${sessionKey}`,
        toolName: "agent.message",
        message: String(result.reply?.content ?? ""),
        status: "success",
        source: "agent"
      };
      const ts = result.reply?.ts ?? new Date().toISOString();
      if (ts) chunk.timestamp = ts as string;
      controller?.appendGlobalToolStreamChunk(chunk);
    } catch {}
    return { ok: true, sessionKey: result.sessionKey, reply: result.reply, thread: result.thread };
  });

  app.get(`${agentsBase}/session/thread`, async (request: any) => {
    const q = (request?.query ?? {}) as { sessionKey?: string; limit?: string };
    const sessionKey = q.sessionKey || "default";
    const limit = Math.max(0, Number(q.limit ?? "0") || 0) || undefined;
    const t = await getThread(sessionKey, limit);
    return { ok: true, sessionKey, messages: t.messages };
  });

  app.post(`${agentsBase}/session/clear`, async (request: any) => {
    const body = (request?.body ?? {}) as { sessionKey?: string };
    const sessionKey = body.sessionKey || "default";
    const res = await clearThread(sessionKey);
    return { ok: true, sessionKey, cleared: res.cleared };
  });

  app.get(`${agentsBase}/session/export`, async (request: any, reply: any) => {
    const q = (request?.query ?? {}) as { sessionKey?: string; format?: string };
    const sessionKey = q.sessionKey || "default";
    const jsonl = await exportThread(sessionKey);
    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(sessionKey)}.jsonl"`);
    return jsonl;
  });

  app.post(`${agentsBase}/session/import`, async (request: any) => {
    const body = (request?.body ?? {}) as { sessionKey?: string; jsonl?: string; replace?: boolean };
    const sessionKey = body.sessionKey || "default";
    const jsonl = body.jsonl || "";
    const res = await importThread(sessionKey, jsonl, { replace: true });
    return { ok: true, sessionKey, imported: res.imported };
  });

  // 显式上报工具流事件（可供前端/ChatKit 适配层或第三方集成调用）
  app.post(`${agentsBase}/tool-streams/report`, async (request: any) => {
    const body = (request?.body ?? {}) as {
      sessionKey?: string;
      correlationId?: string;
      toolName?: string;
      status?: string;
      message?: string;
      error?: string;
      executionId?: string;
      nodeId?: string;
      planId?: string;
      source?: string;
      timestamp?: string;
    };
    const sessionKey = body.sessionKey || "default";
    const correlationId = body.correlationId || `agents:${sessionKey}`;
    const toolName = body.toolName || "agent.tool";
    const status = body.status || "start";
    const message = String(body.message ?? "");
    try {
      const chunk: any = { correlationId, toolName, status, message, source: body.source ?? "agent" };
      if (body.error) chunk.error = body.error;
      if (body.executionId) chunk.executionId = body.executionId;
      if (body.nodeId) chunk.nodeId = body.nodeId;
      if (body.planId) chunk.planId = body.planId;
      if (body.timestamp) chunk.timestamp = body.timestamp;
      controller?.appendGlobalToolStreamChunk(chunk);
      return { ok: true, correlationId };
    } catch (error: any) {
      return { ok: false, error: { message: error?.message ?? String(error) } };
    }
  });

  // ChatKit 自定义后端（实验性占位）
  const chatkitBase = `${agentsBase}/chatkit`;
  app.post(`${chatkitBase}/messages`, async (request: any) => {
    const body = (request?.body ?? {}) as { sessionKey?: string; content?: string };
    const sessionKey = body.sessionKey || `ck-${Date.now()}`;
    const content = body.content ?? "";
    const result = await runAgentAuto({
      sessionKey,
      userInput: content,
      onToolEvent: async (ev) => {
        try {
          const chunk: any = {
            correlationId: `agents:${sessionKey}:auto`,
            toolName: ev.toolName,
            message: ev.message ?? "",
            status: ev.status,
            source: "chatkit"
          };
          if (ev.error) chunk.error = ev.error;
          if (ev.timestamp) chunk.timestamp = ev.timestamp;
          controller?.appendGlobalToolStreamChunk(chunk);
        } catch {}
      }
    });
    try {
      const chunk: any = {
        correlationId: `agents:${sessionKey}`,
        toolName: "agent.message",
        message: String(result.reply?.content ?? ""),
        status: "success",
        source: "chatkit"
      };
      const ts = result.reply?.ts ?? new Date().toISOString();
      if (ts) chunk.timestamp = ts as string;
      controller?.appendGlobalToolStreamChunk(chunk);
    } catch {}
    return {
      events: [
        { type: "message", role: "assistant", content: [{ type: "text", text: String(result.reply.content || "") }] }
      ]
    };
  });

  app.post(`${chatkitBase}/upload`, async () => {
    return { ok: true };
  });
}
