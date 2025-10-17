import { requestJson } from "./core/http";

export async function chatKitSendMessage(params: { sessionKey?: string; content: string }) {
  return requestJson<{ events: Array<{ type: string; [k:string]: any }> }>(
    "POST",
    "/agents/chatkit/messages",
    { body: { sessionKey: params.sessionKey, content: params.content } }
  );
}

export async function chatKitUpload(params: { name: string; content: string }) {
  // 最小占位：后端使用 JSON 接口模拟直传
  return requestJson<{ ok: boolean }>(
    "POST",
    "/agents/chatkit/upload",
    { body: { name: params.name, content: params.content } }
  );
}
