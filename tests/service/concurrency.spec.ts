import { describe, it, expect } from 'vitest';
import { OrchestratorController } from '../../src/service/orchestrator/index.js';

// 最小并发门控验证：当 schedule.concurrency === 'forbid' 时，重复执行应返回同一 executionId

describe('plan-level concurrency gate', () => {
  it('returns existing running execution when policy is forbid', async () => {
    const controller = new OrchestratorController({ defaultUseMockBridge: true });

    const plan = {
      id: 'concurrency-demo',
      version: 'v1',
      entry: 'root',
      schedule: { enabled: false, kind: 'cron', cron: '* * * * *', concurrency: 'forbid' },
      nodes: [
        { id: 'root', type: 'sequence', children: ['wait-approval'] },
        {
          id: 'wait-approval',
          type: 'human_approval',
          approvalId: 'gate-test',
          message: 'test approval to hold execution',
          timeoutSeconds: 60
        }
      ]
    } as const;

    // 发起第一个执行（将进入等待人工审批的状态，保持运行中）
    const rec1 = await controller.execute({ plan });
    expect(rec1.planId).toBe(plan.id);
    expect(rec1.id).toMatch(/^exec-/);

    // 立即发起第二个执行请求，应直接返回第一个执行记录而不新增
    const rec2 = await controller.execute({ plan });
    expect(rec2.id).toBe(rec1.id);

    // 清理：取消运行中的执行
    await controller.stopExecution(rec1.id);
  }, 20_000);
});
