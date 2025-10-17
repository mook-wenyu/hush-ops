import { describe, it, expect } from 'vitest';
import {
  cn,
  cardClasses,
  cardBodyClasses,
  buttonClasses,
  inputClasses,
  alertClasses,
} from '../../../src/ui/utils/classNames';

describe('cn', () => {
  it('应该组合字符串类名', () => {
    expect(cn('btn', 'btn-primary')).toBe('btn btn-primary');
  });

  it('应该过滤falsy值', () => {
    expect(cn('btn', null, undefined, '', false, 'btn-sm')).toBe('btn btn-sm');
  });

  it('应该处理对象条件', () => {
    expect(cn('btn', { 'btn-primary': true, 'btn-disabled': false })).toBe('btn btn-primary');
  });

  it('应该处理数组', () => {
    expect(cn(['btn', 'btn-sm'], 'btn-primary')).toBe('btn btn-sm btn-primary');
  });

  it('应该处理嵌套数组', () => {
    expect(cn(['btn', ['btn-sm', 'btn-primary']])).toBe('btn btn-sm btn-primary');
  });

  it('应该处理混合参数', () => {
    expect(cn('btn', { 'btn-primary': true }, ['btn-sm'], undefined, 'hover:bg-blue-500')).toBe(
      'btn btn-primary btn-sm hover:bg-blue-500'
    );
  });

  it('应该处理数字值', () => {
    expect(cn('z', 10)).toBe('z 10');
  });

  it('应该返回空字符串当所有参数都是falsy', () => {
    expect(cn(null, undefined, false, '')).toBe('');
  });
});

describe('cardClasses', () => {
  it('应该返回默认卡片样式', () => {
    const result = cardClasses();
    expect(result).toContain('card');
    expect(result).toContain('bg-base-200/70');
    expect(result).toContain('shadow-xl');
  });

  it('应该返回嵌套卡片样式', () => {
    const result = cardClasses({ variant: 'nested' });
    expect(result).toContain('card');
    expect(result).toContain('bg-base-300/70');
    expect(result).toContain('shadow-xl');
  });

  it('应该返回带边框的卡片样式', () => {
    const result = cardClasses({ bordered: true });
    expect(result).toContain('card');
    expect(result).toContain('bg-base-200/70');
    expect(result).toContain('border');
    expect(result).toContain('border-base-content/10');
    expect(result).not.toContain('shadow-xl');
  });

  it('应该处理多个选项组合', () => {
    const result = cardClasses({ variant: 'nested', bordered: true });
    expect(result).toContain('card');
    expect(result).toContain('bg-base-300/70');
    expect(result).toContain('border');
  });
});

describe('cardBodyClasses', () => {
  it('应该返回默认card-body样式', () => {
    const result = cardBodyClasses();
    expect(result).toBe('card-body space-y-4');
  });

  it('应该返回紧凑card-body样式', () => {
    const result = cardBodyClasses({ compact: true });
    expect(result).toBe('card-body space-y-2 p-4 text-sm');
  });
});

describe('buttonClasses', () => {
  it('应该返回默认按钮样式（btn-sm）', () => {
    const result = buttonClasses();
    expect(result).toBe('btn btn-sm');
  });

  it('应该返回primary按钮样式', () => {
    const result = buttonClasses({ variant: 'primary', size: 'sm' });
    expect(result).toContain('btn');
    expect(result).toContain('btn-primary');
    expect(result).toContain('btn-sm');
  });

  it('应该返回outline按钮样式', () => {
    const result = buttonClasses({ variant: 'outline', size: 'sm' });
    expect(result).toContain('btn');
    expect(result).toContain('btn-outline');
    expect(result).toContain('btn-sm');
  });

  it('应该返回success按钮样式（btn-xs）', () => {
    const result = buttonClasses({ variant: 'success', size: 'xs' });
    expect(result).toContain('btn');
    expect(result).toContain('btn-success');
    expect(result).toContain('btn-xs');
  });

  it('应该返回error按钮样式', () => {
    const result = buttonClasses({ variant: 'error', size: 'xs' });
    expect(result).toContain('btn');
    expect(result).toContain('btn-error');
    expect(result).toContain('btn-xs');
  });

  it('应该处理disabled状态', () => {
    const result = buttonClasses({ variant: 'primary', size: 'sm', disabled: true });
    expect(result).toContain('btn');
    expect(result).toContain('btn-primary');
    expect(result).toContain('btn-disabled');
  });

  it('应该处理loading状态', () => {
    const result = buttonClasses({ variant: 'primary', size: 'sm', loading: true });
    expect(result).toContain('btn');
    expect(result).toContain('btn-primary');
    expect(result).toContain('btn-disabled');
  });

  it('应该支持所有尺寸', () => {
    expect(buttonClasses({ size: 'xs' })).toContain('btn-xs');
    expect(buttonClasses({ size: 'sm' })).toContain('btn-sm');
    expect(buttonClasses({ size: 'md' })).toContain('btn-md');
    expect(buttonClasses({ size: 'lg' })).toContain('btn-lg');
  });

  it('应该支持所有变体', () => {
    expect(buttonClasses({ variant: 'primary' })).toContain('btn-primary');
    expect(buttonClasses({ variant: 'secondary' })).toContain('btn-secondary');
    expect(buttonClasses({ variant: 'success' })).toContain('btn-success');
    expect(buttonClasses({ variant: 'error' })).toContain('btn-error');
    expect(buttonClasses({ variant: 'warning' })).toContain('btn-warning');
    expect(buttonClasses({ variant: 'outline' })).toContain('btn-outline');
  });
});

