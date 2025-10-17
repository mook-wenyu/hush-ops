export function isPluginsDisabled(): boolean {
  const globalFlag = typeof globalThis !== "undefined" ? (globalThis as { __HUSH_OPS_DISABLE_PLUGINS?: unknown }).__HUSH_OPS_DISABLE_PLUGINS : undefined;
  if (globalFlag === true) return true;
  if (globalFlag === false) return false; // 单测可显式开启插件

  if (typeof import.meta !== "undefined" && (import.meta as any)?.vitest) {
    return true;
  }
  if (typeof process !== "undefined" && (process.env as any)?.VITEST) {
    return true;
  }
  if (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, unknown> }).env) {
    const flag = (import.meta as { env: { VITE_DISABLE_PLUGINS?: string } }).env.VITE_DISABLE_PLUGINS;
    if (flag === "1" || flag?.toLowerCase() === "true") {
      return true;
    }
  }

  return false;
}
