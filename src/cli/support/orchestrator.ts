import type { OrchestratorClientOptions } from "../../client/orchestrator.js";
import { OrchestratorClient } from "../../client/orchestrator.js";

export interface ExecutionMode {
  readonly mode: "remote" | "local";
  readonly baseUrl?: string;
}

export interface OrchestratorFlags {
  readonly baseUrl?: string;
  readonly remote?: boolean;
  readonly local?: boolean;
}

export function resolveExecutionMode(flags: OrchestratorFlags, env: NodeJS.ProcessEnv): ExecutionMode {
  const explicitLocal = Boolean(flags.local);
  if (explicitLocal) {
    return { mode: "local" };
  }

  const envBase = env.ORCHESTRATOR_BASE_URL?.trim();
  const flagBase = flags.baseUrl?.trim();
  const shouldRemote = Boolean(flags.remote) || Boolean(flagBase) || Boolean(envBase);

  if (!shouldRemote) {
    return { mode: "local" };
  }

  const baseUrl = (flagBase ?? envBase ?? "http://127.0.0.1:3000/api/v1").replace(/\/$/, "");
  return { mode: "remote", baseUrl };
}

export function createOrchestratorClient(baseUrl: string, options: Partial<OrchestratorClientOptions> = {}): OrchestratorClient {
  const opts: OrchestratorClientOptions = {
    baseUrl,
    fetchImpl: options.fetchImpl ?? fetch
  };
  if (options.WebSocketImpl) {
    (opts as any).WebSocketImpl = options.WebSocketImpl;
  }
  return new OrchestratorClient(opts);
}
