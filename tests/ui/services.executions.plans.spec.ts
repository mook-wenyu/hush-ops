/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchExecutions, fetchExecutionById, stopExecution } from '../../src/ui/services/executions';
import { fetchPlans, fetchPlanById, createPlan, updatePlan, deletePlan, executePlan, executePlanById } from '../../src/ui/services/plans';

function mockJson(obj: any, init: Partial<ResponseInit> = {}) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
}

describe('services — executions & plans', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(async () => mockJson({})); });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('fetchExecutions 返回数组（payload.ex: []）', async () => {
    (global.fetch as any).mockImplementation(async () => mockJson({ executions: [{ id: 'e1' }] }));
    const arr = await fetchExecutions();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThan(0);
    expect(arr[0]!.id).toBe('e1');
  });

  it('fetchExecutionById 返回 ExecutionRecord', async () => {
    (global.fetch as any).mockImplementation(async () => mockJson({ id: 'e2' }));
    const item = await fetchExecutionById('e2');
    expect(item.id).toBe('e2');
  });

  it('stopExecution 调用 POST /stop 成功', async () => {
    (global.fetch as any).mockImplementation(async () => mockJson({}));
    await expect(stopExecution('e3')).resolves.toBeUndefined();
  });

  it('fetchPlans 返回默认 [] 当 payload.plans 缺失', async () => {
    (global.fetch as any).mockImplementation(async () => mockJson({}));
    const arr = await fetchPlans();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(0);
  });

  it('fetchPlanById 错误返回 null', async () => {
    (global.fetch as any).mockImplementation(async () => new Response('x', { status: 500 }));
    const res = await fetchPlanById('p1');
    expect(res).toBeNull();
  });

  it('executePlan 与 executePlanById 返回 executionId', async () => {
    (global.fetch as any).mockImplementation(async () => mockJson({ executionId: 'x1', status: 'running', planId: 'p1' }));
    const a = await executePlan({});
    expect(a.executionId).toBe('x1');
    const b = await executePlanById('p1');
    expect(b.executionId).toBe('x1');
  });

  it('create/update/delete Plan 调用成功', async () => {
    (global.fetch as any).mockImplementation(async (input: any, init: any) => {
      if (String(input).endsWith('/plans') && init?.method === 'POST') return mockJson({ id: 'p1' });
      return mockJson({});
    });
    const c = await createPlan({});
    expect(c.id).toBe('p1');
    await expect(updatePlan('p1', {})).resolves.toBeUndefined();
    await expect(deletePlan('p1')).resolves.toBeUndefined();
  });
});
