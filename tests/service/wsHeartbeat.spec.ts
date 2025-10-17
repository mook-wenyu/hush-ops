import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOrchestratorService, WS_PING_INTERVAL_MS, WS_IDLE_TIMEOUT_MS } from '../../src/service/orchestrator/server.js';

// 以假 socket 模拟 ping/pong/close，使用 fake timers 验证 15s ping 与 45s 超时关闭

describe('ws heartbeat', () => {
  const timers = vi.useFakeTimers();
  afterEach(() => {
    timers.clearAllTimers();
  });

  function makeSocket() {
    const handlers: Record<string, Function[]> = {};
    const socket = {
      OPEN: 1,
      readyState: 1,
      ping: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      on: (event: string, cb: Function) => {
        handlers[event] = handlers[event] || [];
        handlers[event].push(cb);
      },
      emit: (event: string, ...args: any[]) => {
        (handlers[event] || []).forEach((cb) => cb(...args));
      }
    } as any;
    return socket;
  }

  it('pings every interval and closes after idle timeout', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const init = (app as any).__initWsConnectionForTest as (socket: any, topics?: string|string[]) => void;
    const sock = makeSocket();

    init(sock, 'runtime');

    // 触发一次 ping
    await timers.advanceTimersByTimeAsync(WS_PING_INTERVAL_MS + 10);
    expect(sock.ping).toHaveBeenCalledTimes(1);

    // 未收到 pong，在 3 个间隔后应超时关闭（>45s）
    await timers.advanceTimersByTimeAsync(WS_PING_INTERVAL_MS * 3 + 100);
    expect(sock.close).toHaveBeenCalled();
  });

  it('pong resets idle timer and prevents close', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const init = (app as any).__initWsConnectionForTest as (socket: any, topics?: string|string[]) => void;
    const sock = makeSocket();
    init(sock, 'runtime');

    // 第一次 ping 后立即 pong，刷新计时
    await timers.advanceTimersByTimeAsync(WS_PING_INTERVAL_MS + 10);
    sock.emit('pong');

    // 再推进略小于 idle 超时，不应关闭
    await timers.advanceTimersByTimeAsync(WS_IDLE_TIMEOUT_MS - 1000);
    expect(sock.close).not.toHaveBeenCalled();
  });
});
