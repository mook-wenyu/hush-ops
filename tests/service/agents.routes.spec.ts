import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

const OLD = process.env.AGENTS_ENABLED;

describe('Agents routes (feature flag)', () => {
  beforeAll(() => { process.env.AGENTS_ENABLED = '1'; });
  afterAll(() => { if (OLD === undefined) delete process.env.AGENTS_ENABLED; else process.env.AGENTS_ENABLED = OLD; });

  it('POST /api/v1/agents/session/messages echoes', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/agents/session/messages', payload: { message: 'ping' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body?.ok).toBe(true);
    expect(body?.reply?.role).toBe('assistant');
  });
});