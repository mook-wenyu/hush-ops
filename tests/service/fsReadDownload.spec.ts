import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resetHushOpsPathCache } from '../../src/shared/environment/pathResolver.js';

// 验证 fs/read?download=1 返回正文字符串且带下载头

describe('fs read download=1', () => {
  it('returns attachment', async () => {
    // 令服务端使用仓库内 .hush-ops 作为根目录，确保读写一致
    process.env.HUSH_OPS_HOME = join(process.cwd(), '.hush-ops');
    resetHushOpsPathCache();
    const dir = join(process.env.HUSH_OPS_HOME!, 'config', 'plans');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'dl-test.json'), JSON.stringify({ ok: 1 }));

    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/fs/read?scope=plansConfig&path=dl-test.json&download=1' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition'] || '').toContain('attachment');
    expect(JSON.parse(res.body)).toEqual({ ok: 1 });
  });
});
