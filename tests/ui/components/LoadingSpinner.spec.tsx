/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, describe, expect, it } from 'vitest';

import { LoadingSpinner } from '../../../src/ui/components/LoadingSpinner';

expect.extend(matchers);
afterEach(() => {
  cleanup();
});

describe('LoadingSpinner', () => {
  it('应该渲染默认加载指示器', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('应该显示加载文本', () => {
    render(<LoadingSpinner text="加载中…" />);
    expect(screen.getByText('加载中…')).toBeInTheDocument();
  });

  it('应该支持不同尺寸', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const spinner = container.querySelector('.loading-lg');
    expect(spinner).toBeInTheDocument();
  });

  it('应该支持居中显示', () => {
    const { container } = render(<LoadingSpinner center />);
    const wrapper = container.querySelector('.flex.items-center.justify-center');
    expect(wrapper).toBeInTheDocument();
  });

  it('应该有正确的ARIA属性', () => {
    render(<LoadingSpinner text="处理中" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('应该不显示文本当未提供text prop', () => {
    const { container } = render(<LoadingSpinner />);
    const text = container.querySelector('.text-base-content\\/70');
    expect(text).not.toBeInTheDocument();
  });
});