describe('inputClasses', () => {
  it('应该返回默认input样式', () => {
    const result = inputClasses();
    expect(result).toContain('input');
    expect(result).toContain('input-bordered');
    expect(result).toContain('input-sm');
    expect(result).toContain('w-full');
  });

  it('应该返回textarea样式', () => {
    const result = inputClasses({ type: 'textarea' });
    expect(result).toContain('textarea');
    expect(result).toContain('textarea-bordered');
    expect(result).toContain('w-full');
    expect(result).toContain('font-mono');
    expect(result).toContain('text-sm');
  });

  it('应该返回select样式', () => {
    const result = inputClasses({ type: 'select', size: 'sm' });
    expect(result).toContain('select');
    expect(result).toContain('select-bordered');
    expect(result).toContain('select-sm');
  });

  it('应该处理不带边框的情况', () => {
    const result = inputClasses({ bordered: false });
    expect(result).toContain('input');
    expect(result).not.toContain('input-bordered');
  });

  it('应该处理非全宽情况', () => {
    const result = inputClasses({ fullWidth: false });
    expect(result).toContain('input');
    expect(result).not.toContain('w-full');
  });

  it('应该支持所有尺寸', () => {
    expect(inputClasses({ size: 'xs' })).toContain('input-xs');
    expect(inputClasses({ size: 'sm' })).toContain('input-sm');
    expect(inputClasses({ size: 'md' })).toContain('input-md');
    expect(inputClasses({ size: 'lg' })).toContain('input-lg');
  });

  it('应该支持select的各种尺寸', () => {
    expect(inputClasses({ type: 'select', size: 'xs' })).toContain('select-xs');
    expect(inputClasses({ type: 'select', size: 'lg' })).toContain('select-lg');
  });
});

describe('alertClasses', () => {
  it('应该返回默认alert样式（info）', () => {
    const result = alertClasses();
    expect(result).toContain('alert');
    expect(result).toContain('alert-info');
    expect(result).toContain('text-sm');
  });

  it('应该返回success alert样式', () => {
    const result = alertClasses({ variant: 'success' });
    expect(result).toContain('alert');
    expect(result).toContain('alert-success');
    expect(result).toContain('text-sm');
  });

  it('应该返回error alert样式', () => {
    const result = alertClasses({ variant: 'error' });
    expect(result).toContain('alert');
    expect(result).toContain('alert-error');
    expect(result).toContain('text-sm');
  });

  it('应该返回warning alert样式', () => {
    const result = alertClasses({ variant: 'warning' });
    expect(result).toContain('alert');
    expect(result).toContain('alert-warning');
  });

  it('应该处理不同尺寸', () => {
    expect(alertClasses({ size: 'xs' })).toContain('text-xs');
    expect(alertClasses({ size: 'sm' })).toContain('text-sm');
    expect(alertClasses({ size: 'md' })).toContain('text-base');
  });

  it('应该支持所有变体', () => {
    expect(alertClasses({ variant: 'success' })).toContain('alert-success');
    expect(alertClasses({ variant: 'error' })).toContain('alert-error');
    expect(alertClasses({ variant: 'warning' })).toContain('alert-warning');
    expect(alertClasses({ variant: 'info' })).toContain('alert-info');
  });
});
