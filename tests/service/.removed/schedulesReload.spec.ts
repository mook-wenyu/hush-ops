import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

describe('POST /api/v1/schedules/reload', () => {
  const planDir = join(process.cwd(), 'plans');
  const tempPlan = join(planDir, '_reload.json');

  beforeAll(async () => {
    await mkdir(planDir, { recursive: true });
    await writeFile(tempPlan, JSON.stringify({ id: 'reload-demo', version: 'v1', entry: 'root', schedule: { enabled: true, kind: 'cron', cron: '* * * * *' }, nodes: [{ id: 'root', type: 'sequence', children: [] }] }, null, 2), 'utf-8');
  });

  afterAll(async () => {
    await unlink(tempPlan).catch(() => {});
  });

  it('reloads schedules and returns count', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/schedules/reload' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { count?: number };
    expect(typeof body.count).toBe('number');
  });
});
