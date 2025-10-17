import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoreApi } from "zustand/vanilla";

import {
  appStore,
  isAppStoreEnabled,
  type AppStore
} from "../state/appStore";
import { createWebSocket } from "../services";
import type {
  BridgeState,
  OrchestratorEventEnvelope
} from "../types/orchestrator";

const DEFAULT_HEARTBEAT_INTERVAL = 15_000;
const DEFAULT_HEARTBEAT_TIMEOUT = 45_000;
const DEFAULT_BASE_BACKOFF = 2_000;
const DEFAULT_MAX_BACKOFF = 60_000;
const DEFAULT_JITTER = 250;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MAX_SEEN_IDS = 512;

type TimeoutHandle = number;
type IntervalHandle = number;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSequence(payload: unknown): number | undefined {
  if (!isPlainObject(payload)) {
    return undefined;
  }
  const candidate = payload.sequence;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }
  return undefined;
}

function computeEnvelopeIdentifier(envelope: OrchestratorEventEnvelope): string {
  const parts: string[] = [
    envelope.event,
    envelope.executionId ?? "",
    envelope.timestamp
  ];
  if (isPlainObject(envelope.payload)) {
    if (typeof envelope.payload.id === "string") {
      parts.push(envelope.payload.id);
    }
    if (typeof envelope.payload.correlationId === "string") {
      parts.push(envelope.payload.correlationId);
    }
    if (typeof envelope.payload.sequence === "number") {
      parts.push(`seq:${envelope.payload.sequence}`);
    }
  }
  return parts.join("|");
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export interface BridgeTelemetryEvent {
  type:
    | "connected"
    | "disconnected"
    | "reconnecting"
    | "heartbeat"
    | "heartbeat_timeout"
    | "degraded"
    | "event_discarded"
    | "fallback_triggered"
    | "fallback_error"
    | "sequence_gap";
  attempt?: number;
  delayMs?: number;
  reason?: string;
  timestamp?: number;
  eventId?: string;
  executionId?: string;
  expectedSequence?: number;
  receivedSequence?: number;
  message?: string;
}

export interface SequenceGapInfo {
  executionId: string;
  previous?: number;
  current: number;
  envelope: OrchestratorEventEnvelope;
}

export interface BridgeConnectionOptions {
  topics: readonly string[];
  storeEnabled?: boolean;
  storeApi?: StoreApi<AppStore>;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitterMs?: number;
  maxRetries?: number;
  maxSeenIds?: number;
  socketFactory?: (topics: readonly string[]) => WebSocket;
  onEvent?: (envelope: OrchestratorEventEnvelope) => void;
  onSequenceGap?: (info: SequenceGapInfo) => void;
  onFallbackPoll?: () => unknown | Promise<unknown>;
  onConnectionStateChange?: (state: BridgeState) => void;
  telemetry?: (event: BridgeTelemetryEvent) => void;
}

export interface BridgeConnectionState {
  bridgeState: BridgeState;
  degraded: boolean;
  lastHeartbeatAt: number | null;
  attempts: number;
  reconnect: () => void;
}

export function useBridgeConnection(options: BridgeConnectionOptions): BridgeConnectionState {
  const topicsKey = useMemo(() => options.topics.join(","), [options.topics]);
  const topics = useMemo(
    () => options.topics.slice(),
    [topicsKey]
  );

  const storeEnabled = options.storeEnabled ?? isAppStoreEnabled();
  const storeApi = options.storeApi ?? appStore;
  const socketFactory = options.socketFactory ?? createWebSocket;

  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT;
  const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF;
  const jitterMs = options.jitterMs ?? DEFAULT_JITTER;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxSeenIds = options.maxSeenIds ?? DEFAULT_MAX_SEEN_IDS;

  const telemetryRef = useLatest(options.telemetry);
  const onEventRef = useLatest(options.onEvent);
  const sequenceGapRef = useLatest(options.onSequenceGap);
  const fallbackRef = useLatest(options.onFallbackPoll);
  const connectionChangeRef = useLatest(options.onConnectionStateChange);

  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");
  const [degraded, setDegraded] = useState(false);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);

  const attemptRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<TimeoutHandle | null>(null);
  const heartbeatIntervalRef = useRef<IntervalHandle | null>(null);
  const heartbeatTimeoutRef = useRef<TimeoutHandle | null>(null);
  const fallbackInFlightRef = useRef(false);
  const destroyedRef = useRef(false);
  const degradedRef = useRef(false);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const seenEventQueueRef = useRef<string[]>([]);
  const lastSequenceRef = useRef<Map<string, number>>(new Map());

  const reconnectRef = useRef<() => void>(() => {});

  const updateBridgeState = useCallback(
    (next: BridgeState) => {
      setBridgeState(next);
      connectionChangeRef.current?.(next);
      if (storeEnabled) {
        storeApi.getState().setBridgeState(next);
      }
    },
    [storeEnabled, storeApi, connectionChangeRef]
  );

  const updateDegradedMode = useCallback(
    (enabled: boolean) => {
      setDegraded(enabled);
      if (storeEnabled) {
        storeApi.getState().setDegradedMode(enabled);
      }
    },
    [storeEnabled, storeApi]
  );

  const registerEventId = useCallback(
    (identifier: string): boolean => {
      const seen = seenEventIdsRef.current;
      if (seen.has(identifier)) {
        return false;
      }
      seen.add(identifier);
      const queue = seenEventQueueRef.current;
      queue.push(identifier);
      if (queue.length > maxSeenIds) {
        const removed = queue.shift();
        if (removed) {
          seen.delete(removed);
        }
      }
      return true;
    },
    [maxSeenIds]
  );

  const resetSeenEvents = useCallback(() => {
    seenEventIdsRef.current.clear();
    seenEventQueueRef.current.length = 0;
    lastSequenceRef.current.clear();
    if (storeEnabled) {
      storeApi.getState().clearDiscardedEvents();
    }
  }, [storeEnabled, storeApi]);

  const recordDiscardedEvent = useCallback(
    (identifier: string) => {
      if (storeEnabled) {
        storeApi.getState().recordDiscardedEvent(identifier);
      }
    },
    [storeEnabled, storeApi]
  );

  const markHeartbeat = useCallback(
    (timestamp: number) => {
      setLastHeartbeatAt(timestamp);
      if (storeEnabled) {
        storeApi.getState().markHeartbeat(timestamp);
      }
      telemetryRef.current?.({ type: "heartbeat", timestamp });
    },
    [storeEnabled, storeApi, telemetryRef]
  );

  const updateAttempts = useCallback((attempt: number) => {
    attemptRef.current = attempt;
    setAttempts(attempt);
  }, []);

  const runFallback = useCallback(
    (reason: string) => {
      const fallback = fallbackRef.current;
      if (!fallback || fallbackInFlightRef.current) {
        return;
      }
      fallbackInFlightRef.current = true;
      telemetryRef.current?.({ type: "fallback_triggered", reason });
      // E2E-only hook: when VITE_E2E=1, expose a deterministic fallback signal for tests
      try {
        // Mark a diagnostic counter for tests (and harmless in dev/prod)
        try {
          if (typeof document !== 'undefined') {
            const el = document.documentElement;
            const current = Number(el.getAttribute('data-fallback-count') || '0');
            el.setAttribute('data-fallback-count', String(current + 1));
          }
        } catch {}
        // Always invoke optional global for Playwright diagnostics (no-op if undefined)
        ;(globalThis as any).__WS_E2E_ON_FALLBACK?.();
        // Dispatch a deterministic CustomEvent for E2E to wait on (cross‑platform, avoids polling)
        try {
          if (typeof window !== 'undefined' && typeof (window as any).dispatchEvent === 'function') {
            const evt = new CustomEvent('hush:fallback', { detail: { reason, ts: Date.now() } });
            window.dispatchEvent(evt);
          }
        } catch {}

      } catch {
        // ignore test-only hooks errors
      }

      if (storeEnabled) {
        storeApi.getState().setExecutionsLoading(true);
      }

      try {
        const result = fallback();
        const isThenable = !!result && typeof (result as Promise<unknown>).then === "function";
        if (isThenable) {
          (result as Promise<unknown>)
            .then(() => {
              if (storeEnabled) {
                const api = storeApi.getState();
                api.markExecutionsFetched(Date.now());
                api.setExecutionsError(null);
              }
            })
            .catch((error) => {
              telemetryRef.current?.({
                type: "fallback_error",
                reason,
                message: error instanceof Error ? error.message : String(error)
              });
              if (storeEnabled) {
                storeApi
                  .getState()
                  .setExecutionsError(error instanceof Error ? error.message : String(error));
              }
            })
            .finally(() => {
              fallbackInFlightRef.current = false;
              if (storeEnabled) {
                storeApi.getState().setExecutionsLoading(false);
              }
            });
        } else {
          // 同步完成：立即清理 loading 状态并标记已刷新
          if (storeEnabled) {
            const api = storeApi.getState();
            api.markExecutionsFetched(Date.now());
            api.setExecutionsError(null);
            api.setExecutionsLoading(false);
          }
          fallbackInFlightRef.current = false;
        }
      } catch (error) {
        telemetryRef.current?.({
          type: "fallback_error",
          reason,
          message: error instanceof Error ? error.message : String(error)
        });
        if (storeEnabled) {
          storeApi
            .getState()
            .setExecutionsError(error instanceof Error ? error.message : String(error));
          storeApi.getState().setExecutionsLoading(false);
        }
        fallbackInFlightRef.current = false;
      }
    },
    [fallbackRef, storeEnabled, storeApi, telemetryRef]
  );

  useEffect(() => {
    destroyedRef.current = false;

    const stopHeartbeatTimers = () => {
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (heartbeatTimeoutRef.current !== null) {
        window.clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
    };

    const enterDegradedMode = (reason: string) => {
      if (degradedRef.current) {
        return;
      }
      degradedRef.current = true;
      updateDegradedMode(true);
      telemetryRef.current?.({ type: "degraded", reason });
      runFallback(reason);
    };

    const computeDelay = (attemptIndex: number) => {
      const raw = baseBackoffMs * Math.pow(2, attemptIndex);
      const jitter = (Math.random() * 2 - 1) * jitterMs;
      return clamp(raw + jitter, baseBackoffMs, maxBackoffMs);
    };

    const cleanupSocket = () => {
      const socket = socketRef.current;
      if (!socket) {
        return;
      }
      socket.removeEventListener("open", handleOpen as EventListener);
      socket.removeEventListener("close", handleClose as EventListener);
      socket.removeEventListener("error", handleError as EventListener);
      socket.removeEventListener("message", handleMessage as EventListener);
      try {
        socket.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
    };

    const scheduleReconnect = (reason: string, immediate = false) => {
      if (destroyedRef.current) {
        return;
      }
      // 停止心跳相关计时器，但暂不移除旧 socket 的事件监听，
      // 以便测试/模拟环境能够在同一 mock socket 上重复 open/close 验证延迟与重连策略。
      // 实际重连时会在 connectSocket() 中统一清理旧 socket。
      stopHeartbeatTimers();

      const nextAttempt = attemptRef.current + 1;
      updateAttempts(nextAttempt);
      updateBridgeState("reconnecting");

      if (nextAttempt >= maxRetries) {
        enterDegradedMode(reason);
      }

      const delay = immediate ? 0 : computeDelay(Math.max(0, nextAttempt - 1));
      telemetryRef.current?.({
        type: "reconnecting",
        attempt: nextAttempt,
        delayMs: delay,
        reason
      });

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectSocket();
      }, delay);
    };

    const handleHeartbeatTimeout = () => {
      telemetryRef.current?.({
        type: "heartbeat_timeout",
        attempt: attemptRef.current
      });
      enterDegradedMode("heartbeat-timeout");
      scheduleReconnect("heartbeat-timeout");
    };

    const refreshHeartbeat = () => {
      const now = Date.now();
      markHeartbeat(now);
      if (heartbeatTimeoutRef.current !== null) {
        window.clearTimeout(heartbeatTimeoutRef.current);
      }
      heartbeatTimeoutRef.current = window.setTimeout(handleHeartbeatTimeout, heartbeatTimeoutMs);
    };

    const startHeartbeatInterval = (socket: WebSocket) => {
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
      }
      heartbeatIntervalRef.current = window.setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: "ping" }));
          } catch {
            // ignore send errors
          }
        }
      }, heartbeatIntervalMs);
    };

    const handleEnvelope = (envelope: OrchestratorEventEnvelope) => {
      refreshHeartbeat();

      const identifier = computeEnvelopeIdentifier(envelope);
      if (!registerEventId(identifier)) {
        recordDiscardedEvent(identifier);
        telemetryRef.current?.({ type: "event_discarded", eventId: identifier });
        return;
      }

      const sequence = extractSequence(envelope.payload);
      if (typeof sequence === "number" && envelope.executionId) {
        const last = lastSequenceRef.current.get(envelope.executionId);
        if (typeof last === "number" && sequence > last + 1) {
          telemetryRef.current?.({
            type: "sequence_gap",
            executionId: envelope.executionId,
            expectedSequence: last + 1,
            receivedSequence: sequence,
            reason: "gap"
          });
          sequenceGapRef.current?.({
            executionId: envelope.executionId,
            previous: last,
            current: sequence,
            envelope
          });
          runFallback("sequence-gap");
        }
        lastSequenceRef.current.set(envelope.executionId, sequence);
      }

      onEventRef.current?.(envelope);
    };

    const handleMessage = (event: MessageEvent<string>) => {
      if (typeof event.data !== "string") {
        return;
      }
      let envelope: OrchestratorEventEnvelope | null = null;
      try {
        envelope = JSON.parse(event.data) as OrchestratorEventEnvelope;
      } catch (error) {
        console.error("解析事件失败", error);
        return;
      }
      if (!envelope || typeof envelope.event !== "string" || typeof envelope.timestamp !== "string") {
        return;
      }
      handleEnvelope(envelope);
    };

    const handleOpen = () => {
      resetSeenEvents();
      stopHeartbeatTimers();
      updateAttempts(0);
      updateBridgeState("connected");
      if (degradedRef.current) {
        degradedRef.current = false;
        updateDegradedMode(false);
      }
      telemetryRef.current?.({ type: "connected", attempt: 0 });
      refreshHeartbeat();
      const socket = socketRef.current;
      if (socket) {
        startHeartbeatInterval(socket);
      }
    };

    const handleClose = () => {
      if (destroyedRef.current) {
        return;
      }
      updateBridgeState("disconnected");
      telemetryRef.current?.({
        type: "disconnected",
        attempt: attemptRef.current
      });
      scheduleReconnect("socket-close");
    };

    const handleError = () => {
      if (destroyedRef.current) {
        return;
      }
      telemetryRef.current?.({
        type: "disconnected",
        attempt: attemptRef.current,
        reason: "socket-error"
      });
      scheduleReconnect("socket-error");
    };

    const connectSocket = () => {
      if (destroyedRef.current) {
        return;
      }
      cleanupSocket();
      updateBridgeState("connecting");
      try {
        const socket = socketFactory(topics);
        socketRef.current = socket;
        socket.addEventListener("open", handleOpen as EventListener);
        socket.addEventListener("close", handleClose as EventListener);
        socket.addEventListener("error", handleError as EventListener);
        socket.addEventListener("message", handleMessage as EventListener);
      } catch (error) {
        telemetryRef.current?.({
          type: "disconnected",
          attempt: attemptRef.current,
          reason: error instanceof Error ? error.message : String(error)
        });
        scheduleReconnect("socket-create-error");
      }
    };

    reconnectRef.current = () => {
      scheduleReconnect("manual-reconnect", true);
    };

    connectSocket();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopHeartbeatTimers();
      cleanupSocket();
    };
  }, [
    baseBackoffMs,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    jitterMs,
    markHeartbeat,
    maxBackoffMs,
    maxRetries,
    registerEventId,
    recordDiscardedEvent,
    resetSeenEvents,
    runFallback,
    socketFactory,
    topics,
    updateAttempts,
    updateBridgeState,
    updateDegradedMode
  ]);

  const reconnect = useCallback(() => {
    reconnectRef.current();
  }, []);

  return {
    bridgeState,
    degraded,
    lastHeartbeatAt,
    attempts,
    reconnect
  };
}
