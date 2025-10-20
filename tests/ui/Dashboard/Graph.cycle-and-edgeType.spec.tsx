/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { buildPlanGraph, willCreateCycle } from '../../../src/ui/components/graph/PlanCanvas';

describe('Graph cycle prevention & edge type fallback', () => {
  it('detects cycle when adding edge that closes a loop', () => {
    const plan = {
      id: 'p',
      nodes: [
        { id: 'A', children: ['B'] },
        { id: 'B', children: ['C'] },
        { id: 'C' }
      ]
    } as any;
    const g = buildPlanGraph(plan)!;
    expect(willCreateCycle(g, 'C', 'A')).toBe(true);
    expect(willCreateCycle(g, 'A', 'C')).toBe(false);
  });
});
