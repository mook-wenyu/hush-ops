/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppStore } from "../../../src/ui/state/appStore";
import type { BridgeTelemetryEvent } from "../../../src/ui/hooks/useBridgeConnection";
import { useBridgeConnection } from "../../../src/ui/hooks/useBridgeConnection";
import { MockWebSocket } from "../state/__fixtures__/mockWebSocket";

describe("useBridgeConnection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("@ws-unit 刷新心跳并派发事件", () => {
      const store = createAppStore();
      const telemetry: BridgeTelemetryEvent[] = [];
      const onEvent = vi.fn();
      const socket = new MockWebSocket();
      const factory = vi.fn(() => socket as unknown as WebSocket);

      const { result } = renderHook(() =>
        useBridgeConnection({
          topics: ["runtime"],
          storeEnabled: true,
          storeApi: store,
          socketFactory: factory,
          telemetry: (entry) => telemetry.push(entry),
          onEvent
        })
      );

      expect(factory).toHaveBeenCalledTimes(1);

      act(() => {
        socket.open();
      });

      expect(result.current.bridgeState).toBe("connected");

      const envelope = {
        event: "runtime.state-change",
        executionId: "exec-1",
        timestamp: new Date().toISOString(),
        payload: { sequence: 1 }
      };

      act(() => {
        socket.receive(JSON.stringify(envelope));
      });

      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenLastCalledWith(envelope);
      expect(store.getState().runtime.lastHeartbeatAt).not.toBeNull();
      expect(result.current.lastHeartbeatAt).not.toBeNull();
      expect(telemetry.find((entry) => entry.type === "heartbeat")).toBeDefined();
  });

  it("@ws-unit 记录重复事件并丢弃处理", () => {
      const store = createAppStore();
      const onEvent = vi.fn();
      const telemetry: BridgeTelemetryEvent[] = [];
      const socket = new MockWebSocket();
      const factory = vi.fn(() => socket as unknown as WebSocket);

      renderHook(() =>
        useBridgeConnection({
          topics: ["execution"],
          storeEnabled: true,
          storeApi: store,
          socketFactory: factory,
          telemetry: (entry) => telemetry.push(entry),
          onEvent
        })
      );

      act(() => {
        socket.open();
      });

      const envelope = {
        event: "execution.completed",
        executionId: "exec-42",
        timestamp: new Date().toISOString(),
        payload: { id: "exec-42", sequence: 7 }
      };

      act(() => {
        socket.receive(JSON.stringify(envelope));
      });

      act(() => {
        socket.receive(JSON.stringify(envelope));
      });

      expect(onEvent).toHaveBeenCalledTimes(1);
      const discarded = store.getState().runtime.discardedEventIds;
      expect(discarded).toHaveLength(1);
      expect(telemetry.find((entry) => entry.type === "event_discarded")).toBeDefined();
  });

  it("@ws-unit 心跳超时进入降级并触发回退", async () => {
      vi.useFakeTimers();
      try {
        const store = createAppStore();
        const telemetry: BridgeTelemetryEvent[] = [];
        const fallback = vi.fn(() => Promise.resolve());
        const sockets: MockWebSocket[] = [];
        const factory = vi.fn(() => {
          const instance = new MockWebSocket();
          sockets.push(instance);
          return instance as unknown as WebSocket;
        });

        const { result } = renderHook(() =>
          useBridgeConnection({
            topics: ["runtime"],
            storeEnabled: true,
            storeApi: store,
            socketFactory: factory,
            heartbeatIntervalMs: 1_000,
            heartbeatTimeoutMs: 3_000,
            baseBackoffMs: 500,
            maxBackoffMs: 8_000,
            jitterMs: 0,
            telemetry: (entry) => telemetry.push(entry),
            onFallbackPoll: fallback
          })
        );

        const firstSocket = sockets[0];
        expect(firstSocket).toBeDefined();
        if (!firstSocket) {
          throw new Error("未创建初始 WebSocket 实例");
        }

        act(() => {
          firstSocket.open();
        });

        act(() => {
          vi.advanceTimersByTime(1_000);
        });

        act(() => {
          vi.advanceTimersByTime(3_000);
        });

        await Promise.resolve();

        expect(result.current.degraded).toBe(true);
        expect(store.getState().runtime.degradedMode).toBe(true);
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(
          telemetry.find(
            (entry) =>
              entry.type === "degraded" && entry.reason === "heartbeat-timeout"
          )
        ).toBeDefined();
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }
  });

  it("@ws-unit 退避抖动延迟被限制在 min/max", async () => {
    const store = createAppStore();
    const telemetry: BridgeTelemetryEvent[] = [];
    const socket = new MockWebSocket();
    const factory = vi.fn(() => socket as unknown as WebSocket);

    // 先测试 max clamp：random=1 → raw+jitter 超过 maxBackoff → clamp 到 max
    const rndMax = vi.spyOn(Math, 'random').mockReturnValue(1);
    renderHook(() =>
      useBridgeConnection({
        topics: ["runtime"],
        storeEnabled: true,
        storeApi: store,
        socketFactory: factory,
        baseBackoffMs: 2_000,
        maxBackoffMs: 4_000,
        jitterMs: 100_000,
        telemetry: (entry) => telemetry.push(entry)
      })
    );
    act(() => { socket.open(); });
    act(() => { socket.close(); });

    const lastReconnecting = [...telemetry].reverse().find(t => t.type === 'reconnecting');
    expect(lastReconnecting?.delayMs).toBe(4_000);
    rndMax.mockRestore();

    // 再测试 min clamp：random=0 → raw-jitter 小于 baseBackoff → clamp 到 base
    const rndMin = vi.spyOn(Math, 'random').mockReturnValue(0);
    telemetry.length = 0;
    act(() => { socket.open(); });
    act(() => { socket.close(); });
    const minReconnecting = [...telemetry].reverse().find(t => t.type === 'reconnecting');
    expect(minReconnecting?.delayMs).toBe(2_000);
    rndMin.mockRestore();
  });

  it("@ws-unit 序列缺口仅触发一次回退轮询", async () => {
    const store = createAppStore();
    const fallback = vi.fn(() => new Promise(() => { /* 持续 pending，验证只触发一次 */ }));
    const telemetry: BridgeTelemetryEvent[] = [];
    const socket = new MockWebSocket();
    const factory = vi.fn(() => socket as unknown as WebSocket);

    renderHook(() =>
      useBridgeConnection({
        topics: ["execution"],
        storeEnabled: true,
        storeApi: store,
        socketFactory: factory,
        telemetry: (e) => telemetry.push(e),
        onFallbackPoll: fallback
      })
    );

    act(() => { socket.open(); });

    // 正常事件 seq=1（建立基线）
    act(() => {
      socket.receive(JSON.stringify({
        event: 'execution.completed',
        executionId: 'exec-gap',
        timestamp: new Date().toISOString(),
        payload: { id: 'exec-gap', sequence: 1 }
      }));
    });

    // 缺口事件 seq=3 → 触发一次 fallback
    act(() => {
      socket.receive(JSON.stringify({
        event: 'execution.completed',
        executionId: 'exec-gap',
        timestamp: new Date().toISOString(),
        payload: { id: 'exec-gap', sequence: 3 }
      }));
    });

    // 再次缺口（或更大缺口）立刻触发，但 runFallback 正在 in-flight，应不重复调用
    act(() => {
      socket.receive(JSON.stringify({
        event: 'execution.completed',
        executionId: 'exec-gap',
        timestamp: new Date().toISOString(),
        payload: { id: 'exec-gap', sequence: 5 }
      }));
    });

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(telemetry.some(t => t.type === 'sequence_gap')).toBe(true);
  });

  it("@ws-unit 重连后重置 attempts 与 degraded", () => {
    vi.useFakeTimers();
    try {
      const store = createAppStore();
      const telemetry: BridgeTelemetryEvent[] = [];
      const sockets: MockWebSocket[] = [];
      const factory = vi.fn(() => {
        const s = new MockWebSocket();
        sockets.push(s);
        return s as unknown as WebSocket;
      });

      const { result } = renderHook(() =>
        useBridgeConnection({
          topics: ["runtime"],
          storeEnabled: true,
          storeApi: store,
          socketFactory: factory,
          baseBackoffMs: 500,
          maxBackoffMs: 500,
          jitterMs: 0,
          telemetry: (e) => telemetry.push(e)
        })
      );

      const s1 = sockets[0];
      expect(s1).toBeDefined();
      const s1nn = s1!;
      act(() => { s1nn.open(); });
      expect(result.current.attempts).toBe(0);
      expect(result.current.degraded).toBe(false);

      // 关闭以触发重连与尝试计数+1
      act(() => { s1nn.close(); });
      expect(result.current.attempts).toBe(1);

      // 推进到重连执行
      act(() => { vi.advanceTimersByTime(500); });

      const s2 = sockets[1];
      expect(s2).toBeDefined();
      const s2nn = s2!;
      act(() => { s2nn.open(); });

      // 重连成功后应重置 attempts=0 且 degraded=false
      expect(result.current.attempts).toBe(0);
      expect(result.current.degraded).toBe(false);
      expect(store.getState().runtime.degradedMode).toBe(false);
      expect(telemetry.find(t => t.type === 'connected' && t.attempt === 0)).toBeDefined();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
