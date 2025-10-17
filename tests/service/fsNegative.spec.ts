import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

// 负向与越界用例：.. 越界、设备名、混合分隔符

describe('fs api negative cases', () => {
  it('rejects path traversal and non-file/dir cases', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });

    // 越界（..）
    const res1 = await app.inject({ method: 'GET', url: `/api/v1/fs/read?scope=plansConfig&path=${encodeURIComponent('../secrets.json')}` });
    expect(res1.statusCode).toBeGreaterThanOrEqual(400);

    // 非文件读取
    const res2 = await app.inject({ method: 'GET', url: `/api/v1/fs/read?scope=plansConfig&path=${encodeURIComponent('')}` });
    expect(res2.statusCode).toBeGreaterThanOrEqual(400);

    // 设备名写入（Windows 禁止，其他平台通常也会失败）
    const res3 = await app.inject({ method: 'POST', url: '/api/v1/fs/write', payload: { scope: 'plansConfig', path: 'CON', content: 'x' } });
    expect(res3.statusCode).toBeGreaterThanOrEqual(400);
  });
});
