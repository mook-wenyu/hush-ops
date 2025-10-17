import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import {
  createPluginRuntime,
  PluginRuntime,
  type PluginCommandDefinition,
  type PluginPanelDefinition,
  type PluginRuntimeOptions
} from "./pluginRuntime";
import { isPluginsDisabled } from "../../utils/plugins";

const PluginRuntimeContext = createContext<PluginRuntime | null>(null);

const noop = () => {};

const disabledRuntime = {
  target: "web-ui" as const,
  logger: {
    info: noop,
    warn: noop,
    error: noop
  },
  initialise: async () => {},
  dispose: () => {},
  isDisposed: () => false,
  listManifests: () => [],
  listSnapshots: () => [],
  getBridge: () => ({}),
  listCommands: () => [],
  subscribeCommands: (_listener: () => void) => () => {},
  listPanels: () => [],
  subscribePanels: (_listener: () => void) => () => {},
  listTools: async () => [],
  callTool: async () => {
    throw new Error("插件已禁用，无法调用工具");
  },
  listResources: async () => [],
  requestApproval: async () => {
    throw new Error("插件已禁用，无法请求审批");
  },
  listToolStreamSummaries: async () => [],
  fetchToolStreamChunks: async () => [],
  replayToolStream: async () => 0,
  supportsToolReplay: () => false,
  subscribeBridgeOutput: (_listener: (event: unknown) => void) => () => {},
  notifyBridgeOutput: () => {},
  supportsToolInvocation: () => false,
  registerOverlay: () => () => {},
  registerCommand: () => () => {},
  registerPanel: () => () => {}
} as unknown as PluginRuntime;

async function ensureDisabledRuntimeInitialised(): Promise<void> {
  return Promise.resolve();
}

export interface PluginRuntimeProviderProps {
  readonly children: ReactNode;
  readonly options?: PluginRuntimeOptions;
  readonly onRuntimeReady?: (runtime: PluginRuntime | null) => void;
}

export function PluginRuntimeProvider({ children, options, onRuntimeReady }: PluginRuntimeProviderProps) {
  const disableRuntime = isPluginsDisabled();
  const runtimeRef = useRef<PluginRuntime | null>(null);

  useEffect(() => {
    if (disableRuntime) {
      ensureDisabledRuntimeInitialised()
        .then(() => {
          onRuntimeReady?.(disabledRuntime);
        })
        .catch((error) => {
          disabledRuntime.logger?.error?.("禁用模式下初始化插件运行时失败", { error });
        });
      return () => {
        onRuntimeReady?.(null);
      };
    }

    let runtime = runtimeRef.current;
    if (!runtime || runtime.isDisposed()) {
      runtime = createPluginRuntime(options);
      runtimeRef.current = runtime;
    }

    runtime
      .initialise()
      .then(() => {
        onRuntimeReady?.(runtime ?? null);
      })
      .catch((error) => {
        runtime?.logger.error("初始化插件运行时失败", { error });
      });

    return () => {
      if (runtimeRef.current && !runtimeRef.current.isDisposed()) {
        runtimeRef.current.dispose();
      }
      onRuntimeReady?.(null);
    };
  }, [disableRuntime, onRuntimeReady, options]);

  if (disableRuntime) {
    return <PluginRuntimeContext.Provider value={disabledRuntime}>{children}</PluginRuntimeContext.Provider>;
  }

  if (!runtimeRef.current || runtimeRef.current.isDisposed()) {
    runtimeRef.current = createPluginRuntime(options);
  }

  return <PluginRuntimeContext.Provider value={runtimeRef.current}>{children}</PluginRuntimeContext.Provider>;
}

export function usePluginRuntime(): PluginRuntime {
  const runtime = useContext(PluginRuntimeContext);
  if (!runtime) {
    if (isPluginsDisabled()) {
      void ensureDisabledRuntimeInitialised();
      return disabledRuntime;
    }
    throw new Error("usePluginRuntime 必须在 PluginRuntimeProvider 内使用");
  }
  return runtime;
}

export function usePluginCommands(): readonly PluginCommandDefinition[] {
  const runtime = usePluginRuntime();
  const cacheRef = useRef<readonly PluginCommandDefinition[]>(runtime.listCommands());
  const subscribe = (listener: () => void) =>
    runtime.subscribeCommands(() => {
      cacheRef.current = runtime.listCommands();
      listener();
    });
  const getSnapshot = () => cacheRef.current;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function usePluginPanels(): readonly PluginPanelDefinition[] {
  const runtime = usePluginRuntime();
  const cacheRef = useRef<readonly PluginPanelDefinition[]>(runtime.listPanels());
  const subscribe = (listener: () => void) =>
    runtime.subscribePanels(() => {
      cacheRef.current = runtime.listPanels();
      listener();
    });
  const getSnapshot = () => cacheRef.current;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
