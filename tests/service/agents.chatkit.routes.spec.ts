import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

const OLD = process.env.CHATKIT_ENABLED;

describe('ChatKit routes (feature flag)', () => {
  beforeAll(() => { process.env.CHATKIT_ENABLED = '1'; });
  afterAll(() => { if (OLD === undefined) delete process.env.CHATKIT_ENABLED; else process.env.CHATKIT_ENABLED = OLD; });

  it('POST /api/v1/agents/chatkit/messages returns events array', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/agents/chatkit/messages', payload: { content: 'hi' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(Array.isArray(body?.events)).toBe(true);
  });
});