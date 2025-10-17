import { describe, it, expect } from 'vitest';
import { applyElkLayout } from '../../../src/ui/features/graph/Layout';

function makeGraph(n: number) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, position: { x: 0, y: 0 } }));
  const edges = Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i+1}` }));
  return { nodes, edges } as any;
}

describe('Designer synthetic performance', () => {
  const maybe = (process.env.PERF_SKIP === '1') ? it.skip : it;
  const N = Number(process.env.PERF_N ?? '1000');
  const BUDGET = Number(process.env.PERF_BUDGET_MS ?? '5000');
  const TIMEOUT = BUDGET + 3000;

  maybe(`ELK layout ${N} nodes completes under ${BUDGET}ms`, async () => {
    const graph = makeGraph(N);
    const t0 = performance.now();
    const laid = await applyElkLayout(graph);
    const t1 = performance.now();
    expect(laid.nodes.length).toBe(N);
    expect(t1 - t0).toBeLessThan(BUDGET);
  }, TIMEOUT);
});
