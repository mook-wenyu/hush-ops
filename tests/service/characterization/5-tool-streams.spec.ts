import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOrchestratorService } from '../../../src/service/orchestrator/server.js';
import type { AddressInfo } from 'node:net';

/**
 * 特征测试: Tool Streams 工具流追踪
 * 目的: 验证工具流摘要、明细、导出与重放功能
 */
describe('characterization: Tool Streams', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl: string;

  const PLAN_WITH_TOOLS = {
    id: 'tool-stream-test',
    version: 'v1',
    entry: 'root',
    nodes: [
      { id: 'root', type: 'sequence', children: ['task'] },
      {
        id: 'task',
        type: 'local_task',
        driver: 'shell',
        command: 'node',
        args: ['-e', 'console.log("test")'],
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

  // GET /api/v1/executions/:id/tool-streams - 工具流摘要
  it('GET /api/v1/executions/:id/tool-streams 返回工具流摘要', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    // 等待执行完成
    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const res = await fetch(`${baseUrl}/executions/${executionId}/tool-streams`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('streams');
    expect(Array.isArray(body.streams)).toBe(true);
  });

  it('GET /api/v1/executions/:id/tool-streams 不存在执行返回 404', async () => {
    const res = await fetch(`${baseUrl}/executions/non-existent/tool-streams`);
    expect(res.status).toBe(404);
  });

  // GET /api/v1/executions/:id/tool-streams/:correlationId - 工具流明细
  it('GET /api/v1/executions/:id/tool-streams/:correlationId 返回流式块', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const streamsRes = await fetch(`${baseUrl}/executions/${executionId}/tool-streams`);
    const { streams } = (await streamsRes.json()) as Record<string, any>;
    
    if (streams.length > 0) {
      const correlationId = streams[0].correlationId;
      const detailRes = await fetch(
        `${baseUrl}/executions/${executionId}/tool-streams/${correlationId}`
      );
      expect(detailRes.status).toBe(200);
      const body = (await detailRes.json()) as Record<string, any>;
      expect(body).toHaveProperty('chunks');
      expect(Array.isArray(body.chunks)).toBe(true);
    }
  });

  // GET /api/v1/executions/:id/tool-streams/:correlationId/export - 导出工具流
  it('GET /api/v1/executions/:id/tool-streams/:correlationId/export 导出 JSON', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const streamsRes = await fetch(`${baseUrl}/executions/${executionId}/tool-streams`);
    const { streams } = (await streamsRes.json()) as Record<string, any>;

    if (streams.length > 0) {
      const correlationId = streams[0].correlationId;
      const exportRes = await fetch(
        `${baseUrl}/executions/${executionId}/tool-streams/${correlationId}/export?format=json`
      );
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('Content-Type')).toContain('application/json');
      expect(exportRes.headers.get('Content-Disposition')).toContain('attachment');

      const text = await exportRes.text();
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty('executionId');
      expect(parsed).toHaveProperty('correlationId');
      expect(parsed).toHaveProperty('chunks');
    }
  });

  it('GET /api/v1/executions/:id/tool-streams/:correlationId/export 导出 NDJSON', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const streamsRes = await fetch(`${baseUrl}/executions/${executionId}/tool-streams`);
    const { streams } = (await streamsRes.json()) as Record<string, any>;

    if (streams.length > 0) {
      const correlationId = streams[0].correlationId;
      const exportRes = await fetch(
        `${baseUrl}/executions/${executionId}/tool-streams/${correlationId}/export?format=ndjson`
      );
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('Content-Type')).toContain('application/x-ndjson');
      expect(exportRes.headers.get('Content-Disposition')).toContain('.ndjson');
    }
  });

  // POST /api/v1/executions/:id/tool-streams/:correlationId/replay - 重放工具流
  it('POST /api/v1/executions/:id/tool-streams/:correlationId/replay 重放工具流', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const streamsRes = await fetch(`${baseUrl}/executions/${executionId}/tool-streams`);
    const { streams } = (await streamsRes.json()) as Record<string, any>;

    if (streams.length > 0) {
      const correlationId = streams[0].correlationId;
      const replayRes = await fetch(
        `${baseUrl}/executions/${executionId}/tool-streams/${correlationId}/replay`,
        { method: 'POST' }
      );
      expect(replayRes.status).toBe(200);
      const body = (await replayRes.json()) as Record<string, any>;
      expect(body).toHaveProperty('replayed');
      expect(typeof body.replayed).toBe('number');
    }
  });

  it('POST /api/v1/executions/:id/tool-streams/:correlationId/replay 不存在的流返回 404', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const res = await fetch(
      `${baseUrl}/executions/${executionId}/tool-streams/non-existent-correlation/replay`,
      { method: 'POST' }
    );
    expect(res.status).toBe(404);
  });

  // GET /api/v1/tool-streams - 全局工具流列表
  it('GET /api/v1/tool-streams 返回全局工具流列表', async () => {
    const res = await fetch(`${baseUrl}/tool-streams`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('streams');
    expect(Array.isArray(body.streams)).toBe(true);
  });

  it('GET /api/v1/tool-streams 支持分页参数', async () => {
    const res = await fetch(`${baseUrl}/tool-streams?limit=5&offset=0`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.streams.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/v1/tool-streams 支持 onlyErrors 筛选', async () => {
    const res = await fetch(`${baseUrl}/tool-streams?onlyErrors=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(Array.isArray(body.streams)).toBe(true);
    // 返回的流都应该有错误
    for (const stream of body.streams) {
      expect(stream.hasError).toBe(true);
    }
  });

  it('GET /api/v1/tool-streams 支持 tool 名称筛选', async () => {
    const res = await fetch(`${baseUrl}/tool-streams?tool=shell`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(Array.isArray(body.streams)).toBe(true);
  });

  // GET /api/v1/tool-streams/:correlationId - 全局工具流明细
  it('GET /api/v1/tool-streams/:correlationId 返回流式块（全局）', async () => {
    // 先创建一个执行
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const streamsRes = await fetch(`${baseUrl}/tool-streams`);
    const { streams } = (await streamsRes.json()) as Record<string, any>;

    if (streams.length > 0) {
      const correlationId = streams[0].correlationId;
      const detailRes = await fetch(`${baseUrl}/tool-streams/${correlationId}`);
      expect(detailRes.status).toBe(200);
      const body = (await detailRes.json()) as Record<string, any>;
      expect(body).toHaveProperty('chunks');
      expect(Array.isArray(body.chunks)).toBe(true);
    }
  });

  it('GET /api/v1/tool-streams/:correlationId 不存在时返回 404', async () => {
    const res = await fetch(`${baseUrl}/tool-streams/non-existent-correlation`);
    expect(res.status).toBe(404);
  });

  // GET /api/v1/tool-streams/:correlationId/export - 全局导出
  it('GET /api/v1/tool-streams/:correlationId/export 导出 JSON（全局）', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const streamsRes = await fetch(`${baseUrl}/tool-streams`);
    const { streams } = (await streamsRes.json()) as Record<string, any>;

    if (streams.length > 0) {
      const correlationId = streams[0].correlationId;
      const exportRes = await fetch(
        `${baseUrl}/tool-streams/${correlationId}/export?format=json`
      );
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('Content-Type')).toContain('application/json');

      const text = await exportRes.text();
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty('correlationId');
      expect(parsed).toHaveProperty('chunks');
    }
  });

  // 工具流摘要字段完整性
  it('工具流摘要包含必要字段', async () => {
    const execRes = await fetch(`${baseUrl}/plans/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: PLAN_WITH_TOOLS })
    });
    const { executionId } = (await execRes.json()) as Record<string, any>;

    await vi.waitUntil(
      async () => {
        const statusRes = await fetch(`${baseUrl}/executions/${executionId}`);
        const body = (await statusRes.json()) as Record<string, any>;
        return body.status !== 'pending' && body.status !== 'running';
      },
      { timeout: 15000, interval: 200 }
    );

    const res = await fetch(`${baseUrl}/tool-streams`);
    const { streams } = (await res.json()) as Record<string, any>;

    if (streams.length > 0) {
      const stream = streams[0];
      expect(stream).toHaveProperty('correlationId');
      expect(stream).toHaveProperty('toolName');
      expect(stream).toHaveProperty('chunkCount');
      expect(stream).toHaveProperty('updatedAt');
      expect(stream).toHaveProperty('completed');
      expect(stream).toHaveProperty('hasError');
    }
  });
}, 30000);
