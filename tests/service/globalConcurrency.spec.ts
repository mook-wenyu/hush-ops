import { describe, it, expect } from 'vitest';
import { OrchestratorController } from '../../src/service/orchestrator/index.js';

// 最小验证：全局并发上限为 1 时，第二个执行保持 pending（直到上一个释放）

describe('global max concurrency (1)', () => {
  it('second execution is queued (pending)', async () => {
    process.env.ORCHESTRATOR_MAX_CONCURRENCY = '1';
    const ctl = new OrchestratorController({ defaultUseMockBridge: true });
    const plan = {
      id: 'gc-demo',
      version: 'v1',
      entry: 'root',
      nodes: [
        { id: 'root', type: 'sequence', children: ['n1'] },
        { id: 'n1', type: 'local_task', driver: 'shell', command: 'echo ok' }
      ]
    } as const;
    const r1 = await ctl.execute({ plan });
    const r2 = await ctl.execute({ plan });
    expect(['pending','running']).toContain(r1.status);
    // r2 若在队列中则保持 pending
    expect(r2.status).toBe('pending');
  });
});
