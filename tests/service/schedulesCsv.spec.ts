import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resetHushOpsPathCache } from '../../src/shared/environment/pathResolver.js';

// 验证 CSV 导出基础头与内容

describe('schedules export csv', () => {
  it('exports csv with header and at least one row', async () => {
    // 令服务端使用仓库内 .hush-ops 作为根目录
    process.env.HUSH_OPS_HOME = join(process.cwd(), '.hush-ops');
    resetHushOpsPathCache();
    const configDir = join(process.env.HUSH_OPS_HOME!, 'config', 'plans');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'csv-test.json'), JSON.stringify({
      id: 'csv-test',
      version: 'v1',
      entry: 'root',
      nodes: [
        { id: 'root', type: 'sequence', children: ['n1'] },
        { id: 'n1', type: 'local_task', driver: 'shell', command: 'echo ok' }
      ],
      schedule: { enabled: true, kind: 'cron', cron: '*/5 * * * *' }
    }, null, 2), 'utf-8');

    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/schedules/export?format=csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type'] || '').toContain('text/csv');
    const body = res.body.trim();
    // 头部包含常见字段
    expect(body.split('\n')[0]).toContain('planId');
    // 至少一条数据行包含 planId
    expect(body).toContain('csv-test');
  });
});
