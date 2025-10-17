import { requestJson } from "./core/http";

export async function sendAgentMessage(params: { sessionKey?: string; message: string }) {
  return requestJson<{ ok: boolean; sessionKey: string; reply: any; thread: { messages: any[] } }>(
    "POST",
    "/agents/session/messages",
    { body: { sessionKey: params.sessionKey, message: params.message } }
  );
}

export async function getAgentThread(params: { sessionKey?: string; limit?: number }) {
  return requestJson<{ ok: boolean; sessionKey: string; messages: any[] }>(
    "GET",
    "/agents/session/thread",
    { query: { sessionKey: params.sessionKey ?? undefined, limit: params.limit ?? undefined } }
  );
}

export async function clearAgentThread(params: { sessionKey?: string }) {
  return requestJson<{ ok: boolean; sessionKey: string; cleared: number }>(
    "POST",
    "/agents/session/clear",
    { body: { sessionKey: params.sessionKey } }
  );
}

export function buildAgentExportUrl(sessionKey: string) {
  return `/api/v1/agents/session/export?sessionKey=${encodeURIComponent(sessionKey)}`;
}
