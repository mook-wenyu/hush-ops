import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('schedules export', () => {
  it('exports json', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/schedules/export?format=json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type'] || '').toContain('application/json');
  });
});
