import { describe, it, expect } from 'vitest';
import { applyElkLayout } from '../../../src/ui/features/graph/Layout';

describe('ELK layout basic', () => {
  it('positions nodes without throwing', async () => {
    const graph = {
      nodes: Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, position: { x: 0, y: 0 } })),
      edges: Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i+1}` }))
    };
    const laid = await applyElkLayout(graph as any);
    expect(laid.nodes.every((n: any) => typeof n.position?.x === 'number')).toBe(true);
  });
});
