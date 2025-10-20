import { describe, it, expect } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

describe('openapi.json', () => {
  it('returns 200 with components.schemas and key paths', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = JSON.parse(res.body);
    expect(doc.openapi).toBeDefined();
    expect(doc.components?.schemas?.PlanSummary).toBeDefined();
    expect(doc.paths['/api/v1/plans']).toBeDefined();
    expect(doc.paths['/api/v1/executions']).toBeDefined();
    expect(doc.paths['/api/v1/designer/compile']).toBeDefined();
    expect(doc.paths['/api/v1/plans/dry-run']).toBeDefined();
  });
});
