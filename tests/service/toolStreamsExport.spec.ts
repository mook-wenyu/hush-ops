import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';
import { join } from 'node:path';
import { resetHushOpsPathCache } from '../../src/shared/environment/pathResolver.js';

// 验证 tool-streams 导出：ndjson & gzip 头部

describe('tool-streams export', () => {
  it('returns ndjson with gzip when compress=1', async () => {
    process.env.HUSH_OPS_HOME = join(process.cwd(), '.hush-ops');
    resetHushOpsPathCache();

    const { app, controller } = await createOrchestratorService({ basePath: '/api/v1' });

    const execId = 'exec-1';
    const corrId = 'corr-1';

    // 直接写入执行记录（绕过私有封装，仅用于测试）
    const now = new Date().toISOString();
    (controller as any).executions.set(execId, {
      id: execId,
      planId: 'plan-1',
      createdAt: now,
      executorType: 'mock',
      status: 'running',
      bridgeStates: [],
      pendingApprovals: []
    });

    // 直接写入工具流块到控制器的 ToolStreamStore
    const store = (controller as any).toolStreamStore as { appendChunk: Function };
    store.appendChunk({
      correlationId: corrId,
      toolName: 'echo',
      executionId: execId,
      planId: 'plan-1',
      nodeId: 'n1',
      status: 'success',
      message: 'ok',
      timestamp: now
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/executions/${execId}/tool-streams/${corrId}/export?format=ndjson&compress=1` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type'] || '').toContain('application/x-ndjson');
    expect((res.headers['content-encoding'] || '').toLowerCase()).toBe('gzip');
    expect(res.body.length).toBeGreaterThan(0);
  });
});
