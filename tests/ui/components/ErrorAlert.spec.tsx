/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorAlert } from '../../../src/ui/components/ErrorAlert';

expect.extend(matchers);
afterEach(() => {
  cleanup();
});

describe('ErrorAlert', () => {
  it('应该渲染错误消息', () => {
    render(<ErrorAlert message="加载失败，请重试" />);
    expect(screen.getByText('加载失败，请重试')).toBeInTheDocument();
  });

  it('应该显示Error对象的message', () => {
    const error = new Error('Network error');
    render(<ErrorAlert message="执行失败" error={error} />);
    expect(screen.getByText('执行失败')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('应该应用正确的alert样式类', () => {
    const { container } = render(<ErrorAlert message="错误" />);
    const alert = container.querySelector('.alert.alert-error');
    expect(alert).toBeInTheDocument();
  });

  it('应该支持不同尺寸', () => {
    const { container } = render(<ErrorAlert message="错误" size="xs" />);
    const alert = container.querySelector('.text-xs');
    expect(alert).toBeInTheDocument();
  });

  it('应该在开发模式下显示错误堆栈', () => {
    // 模拟开发环境
    const originalEnv = (import.meta as any).env;
    (import.meta as any).env = { ...originalEnv, DEV: true };

    const error = new Error('Test error');
    const { container } = render(<ErrorAlert message="错误" error={error} showStack />);

    const stackElement = container.querySelector('pre');
    expect(stackElement).toBeInTheDocument();
    expect(stackElement?.textContent).toContain('Test error');

    // 恢复环境
    (import.meta as any).env = originalEnv;
  });

  it('应该处理没有error对象的情况', () => {
    render(<ErrorAlert message="简单错误" />);
    expect(screen.getByText('简单错误')).toBeInTheDocument();
    expect(screen.queryByText(/未知错误/)).not.toBeInTheDocument();
  });

  it('应该处理error没有message的情况', () => {
    const error = new Error();
    render(<ErrorAlert message="执行失败" error={error} />);
    expect(screen.getByText('执行失败')).toBeInTheDocument();
    expect(screen.getByText('未知错误')).toBeInTheDocument();
  });

  it('应该不显示堆栈当showStack为false', () => {
    const error = new Error('Test error');
    const { container } = render(<ErrorAlert message="错误" error={error} showStack={false} />);
    const stackElement = container.querySelector('pre');
    expect(stackElement).not.toBeInTheDocument();
  });
});
