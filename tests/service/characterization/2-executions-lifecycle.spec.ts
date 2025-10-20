import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOrchestratorService } from '../../../src/service/orchestrator/server.js';
import type { AddressInfo } from 'node:net';

/**
 * 特征测试: Executions 生命周期管理
 * 目的: 验证执行记录创建、状态跟踪、停止操作等核心流程
 */
describe('characterization: Executions Lifecycle', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl: string;

  const SIMPLE_PLAN = {
    id: 'exec-simple',
    version: 'v1',
    entry: 'root',
    nodes: [
      { id: 'root', type: 'sequence', children: ['task'] },
      {
        id: 'task',
        type: 'local_task',
        driver: 'shell',
        command: 'node',
        args: ['-e', "process.stdout.write('test')"],
        riskLevel: 'low'
      }
    ]
  };

  const LONG_RUNNING_PLAN = {
    id: 'exec-long',
    version: 'v1',
    entry: 'root',
    nodes: [
      { id: 'root', type: 'sequence', children: ['sleep'] },
      {
        id: 'sleep',
        type: 'local_task',
        driver: 'shell',
        command: 'node',
        args: ['-e', 'setTimeout(() => process.exit(0), 10000)'],
        riskLevel: 'low'
      }
    ]
  };

  beforeEach(async () => {
    const { app } = await createOrchestratorService({
      basePath: '/api/v1',
      controllerOptions: { defaultUseMockBridge: true }
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
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

  // POST /api/v1/plans/execute - 创建执行
  it('POST /api/v1/plans/execute 创建执行记录', async () => {
    const res = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: SIMPLE_PLAN })
    });
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as Record<string, any>;
    expect(body.executionId).toMatch(/^exec-/);
    expect(body.planId).toBe('exec-simple');
    expect(body.status).toMatch(/pending|running/);
  });

  it('POST /api/v1/plans/execute 缺少 plan 时返回 400', async () => {
    const res = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error?.code).toBe('bad_request');
  });

  // GET /api/v1/executions - 列表查询
  it('GET /api/v1/executions 返回执行列表', async () => {
    await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: SIMPLE_PLAN })
    });

    const res = await fetch(`${baseUrl}/executions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('executions');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.executions)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
  });

  it('GET /api/v1/executions 支持分页参数', async () => {
    const res = await fetch(`${baseUrl}/executions?limit=10&offset=0`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.executions.length).toBeLessThanOrEqual(10);
  });

  // GET /api/v1/executions/:id - 获取单个执行
  it('GET /api/v1/executions/:id 返回执行详情', async () => {
    const createRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: SIMPLE_PLAN })
    });
    const { executionId } = (await createRes.json()) as Record<string, any>;

    const res = await fetch(`${baseUrl}/executions/${executionId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.id).toBe(executionId);
    expect(body.planId).toBe('exec-simple');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('createdAt');
  });

  it('GET /api/v1/executions/:id 不存在时返回 404', async () => {
    const res = await fetch(`${baseUrl}/executions/exec-non-existent`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error?.code).toBe('execution_not_found');
  });

  // POST /api/v1/executions/:id/stop - 停止执行
  it('POST /api/v1/executions/:id/stop 停止运行中的执行', async () => {
    const createRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: LONG_RUNNING_PLAN })
    });
    const { executionId } = (await createRes.json()) as Record<string, any>;

    // 等待执行开始
    await vi.waitUntil(
      async () => {
        const res = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await res.json()) as Record<string, any>;
        return body.status === 'running';
      },
      { timeout: 5000, interval: 100 }
    );

    const stopRes = await fetch(`${baseUrl}/executions/${executionId}/stop`, {
      method: 'POST'
    });
    expect([200, 201]).toContain(stopRes.status);

    // 验证状态变为 cancelled
    await vi.waitUntil(
      async () => {
        const res = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await res.json()) as Record<string, any>;
        return body.status === 'cancelled';
      },
      { timeout: 5000, interval: 200 }
    );

    const finalRes = await fetch(`${baseUrl}/executions/${executionId}`);
    const body = (await finalRes.json()) as Record<string, any>;
    expect(body.status).toBe('cancelled');
  });

  it('POST /api/v1/executions/:id/stop 不存在时返回 404', async () => {
    const res = await fetch(`${baseUrl}/executions/exec-fake/stop`, {
      method: 'POST'
    });
    expect(res.status).toBe(404);
  });

  // 执行状态流转测试
  it('执行状态从 pending -> running -> success 正常流转', async () => {
    const createRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: SIMPLE_PLAN })
    });
    const { executionId } = (await createRes.json()) as Record<string, any>;

    let statusLog: string[] = [];

    // 追踪状态变化
    await vi.waitUntil(
      async () => {
        const res = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await res.json()) as Record<string, any>;
        if (!statusLog.includes(body.status)) {
          statusLog.push(body.status);
        }
        return body.status === 'success' || body.status === 'failed';
      },
      { timeout: 15000, interval: 200 }
    );

    // 验证状态序列
    expect(statusLog).toContain('success');
    expect(statusLog.length).toBeGreaterThanOrEqual(2); // 至少 pending/running -> success
  });

  it('执行完成后包含 startedAt/finishedAt 时间戳', async () => {
    const createRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: SIMPLE_PLAN })
    });
    const { executionId } = (await createRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const res = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await res.json()) as Record<string, any>;
        return body.status !== 'running' && body.status !== 'pending';
      },
      { timeout: 15000, interval: 200 }
    );

    const res = await fetch(`${baseUrl}/executions/${executionId}`);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('startedAt');
    expect(body).toHaveProperty('finishedAt');
    expect(typeof body.startedAt).toBe('string');
    expect(typeof body.finishedAt).toBe('string');
    expect(new Date(body.finishedAt).getTime()).toBeGreaterThan(
      new Date(body.startedAt).getTime()
    );
  });

  // 边界条件测试
  it('并发创建多个执行互不干扰', async () => {
    const promises = Array.from({ length: 3 }, (_, i) =>
      fetch(`${baseUrl}/plans/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: { ...SIMPLE_PLAN, id: `exec-concurrent-${i}` }
        })
      })
    );

    const results = await Promise.all(promises);
    const bodies = (await Promise.all(results.map((r) => r.json()))) as Record<string, any>[];

    const executionIds = bodies.map((b) => b.executionId);
    const uniqueIds = new Set(executionIds);
    expect(uniqueIds.size).toBe(3); // 3 个唯一 ID
  });
}, 30000);
