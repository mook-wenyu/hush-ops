import '@testing-library/jest-dom/vitest';

// jsdom polyfills for React Flow & layout
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
global.ResizeObserver = ResizeObserver;
