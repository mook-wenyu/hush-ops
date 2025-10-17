import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('designer compile endpoint', () => {
  it('compiles minimal graph and returns plan+diagnostics', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/designer/compile', payload: { graph: { nodes: [], edges: [] } } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { plan?: unknown; diagnostics?: unknown[] };
    expect(body.plan).toBeDefined();
    expect(Array.isArray(body.diagnostics)).toBe(true);
  });

  it('returns diagnostics on invalid graph', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/designer/compile', payload: { graph: null } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { diagnostics?: Array<{ severity: string }> };
    expect(body.diagnostics?.some((d)=> d.severity === 'error')).toBe(true);
  });
});
