import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

// 最小 FS API 测试：写入→读取→移动→删除（在 plansConfig 范围内）

describe('fs api (plansConfig scope)', () => {
  it('write/read/move/delete', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const pathA = 'tmp/fs-test-a.json';
    const pathB = 'tmp/fs-test-b.json';
    // write
    let res = await app.inject({ method: 'POST', url: '/api/v1/fs/write', payload: { scope: 'plansConfig', path: pathA, content: JSON.stringify({ ok: 1 }) } });
    expect(res.statusCode).toBe(200);
    // read
    res = await app.inject({ method: 'GET', url: `/api/v1/fs/read?scope=plansConfig&path=${encodeURIComponent(pathA)}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse((res.json() as any).content).ok).toBe(1);
    // move
    res = await app.inject({ method: 'POST', url: '/api/v1/fs/move', payload: { scope: 'plansConfig', from: pathA, to: pathB } });
    expect(res.statusCode).toBe(200);
    // delete
    res = await app.inject({ method: 'DELETE', url: '/api/v1/fs/delete', payload: { scope: 'plansConfig', path: pathB } });
    expect(res.statusCode).toBe(200);
  });
});
