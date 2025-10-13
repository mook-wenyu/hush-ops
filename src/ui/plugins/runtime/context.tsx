import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import {
  createPluginRuntime,
  PluginRuntime,
  type PluginCommandDefinition,
  type PluginPanelDefinition,
  type PluginRuntimeOptions
} from "./pluginRuntime";

const PluginRuntimeContext = createContext<PluginRuntime | null>(null);

export interface PluginRuntimeProviderProps {
  readonly children: ReactNode;
  readonly options?: PluginRuntimeOptions;
  readonly onRuntimeReady?: (runtime: PluginRuntime | null) => void;
}

export function PluginRuntimeProvider({ children, options, onRuntimeReady }: PluginRuntimeProviderProps) {
  const runtimeRef = useRef<PluginRuntime | null>(null);

  if (runtimeRef.current === null) {
    runtimeRef.current = createPluginRuntime(options);
  }

  useEffect(() => {
    const runtime = runtimeRef.current!;
    runtime
      .initialise()
      .then(() => {
        onRuntimeReady?.(runtime);
      })
      .catch((error) => {
        runtime.logger.error("初始化插件运行时失败", { error });
      });
    return () => {
      if (runtimeRef.current) {
        runtimeRef.current.dispose();
        runtimeRef.current = null;
      }
      onRuntimeReady?.(null);
    };
  }, [onRuntimeReady]);

  return <PluginRuntimeContext.Provider value={runtimeRef.current}>{children}</PluginRuntimeContext.Provider>;
}

export function usePluginRuntime(): PluginRuntime {
  const runtime = useContext(PluginRuntimeContext);
  if (!runtime) {
    throw new Error("usePluginRuntime 必须在 PluginRuntimeProvider 内使用");
  }
  return runtime;
}

export function usePluginCommands(): readonly PluginCommandDefinition[] {
  const runtime = usePluginRuntime();
  const subscribe = (listener: () => void) => runtime.subscribeCommands(listener);
  const getSnapshot = () => runtime.listCommands();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function usePluginPanels(): readonly PluginPanelDefinition[] {
  const runtime = usePluginRuntime();
  const subscribe = (listener: () => void) => runtime.subscribePanels(listener);
  const getSnapshot = () => runtime.listPanels();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
