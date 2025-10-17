import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { statSync, readdirSync } from 'node:fs';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';
import { resetHushOpsPathCache } from '../../src/shared/environment/pathResolver.js';

// 验证 Tool Streams 超阈值后归档并继续写入

describe('tool streams rotation', () => {
  it('archives when exceeding size and keeps writing', async () => {
    // 将状态目录指向仓库下的 .hush-ops
    process.env.HUSH_OPS_HOME = join(process.cwd(), '.hush-ops');
    // 设置极小阈值以快速触发滚动
    process.env.TOOL_STREAM_STORE_MAX_BYTES = String(4 * 1024);
    process.env.TOOL_STREAM_STORE_COMPRESS = '1';
    resetHushOpsPathCache();

    const { controller } = await createOrchestratorService({ basePath: '/api/v1' });

    const execId = 'exec-rot';
    (controller as any).executions.set(execId, {
      id: execId,
      planId: 'plan-rot',
      createdAt: new Date().toISOString(),
      executorType: 'mock',
      status: 'running',
      bridgeStates: [],
      pendingApprovals: []
    });

    const store = (controller as any).toolStreamStore as { appendChunk: Function };

    // 写入多批数据直至超过阈值
    for (let i = 0; i < 200; i++) {
      store.appendChunk({
        correlationId: 'c-rot',
        toolName: 'echo',
        executionId: execId,
        planId: 'plan-rot',
        nodeId: 'n1',
        status: 'info',
        message: 'x'.repeat(128),
        timestamp: new Date().toISOString()
      });
    }

    // 检查归档文件是否出现
    const stateDir = join(process.env.HUSH_OPS_HOME!, 'state');
    const archivesDir = join(stateDir, 'archives');
    const files = readdirSync(archivesDir);
    const hasArchive = files.some((f) => f.startsWith('tool-streams-') && f.endsWith('.json.gz'));
    expect(hasArchive).toBe(true);

    // 归档后继续写入应成功（主文件被重置）
    store.appendChunk({
      correlationId: 'c-rot', toolName: 'echo', executionId: execId, planId: 'plan-rot', nodeId: 'n2', status: 'success', message: 'ok', timestamp: new Date().toISOString()
    });

    const size = statSync(join(stateDir, 'tool-streams.json')).size;
    expect(size).toBeGreaterThan(0);
  });
});
