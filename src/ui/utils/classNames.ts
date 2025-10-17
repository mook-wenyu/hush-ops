/**
 * className工具函数
 * 提供条件类名组合和常用组件样式函数
 */

type ClassValue = string | number | boolean | undefined | null;
type ClassObject = Record<string, boolean | undefined | null>;
type ClassArray = (ClassValue | ClassObject | ClassArray)[];

/**
 * 条件类名组合函数
 * 支持字符串、对象、数组等多种形式
 *
 * @example
 * cn('btn', { 'btn-primary': isPrimary, 'btn-disabled': isDisabled })
 * cn(['btn', 'btn-sm'], { 'loading': isLoading })
 */
export function cn(...args: (ClassValue | ClassObject | ClassArray)[]): string {
  const classes: string[] = [];

  for (const arg of args) {
    if (!arg) continue;

    if (typeof arg === 'string' || typeof arg === 'number') {
      classes.push(String(arg));
    } else if (Array.isArray(arg)) {
      const inner = cn(...arg);
      if (inner) classes.push(inner);
    } else if (typeof arg === 'object') {
      for (const key in arg) {
        if (arg[key]) {
          classes.push(key);
        }
      }
    }
  }

  return classes.join(' ');
}

/**
 * 卡片样式选项
 */
export interface CardClassesOptions {
  /** 卡片变体：默认使用base-200，嵌套卡片使用base-300 */
  variant?: 'default' | 'nested';
  /** 是否带边框 */
  bordered?: boolean;
  /** 是否紧凑模式（减小padding和间距） */
  compact?: boolean;
}

/**
 * 卡片样式组合函数
 * 基于DaisyUI的card组件，遵循DESIGN_GUIDE规范
 *
 * @example
 * cardClasses() // 'card bg-base-200/70 shadow-xl'
 * cardClasses({ variant: 'nested' }) // 'card bg-base-300/70 shadow-xl'
 * cardClasses({ bordered: true }) // 'card bg-base-200/70 border border-base-content/10'
 */
export function cardClasses(options: CardClassesOptions = {}): string {
  const { variant = 'default', bordered = false } = options;
  // compact参数暂未实现，保留在接口定义中供未来使用

  const baseClasses = 'card';
  const bgClass = variant === 'nested' ? 'bg-base-300/70' : 'bg-base-200/70';
  const shadowOrBorder = bordered ? 'border border-base-content/10' : 'shadow-xl';

  return cn(baseClasses, bgClass, shadowOrBorder);
}

/**
 * 卡片body样式组合函数
 *
 * @example
 * cardBodyClasses() // 'card-body space-y-4'
 * cardBodyClasses({ compact: true }) // 'card-body space-y-2 p-4 text-sm'
 */
export function cardBodyClasses(options: CardClassesOptions = {}): string {
  const { compact = false } = options;

  if (compact) {
    return 'card-body space-y-2 p-4 text-sm';
  }

  return 'card-body space-y-4';
}

/**
 * 按钮样式选项
 */
export interface ButtonClassesOptions {
  /** 按钮变体 */
  variant?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'outline';
  /** 按钮尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否loading状态 */
  loading?: boolean;
}

/**
 * 按钮样式组合函数
 * 基于DaisyUI的btn组件，遵循DESIGN_GUIDE规范
 *
 * @example
 * buttonClasses({ variant: 'primary', size: 'sm' }) // 'btn btn-primary btn-sm'
 * buttonClasses({ variant: 'outline', size: 'sm' }) // 'btn btn-outline btn-sm'
 * buttonClasses({ variant: 'success', size: 'xs' }) // 'btn btn-success btn-xs'
 */
export function buttonClasses(options: ButtonClassesOptions = {}): string {
  const { variant, size = 'sm', disabled = false, loading = false } = options;

  const baseClasses = 'btn';
  const variantClass = variant ? `btn-${variant}` : undefined;
  const sizeClass = `btn-${size}`;
  const disabledClass = disabled || loading ? 'btn-disabled' : undefined;

  return cn(baseClasses, variantClass, sizeClass, disabledClass);
}

/**
 * 输入框样式选项
 */
export interface InputClassesOptions {
  /** 输入框类型 */
  type?: 'text' | 'textarea' | 'select';
  /** 是否带边框 */
  bordered?: boolean;
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 是否全宽 */
  fullWidth?: boolean;
}

/**
 * 输入框样式组合函数
 * 基于DaisyUI的input/textarea/select组件
 *
 * @example
 * inputClasses() // 'input input-bordered input-sm w-full'
 * inputClasses({ type: 'textarea' }) // 'textarea textarea-bordered w-full font-mono text-sm'
 * inputClasses({ type: 'select', size: 'sm' }) // 'select select-bordered select-sm'
 */
export function inputClasses(options: InputClassesOptions = {}): string {
  const { type = 'text', bordered = true, size = 'sm', fullWidth = true } = options;

  let baseClass: string;

  if (type === 'textarea') {
    baseClass = 'textarea';
    const borderedClass = bordered ? 'textarea-bordered' : undefined;
    const widthClass = fullWidth ? 'w-full' : undefined;
    return cn(baseClass, borderedClass, widthClass, 'font-mono text-sm');
  }

  if (type === 'select') {
    baseClass = 'select';
    const borderedClass = bordered ? 'select-bordered' : undefined;
    const sizeClass = `select-${size}`;
    return cn(baseClass, borderedClass, sizeClass);
  }

  // type === 'text' (default)
  baseClass = 'input';
  const borderedClass = bordered ? 'input-bordered' : undefined;
  const sizeClass = `input-${size}`;
  const widthClass = fullWidth ? 'w-full' : undefined;

  return cn(baseClass, borderedClass, sizeClass, widthClass);
}

/**
 * Alert样式选项
 */
export interface AlertClassesOptions {
  /** Alert类型 */
  variant?: 'success' | 'error' | 'warning' | 'info';
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Alert样式组合函数
 *
 * @example
 * alertClasses({ variant: 'success' }) // 'alert alert-success text-sm'
 * alertClasses({ variant: 'error', size: 'xs' }) // 'alert alert-error text-xs'
 */
export function alertClasses(options: AlertClassesOptions = {}): string {
  const { variant = 'info', size = 'sm' } = options;

  const baseClass = 'alert';
  const variantClass = `alert-${variant}`;
  const sizeClass = size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base';

  return cn(baseClass, variantClass, sizeClass);
}
