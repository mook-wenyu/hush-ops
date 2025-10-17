import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resetHushOpsPathCache } from '../../src/shared/environment/pathResolver.js';

// 验证 CSV 导出对含逗号字段进行加引号，并使用 CRLF 行结尾

describe('schedules export csv edge cases', () => {
  it('quotes fields containing comma and uses CRLF', async () => {
    // 令服务端使用带逗号的目录作为根目录，从而使导出中的 dir 字段包含逗号
    const homeWithComma = join(process.cwd(), '.hush-ops,qa');
    process.env.HUSH_OPS_HOME = homeWithComma;
    resetHushOpsPathCache();

    const plansDir = join(homeWithComma, 'config', 'plans');
    await mkdir(plansDir, { recursive: true });

    await writeFile(join(plansDir, 'csv-edge.json'), JSON.stringify({
      id: 'csv-edge',
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

    const body = res.body;
    // 使用 CRLF 行结尾（最后一行也应以 CRLF 结束）
    expect(body.endsWith('\r\n')).toBe(true);
    const lines = body.split('\r\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);

    // 第二行是首条数据，检查包含 planId 与带引号的 dir（包含逗号应被整体加引号）
    const row = lines[1];
    expect(row).toContain('csv-edge');
    const expectedDir = `"${plansDir}"`;
    expect(row).toContain(`,${expectedDir},`);
  });
});
