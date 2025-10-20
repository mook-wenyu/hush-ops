import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrchestratorService } from '../../../src/service/orchestrator/server.js';
import type { AddressInfo } from 'node:net';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { joinConfigPath } from '../../../src/shared/environment/pathResolver.js';

/**
 * 特征测试: Schedules 调度管理
 * 目的: 验证 Cron 调度列表、reload、导出等功能
 */
describe('characterization: Schedules Management', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl: string;
  let testPlansDir: string;

  beforeEach(async () => {
    testPlansDir = join(process.cwd(), '.test-plans-char');
    await mkdir(testPlansDir, { recursive: true });

    const { app } = await createOrchestratorService({
      basePath: '/api/v1',
      controllerOptions: { defaultUseMockBridge: true }
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    closeServer = async () => {
      await app.close();
    };
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
    await rm(testPlansDir, { recursive: true, force: true });
  });

  // GET /api/v1/schedules - 列表查询
  it('GET /api/v1/schedules 返回调度列表（无调度时为空）', async () => {
    const res = await fetch(`${baseUrl}/schedules`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('schedules');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.schedules)).toBe(true);
  });

  it('GET /api/v1/schedules 支持 source 参数筛选', async () => {
    const res1 = await fetch(`${baseUrl}/schedules?source=repo`);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as Record<string, any>;
    expect(Array.isArray(body1.schedules)).toBe(true);

    const res2 = await fetch(`${baseUrl}/schedules?source=config`);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as Record<string, any>;
    expect(Array.isArray(body2.schedules)).toBe(true);
  });

  it('GET /api/v1/schedules 支持 within 参数（未来N分钟）', async () => {
    const res = await fetch(`${baseUrl}/schedules?within=60`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(Array.isArray(body.schedules)).toBe(true);
    // within 筛选应该只返回未来 60 分钟内的调度
  });

  it('GET /api/v1/schedules 支持 sort 参数（nextAsc/nextDesc）', async () => {
    const res1 = await fetch(`${baseUrl}/schedules?sort=nextAsc`);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as Record<string, any>;
    expect(Array.isArray(body1.schedules)).toBe(true);

    const res2 = await fetch(`${baseUrl}/schedules?sort=nextDesc`);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as Record<string, any>;
    expect(Array.isArray(body2.schedules)).toBe(true);
  });

  it('GET /api/v1/schedules 支持分页参数 limit/offset', async () => {
    const res = await fetch(`${baseUrl}/schedules?limit=5&offset=0`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.schedules.length).toBeLessThanOrEqual(5);
  });

  // POST /api/v1/schedules/reload - 重载调度
  it('POST /api/v1/schedules/reload 成功重载并返回计数', async () => {
    const res = await fetch(`${baseUrl}/schedules/reload`, {
      method: 'POST'
    });
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('reloaded');
    expect(body).toHaveProperty('count');
    expect(typeof body.count).toBe('number');
  });

  it('POST /api/v1/schedules/reload 重载后新增调度被识别', async () => {
    const planWithSchedule = {
      id: 'scheduled-plan',
      version: 'v1',
      entry: 'root',
      nodes: [{ id: 'root', type: 'sequence', children: [] }],
      schedule: {
        enabled: true,
        kind: 'cron',
        cron: '*/5 * * * *' // 每5分钟
      }
    };

    // 使用系统配置目录（与server一致）
    const configPlansDir = joinConfigPath('plans');
    await mkdir(configPlansDir, { recursive: true });
    const filePath = join(configPlansDir, 'scheduled-plan.json');
    await writeFile(
      filePath,
      JSON.stringify(planWithSchedule, null, 2)
    );

    // 等待文件系统同步
    await new Promise(resolve => setTimeout(resolve, 300));

    // 验证文件确实写入
    const { stat } = await import('node:fs/promises');
    const fileExists = await stat(filePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const reloadRes = await fetch(`${baseUrl}/schedules/reload`, {
      method: 'POST'
    });
    expect([200, 201]).toContain(reloadRes.status);
    const reloadBody = (await reloadRes.json()) as Record<string, any>;
    expect(reloadBody).toHaveProperty('reloaded');
    expect(reloadBody).toHaveProperty('count');

    // 等待reload完成
    await new Promise(resolve => setTimeout(resolve, 300));

    const listRes = await fetch(`${baseUrl}/schedules`);
    const listBody = (await listRes.json()) as Record<string, any>;

    // 调试：输出所有planId
    const planIds = listBody.schedules.map((s: { planId: string }) => s.planId);
    console.log('Loaded schedules:', planIds);

    const found = listBody.schedules.some(
      (s: { planId: string }) => s.planId === 'scheduled-plan'
    );
    expect(found).toBe(true);
  });

  // GET /api/v1/schedules/export - 导出调度
  it('GET /api/v1/schedules/export 默认导出 JSON 格式', async () => {
    const res = await fetch(`${baseUrl}/schedules/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');

    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('schedules');
    expect(Array.isArray(body.schedules)).toBe(true);
  });

  it('GET /api/v1/schedules/export?format=csv 导出 CSV 格式', async () => {
    const res = await fetch(`${baseUrl}/schedules/export?format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('.csv');

    const text = await res.text();
    expect(text).toContain('planId'); // CSV header
  });

  // 调度记录详情测试
  it('调度记录包含必要字段', async () => {
    const planWithSchedule = {
      id: 'test-schedule-fields',
      version: 'v1',
      entry: 'root',
      nodes: [],
      schedule: {
        enabled: true,
        kind: 'cron',
        cron: '0 0 * * *'
      }
    };

    // 使用系统配置目录
    const configPlansDir = joinConfigPath('plans');
    await mkdir(configPlansDir, { recursive: true });
    const filePath = join(configPlansDir, 'test-schedule-fields.json');
    await writeFile(
      filePath,
      JSON.stringify(planWithSchedule, null, 2)
    );

    // 等待文件系统同步
    await new Promise(resolve => setTimeout(resolve, 300));

    // 验证文件确实写入
    const { stat } = await import('node:fs/promises');
    const fileExists = await stat(filePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const reloadRes = await fetch(`${baseUrl}/schedules/reload`, { method: 'POST' });
    expect([200, 201]).toContain(reloadRes.status);

    // 等待reload完成
    await new Promise(resolve => setTimeout(resolve, 300));

    const res = await fetch(`${baseUrl}/schedules`);
    const body = (await res.json()) as Record<string, any>;

    // 调试：输出所有planId
    const planIds = body.schedules.map((s: { planId: string }) => s.planId);
    console.log('All schedules:', planIds);

    const schedule = body.schedules.find(
      (s: { planId: string }) => s.planId === 'test-schedule-fields'
    );

    expect(schedule).toBeDefined();
    if (schedule) {
      expect(schedule).toHaveProperty('planId');
      expect(schedule).toHaveProperty('cron');
      expect(schedule).toHaveProperty('source'); // 'repo' 或 'config'
      expect(schedule).toHaveProperty('file');
      expect(schedule).toHaveProperty('dir');
      expect(schedule).toHaveProperty('nextRunISO');
    }
  });

  it('调度记录包含 lastRun 信息（如果执行过）', async () => {
    const res = await fetch(`${baseUrl}/schedules`);
    const body = (await res.json()) as Record<string, any>;
    // 即使没有执行过，lastRun 也应该存在（可能为 null）
    if (body.schedules.length > 0) {
      expect(body.schedules[0]).toHaveProperty('lastRun');
    }
  });

  // 边界条件测试
  it('无 schedule 字段的计划不被调度', async () => {
    const planWithoutSchedule = {
      id: 'no-schedule-plan',
      version: 'v1',
      entry: 'root',
      nodes: []
    };

    await writeFile(
      join(testPlansDir, 'no-schedule-plan.json'),
      JSON.stringify(planWithoutSchedule, null, 2)
    );

    await fetch(`${baseUrl}/schedules/reload`, { method: 'POST' });

    const res = await fetch(`${baseUrl}/schedules`);
    const body = (await res.json()) as Record<string, any>;
    const found = body.schedules.some(
      (s: { planId: string }) => s.planId === 'no-schedule-plan'
    );
    expect(found).toBe(false);
  });

  it('schedule.enabled=false 的计划不被调度', async () => {
    const disabledSchedule = {
      id: 'disabled-schedule-plan',
      version: 'v1',
      entry: 'root',
      nodes: [],
      schedule: {
        enabled: false,
        kind: 'cron',
        cron: '* * * * *'
      }
    };

    await writeFile(
      join(testPlansDir, 'disabled-schedule-plan.json'),
      JSON.stringify(disabledSchedule, null, 2)
    );

    await fetch(`${baseUrl}/schedules/reload`, { method: 'POST' });

    const res = await fetch(`${baseUrl}/schedules`);
    const body = (await res.json()) as Record<string, any>;
    const found = body.schedules.some(
      (s: { planId: string }) => s.planId === 'disabled-schedule-plan'
    );
    expect(found).toBe(false);
  });
}, 30000);
