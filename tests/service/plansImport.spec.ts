import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('plan import', () => {
  it('imports from raw text', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const payload = { filename: 'my-plan.json', content: JSON.stringify({ id: 'my-plan', version: 'v1', entry: 'root', nodes: [{ id: 'root', type: 'sequence', children: [] }] }) };
    const res = await app.inject({ method: 'POST', url: '/api/v1/plans/import', payload });
    expect([200,201]).toContain(res.statusCode);
  });
});
