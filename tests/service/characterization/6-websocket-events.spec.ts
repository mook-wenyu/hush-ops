import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrchestratorService } from '../../../src/service/orchestrator/server.js';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';

/**
 * 特征测试: WebSocket 事件总线
 * 目的: 验证 WS 连接、主题订阅、事件推送、心跳机制
 */
describe('characterization: WebSocket Events', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl: string;
  let wsUrl: string;

  beforeEach(async () => {
    const { app } = await createOrchestratorService({
      basePath: '/api/v1',
      controllerOptions: { defaultUseMockBridge: true }
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    const port = address.port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
    closeServer = async () => {
      await app.close();
    };
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  // WebSocket 连接
  it('WebSocket /ws 连接成功并接收 service.connected 事件', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'service.connected') {
          expect(message).toHaveProperty('payload');
          expect(message.payload).toHaveProperty('topics');
          expect(Array.isArray(message.payload.topics)).toBe(true);
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  it('WebSocket 连接支持 topics 查询参数筛选', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?topics=runtime,execution`);

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'service.connected') {
          expect(message.payload.topics).toContain('runtime');
          expect(message.payload.topics).toContain('execution');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  // 主题订阅管理
  it('WebSocket 支持动态订阅主题', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let connected = false;

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.event === 'service.connected') {
          connected = true;
          // 发送订阅消息
          ws.send(JSON.stringify({
            type: 'subscribe',
            topics: ['approvals', 'bridge']
          }));
        }

        if (connected && message.event === 'service.topics-updated') {
          expect(message.payload.topics).toContain('approvals');
          expect(message.payload.topics).toContain('bridge');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  it('WebSocket 支持取消订阅主题', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?topics=runtime,execution,approvals`);
      let connected = false;

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.event === 'service.connected') {
          connected = true;
          // 取消订阅
          ws.send(JSON.stringify({
            type: 'unsubscribe',
            topics: ['approvals']
          }));
        }

        if (connected && message.event === 'service.topics-updated') {
          expect(message.payload.topics).not.toContain('approvals');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  // 事件推送
  it('WebSocket 接收执行创建事件（execution.created）', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?topics=execution`);
      let connected = false;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Timeout waiting for execution.created event. Connected: ${connected}`));
      }, 10000);

      ws.on('message', async (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.event === 'service.connected') {
          connected = true;
          // 创建执行触发事件
          await fetch(`${baseUrl}/plans/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plan: {
                id: 'ws-test',
                version: 'v1',
                entry: 'root',
                nodes: [
                  { id: 'root', type: 'sequence', children: ['task'] },
                  {
                    id: 'task',
                    type: 'local_task',
                    driver: 'shell',
                    command: 'node',
                    args: ['-e', "process.stdout.write('ws-test')"],
                    riskLevel: 'low'
                  }
                ]
              }
            })
          });
        }

        if (message.event === 'execution.created') {
          clearTimeout(timeout);
          expect(message).toHaveProperty('executionId');
          expect(message.payload).toHaveProperty('planId');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  // 主题路由正确性
  it('订阅特定主题后只接收对应事件', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?topics=approvals`);
      const receivedEvents: string[] = [];

      ws.on('message', async (data: Buffer) => {
        const message = JSON.parse(data.toString());
        receivedEvents.push(message.event);

        if (message.event === 'service.connected') {
          // 创建审批请求（应该收到）
          await fetch(`${baseUrl}/approvals/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              executionId: 'ws-approval-test',
              message: 'WebSocket 测试'
            })
          });

          // 创建执行（不应该收到，因为未订阅 execution）
          await fetch(`${baseUrl}/plans/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plan: {
                id: 'ws-noise-test',
                version: 'v1',
                entry: 'root',
                nodes: []
              }
            })
          });

          setTimeout(() => {
            // 验证只收到审批相关事件，不包含执行事件
            expect(receivedEvents).toContain('service.connected');
            expect(receivedEvents).toContain('approval.pending');
            expect(receivedEvents).not.toContain('execution.created');
            ws.close();
            resolve();
          }, 2000);
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  // 系统事件总是接收
  it('system 主题事件总是被接收（无论订阅）', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?topics=execution`);
      const receivedEvents: string[] = [];

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        receivedEvents.push(message.event);

        if (message.event === 'service.connected') {
          // service.connected 是 system 主题事件
          expect(message.topics).toContain('system');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  // 背压统计端点
  it('GET /api/v1/system/event-bus 返回背压统计', async () => {
    const res = await fetch(`${baseUrl}/system/event-bus`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('stats');
    expect(body.stats).toHaveProperty('dropped');
    expect(body.stats).toHaveProperty('bufferBytesLimit');
    expect(typeof body.stats.dropped).toBe('number');
    expect(typeof body.stats.bufferBytesLimit).toBe('number');
  });

  // 错误处理
  it('WebSocket 收到无效订阅消息时返回错误', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let connected = false;

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.event === 'service.connected') {
          connected = true;
          // 发送无效消息
          ws.send('invalid json');
        }

        if (connected && message.event === 'service.error') {
          expect(message.payload).toHaveProperty('message');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  it('WebSocket 收到空主题列表时返回错误', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let connected = false;

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.event === 'service.connected') {
          connected = true;
          ws.send(JSON.stringify({
            type: 'subscribe',
            topics: []
          }));
        }

        if (connected && message.event === 'service.error') {
          expect(message.payload.message).toContain('空');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });

  // 连接管理
  it('WebSocket 关闭后清理连接', () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        // 连接已关闭
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        resolve();
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  });
}, 30000);
