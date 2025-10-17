import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('example plans endpoints', () => {
  it('lists and imports examples', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const list = await app.inject({ method: 'GET', url: '/api/v1/plans/examples' });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { examples: Array<{ name: string }> };
    expect(Array.isArray(body.examples)).toBe(true);
    if (body.examples.length > 0) {
      const name = body.examples[0]!.name;
      const res = await app.inject({ method: 'POST', url: `/api/v1/plans/examples/${encodeURIComponent(name)}/import` });
      expect([200,201]).toContain(res.statusCode);
    }
  });
});
