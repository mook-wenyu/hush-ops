/* @vitest-environment jsdom */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { PlanCanvas, type PlanJson } from '../../../src/ui/components/graph/PlanCanvas';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  // React Flow 依赖 ResizeObserver，jsdom 默认未实现。
  (globalThis as any).ResizeObserver = ResizeObserverStub;
});

afterAll(() => {
  delete (globalThis as any).ResizeObserver;
});

afterEach(() => cleanup());

function makePlan(n: number): PlanJson {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
  for (let i = 0; i < n - 1; i++) {
    (nodes[i] as any).children = [`n${i + 1}`];
  }
  return { id: `p${n}`, nodes };
}

describe('PlanCanvas — 大图阈值与仅渲染可见元素', () => {
  it('节点 < 200 时默认关闭 onlyRenderVisibleElements', () => {
    render(
      <PlanCanvas plan={makePlan(100)} bridgeState={'connected' as any} pendingNodeIds={new Set()} />
    );
    const region = screen.getByRole('region', { name: '计划画布区域' });
    expect(region.getAttribute('data-visible-only')).toBe('0');
  });

  it('节点 >= 200 时默认开启 onlyRenderVisibleElements', () => {
    render(
      <PlanCanvas plan={makePlan(500)} bridgeState={'connected' as any} pendingNodeIds={new Set()} />
    );
    const region = screen.getByRole('region', { name: '计划画布区域' });
    expect(region.getAttribute('data-visible-only')).toBe('1');
  });
});
