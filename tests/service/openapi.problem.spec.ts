import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

// 仅断言 OpenAPI 文档含 Problem schema 与若干 4xx/5xx 响应占位

describe('openapi problem details', () => {
  it('exposes RFC7807 Problem schema and negative responses', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json() as any;
    expect(doc?.components?.schemas?.Problem).toBeDefined();
    expect(doc?.paths?.['/api/v1/plans']?.get?.responses?.['400']).toBeDefined();
    expect(doc?.paths?.['/api/v1/designer/compile']?.post?.responses?.['500']).toBeDefined();
  });
});
