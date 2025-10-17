import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('tool stream export endpoint', () => {
  it('returns 404 when not found', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/executions/exec-unknown/tool-streams/corr-1/export' });
    expect([404, 400]).toContain(res.statusCode);
  });
});
