export type BridgeState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

export type BridgeEvent =
  | "bridge:connecting"
  | "bridge:connected"
  | "bridge:disconnected"
  | "bridge:reconnecting"
  | "bridge:error"
  | "bridge:message";

export interface BridgeEventPayloads {
  "bridge:connecting": void;
  "bridge:connected": void;
  "bridge:disconnected": { reason?: string };
  "bridge:reconnecting": { attempt: number; delayMs: number };
  "bridge:error": { error: unknown };
  "bridge:message": { id?: string; method: string; params?: unknown };
}

export interface JsonRpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface BridgeLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
}

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type { FetchLike, Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { BridgeSessionRegistry } from "./sessionRegistry.js";

export interface BridgeRetryOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  maxAttempts?: number;
}

export interface BridgeOptions {
  endpoint: string;
  serverName?: string;
  headers?: Record<string, string>;
  retry?: BridgeRetryOptions;
  logger?: BridgeLogger;
  fetch?: FetchLike;
  transportFactory?: (endpoint: URL) => Transport;
  capabilities?: ClientCapabilities;
  clientFactory?: (transport: Transport) => Client;
  userId?: string;
  sessionRegistry?: BridgeSessionRegistry;
  sessionMetadata?: Record<string, unknown>;
}

export interface ToolCallOptions {
  nodeId?: string | undefined;
  riskLevel?: "low" | "medium" | "high" | undefined;
  executionId?: string | undefined;
  planId?: string | undefined;
  correlationId?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface ToolInvocation {
  toolName: string;
  arguments?: Record<string, unknown>;
  options?: ToolCallOptions;
}

export type ToolActivityStatus = "start" | "success" | "error";

export interface ToolStreamEvent {
  toolName: string;
  correlationId: string;
  status: ToolActivityStatus;
  timestamp: string;
  message: string;
  nodeId?: string | undefined;
  executionId?: string | undefined;
  planId?: string | undefined;
  result?: unknown;
  error?: string | undefined;
  source?: string | undefined;
}

export interface BridgeSecurityHooks {
  onToolInvoke?: (payload: {
    toolName: string;
    nodeId?: string;
    arguments?: Record<string, unknown>;
  }) => void;
  onRiskyTool?: (payload: {
    toolName: string;
    nodeId?: string;
    arguments?: Record<string, unknown>;
    riskLevel: "low" | "medium" | "high";
  }) => void;
}
