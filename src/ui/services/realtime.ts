import { getBaseUrl } from "./core/http";

export function createWebSocket(topics: readonly string[]): WebSocket {
  const baseUrl = getBaseUrl();
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.pathname = "/ws";
  if (topics.length > 0) wsUrl.searchParams.set("topics", topics.join(","));
  return new WebSocket(wsUrl);
}
