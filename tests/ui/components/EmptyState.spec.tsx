/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from '../../../src/ui/components/EmptyState';

expect.extend(matchers);
afterEach(() => {
  cleanup();
});

describe('EmptyState', () => {
  it('应该渲染标题', () => {
    render(<EmptyState title="暂无数据" />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('应该渲染描述文本', () => {
    render(<EmptyState title="暂无数据" description="当前没有可显示的内容" />);
    expect(screen.getByText('当前没有可显示的内容')).toBeInTheDocument();
  });

  it('应该渲染图标', () => {
    const icon = <svg data-testid="test-icon" />;
    render(<EmptyState title="暂无数据" icon={icon} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('应该渲染操作按钮', () => {
    const action = <button>刷新</button>;
    render(<EmptyState title="暂无数据" action={action} />);
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
  });

  it('应该同时渲染所有元素', () => {
    const icon = <svg data-testid="test-icon" />;
    const action = <button>刷新</button>;
    render(
      <EmptyState
        title="暂无执行记录"
        description="当前没有可显示的执行记录"
        icon={icon}
        action={action}
      />
    );
    expect(screen.getByText('暂无执行记录')).toBeInTheDocument();
    expect(screen.getByText('当前没有可显示的执行记录')).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
  });

  it('应该不显示图标当未提供', () => {
    const { container } = render(<EmptyState title="暂无数据" />);
    const iconWrapper = container.querySelector('.mb-4.text-base-content\\/40');
    expect(iconWrapper).not.toBeInTheDocument();
  });

  it('应该不显示描述当未提供', () => {
    render(<EmptyState title="暂无数据" />);
    const description = screen.queryByText(/当前/);
    expect(description).not.toBeInTheDocument();
  });
});
