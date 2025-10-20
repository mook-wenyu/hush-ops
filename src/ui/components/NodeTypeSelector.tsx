import React, { memo, useEffect, useRef, useState } from 'react';
import { NODE_TYPE_OPTIONS } from '../constants/nodeTypes';

export interface NodeTypeSelectorProps {
  readonly position: { x: number; y: number };
  readonly onSelect: (type: string) => void;
  readonly onCancel: () => void;
}

/**
 * NodeTypeSelector 组件
 *
 * 浮动菜单式节点类型选择器，在用户从 Handle 拖拽到空白处时显示
 *
 * 特性：
 * - 支持键盘导航（↑↓Enter Esc）
 * - 完整 ARIA 无障碍属性
 * - DaisyUI menu 样式
 * - 固定定位在拖拽结束位置
 *
 * @example
 * ```tsx
 * <NodeTypeSelector
 *   position={{ x: 200, y: 100 }}
 *   onSelect={(type) => console.log('Selected:', type)}
 *   onCancel={() => console.log('Cancelled')}
 * />
 * ```
 */
export const NodeTypeSelector = memo(function NodeTypeSelector({
  position,
  onSelect,
  onCancel
}: NodeTypeSelectorProps) {
  // 选中项索引（默认第一项）
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 菜单 DOM 引用（用于自动聚焦）
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 自动聚焦
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // 键盘导航处理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onCancel();
        break;

      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % NODE_TYPE_OPTIONS.length);
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + NODE_TYPE_OPTIONS.length) % NODE_TYPE_OPTIONS.length);
        break;

      case 'Enter': {
        e.preventDefault();
        const selectedOption = NODE_TYPE_OPTIONS[selectedIndex];
        if (selectedOption) {
          onSelect(selectedOption.value);
        }
        break;
      }

      default:
        break;
    }
  };

  // 鼠标点击选择
  const handleClick = (index: number) => {
    const option = NODE_TYPE_OPTIONS[index];
    if (option) {
      onSelect(option.value);
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="选择节点类型"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="menu menu-compact bg-base-100 shadow-xl rounded-box p-2 min-w-[200px] z-[9999]"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y
      }}
    >
      {NODE_TYPE_OPTIONS.map((option, index) => (
        <li key={option.value}>
          <button
            type="button"
            role="menuitem"
            className={selectedIndex === index ? 'active' : undefined}
            onClick={() => handleClick(index)}
            aria-label={`选择 ${option.label}`}
          >
            <span className="text-lg" aria-hidden="true">{option.icon}</span>
            <span>{option.label}</span>
          </button>
        </li>
      ))}
    </div>
  );
});

export default NodeTypeSelector;
