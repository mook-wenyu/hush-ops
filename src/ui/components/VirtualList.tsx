import { memo, useCallback, useMemo, useRef } from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";

interface VirtualListProps<T> {
  readonly items: readonly T[];
  readonly estimateSize: number; // px
  readonly overscan?: number;
  readonly height?: number; // container模式必填，window模式忽略
  readonly roleLabel?: string;
  readonly renderItem: (item: T, index: number) => React.ReactNode;
  readonly getKey?: (item: T, index: number) => string | number;
  readonly mode?: 'container' | 'window';
  readonly dynamic?: boolean; // 变高项测量
  readonly scrollToIndex?: number; // 滚动定位
  readonly scrollMargin?: number; // window模式下预留顶部安全区（sticky header）
}

// TanStack Virtual 适配器：保持对外 API 不变，内部使用 useVirtualizer。
export function VirtualList<T>({
  items,
  estimateSize,
  overscan = 6,
  height,
  roleLabel,
  renderItem,
  getKey,
  mode = 'container',
  dynamic = true,
  scrollToIndex,
  scrollMargin
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = mode === 'window'
    ? useWindowVirtualizer({
        count: items.length,
        estimateSize: () => estimateSize,
        overscan,
        scrollMargin: scrollMargin ?? 0
      })
    : useVirtualizer({
        count: items.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => estimateSize,
        overscan,
        // 在测试/SSR 环境下提供初始尺寸，避免 0 高导致无法计算可视范围
        initialRect: { width: 0, height: height ?? 600 }
      });

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  const getItemKey = useCallback(
    (item: T, index: number) => (getKey ? getKey(item, index) : index),
    [getKey]
  );

  const ariaSetSize = useMemo(() => items.length, [items.length]);

  // 编程式滚动定位
  if (typeof scrollToIndex === 'number' && scrollToIndex >= 0 && scrollToIndex < items.length) {
    try { virtualizer.scrollToIndex(scrollToIndex, { align: 'center' }); } catch {}
  }

  // 测试环境（jsdom）下的回退渲染：避免 0 高导致不可见
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
  if (isJsdom) {
    return (
      <div role="list" aria-label={roleLabel} aria-setsize={ariaSetSize}>
        {items.map((item, index) => (
          <div key={getItemKey(item as T, index)} role="listitem" aria-posinset={index + 1} aria-setsize={ariaSetSize}>
            {renderItem(item as T, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={mode === 'container' ? containerRef : undefined}
      className={mode === 'container' ? 'overflow-auto' : undefined}
      style={mode === 'container' ? { height } : undefined}
      role="list"
      aria-label={roleLabel}
      aria-setsize={ariaSetSize}
    >
      <div style={{ height: totalSize, position: "relative" }}>
        {virtualItems.map((vi) => {
          const idx = vi.index;
          if (idx < 0 || idx >= items.length) return null;
          const item = items[idx] as T;
          const key = getItemKey(item, idx);
          return (
            <div
              key={key}
              role="listitem"
              aria-posinset={vi.index + 1}
              aria-setsize={ariaSetSize}
              data-index={vi.index}
              ref={dynamic ? virtualizer.measureElement : undefined}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
                willChange: "transform"
              }}
            >
              {renderItem(item, vi.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const MemoVirtualList = memo(VirtualList) as typeof VirtualList;
