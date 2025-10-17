import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('plans paging', () => {
  it('returns total and supports limit', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/plans?limit=1&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: number; plans: Array<{ id: string }> };
    expect(typeof body.total).toBe('number');
    expect(Array.isArray(body.plans)).toBe(true);
    expect(body.plans.length).toBeLessThanOrEqual(1);
  });
});
