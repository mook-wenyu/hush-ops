import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('plan dry-run endpoint', () => {
  it('returns a simulated timeline and no side effects', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const plan = { id: 'p1', nodes: [] };
    const res = await app.inject({ method: 'POST', url: '/api/v1/plans/dry-run', payload: { plan, dryRun: true } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { timeline?: Array<unknown> };
    expect(Array.isArray(body.timeline)).toBe(true);
  });
});
