// 轻量性能辅助：提供可安全扩展的 ReactFlow 属性与 RAF 节流

export const perfFlowProps = {
  nodesDraggable: true,
  nodesConnectable: true,
  elementsSelectable: true,
  panOnScroll: true,
  zoomOnScroll: true,
  minZoom: 0.2,
  maxZoom: 2
} as const;

export function rafThrottle<T extends (...args: any[]) => void>(fn: T): T {
  let pending = false;
  let lastArgs: any[] | null = null;
  const wrapped = ((...args: any[]) => {
    lastArgs = args;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      fn(...(lastArgs ?? []));
      lastArgs = null;
    });
  }) as T;
  return wrapped;
}
