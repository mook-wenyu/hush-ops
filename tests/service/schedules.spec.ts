import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createOrchestratorService } from '../../src/service/orchestrator/index.js';

const PLAN_DIR = join(process.cwd(), 'plans');
const TEMP_PLAN = join(PLAN_DIR, '_temp_schedule.json');

describe('schedules endpoint', () => {
  beforeAll(async () => {
    await mkdir(PLAN_DIR, { recursive: true });
    const plan = {
      id: 'temp-schedule',
      version: 'v1',
      entry: 'root',
      schedule: { enabled: true, kind: 'cron', cron: '* * * * *', concurrency: 'forbid' },
      nodes: [{ id: 'root', type: 'sequence', children: [] }]
    };
    await writeFile(TEMP_PLAN, JSON.stringify(plan, null, 2), 'utf-8');
  });

  afterAll(async () => {
    await unlink(TEMP_PLAN).catch(() => {});
  });

  it('returns registered schedules with next run', async () => {
    const { app } = await createOrchestratorService({ basePath: '/api/v1' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/schedules' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { schedules: Array<{ planId: string; cron: string; nextRunISO: string | null }> };
    const item = body.schedules.find((s) => s.planId === 'temp-schedule');
    expect(item).toBeTruthy();
    expect(item!.cron).toBe('* * * * *');
  });
});
