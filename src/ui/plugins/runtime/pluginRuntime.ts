import type { ReactNode } from "react";

import { registerPlanOverlay, type PlanNodeOverlayDefinition } from "../planOverlays";

import type { PendingApprovalEntry, ToolStreamSummary } from "../../types/orchestrator";
import type { PluginCapability, PluginManifest } from "./manifest";
import { parsePluginManifest } from "./manifest";

export interface PluginToolStreamEvent {
  readonly toolName: string;
  readonly message: string;
  readonly timestamp: string;
  readonly executionId?: string;
  readonly status?: "start" | "success" | "error";
  readonly correlationId?: string;
  readonly nodeId?: string;
  readonly planId?: string;
  readonly result?: unknown;
  readonly error?: string;
  readonly sequence?: number;
  readonly replayed?: boolean;
  readonly storedAt?: string;
  readonly source?: string;
}

import executionTrailManifest from "../builtins/execution-trail/plugin.json";
import mcpToolExplorerManifest from "../builtins/mcp-tool-explorer/plugin.json";

interface PluginLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const defaultLogger: PluginLogger = {
  info: (message, context) => console.info(message, context ?? {}),
  warn: (message, context) => console.warn(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {})
};

export interface PluginModule {
  register(runtime: PluginRuntime, manifest: PluginManifest): Promise<void> | void;
}

interface PluginDescriptor {
  readonly manifest: PluginManifest;
  readonly loader: () => Promise<PluginModule>;
}

export interface PluginCommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void | Promise<void>;
  readonly tooltip?: string;
  readonly priority?: number;
}

export interface PluginPanelDefinition {
  readonly id: string;
  readonly title: string;
  readonly render: () => ReactNode;
  readonly description?: string;
  readonly priority?: number;
}

export interface PluginToolDescriptor {
  name: string;
  description?: string;
  riskLevel?: "low" | "medium" | "high";
}

export interface PluginApprovalRequest {
  readonly executionId?: string;
  readonly planId?: string;
  readonly planVersion?: string;
  readonly nodeId?: string;
  readonly nodeType?: string;
  readonly riskLevel?: "low" | "medium" | "high";
  readonly requiresApproval?: boolean;
  readonly requestedBy?: string;
  readonly metadata?: Record<string, unknown>;
  readonly title?: string;
}

export interface PluginRuntimeBridge {
  readonly listTools?: () => Promise<readonly PluginToolDescriptor[]>;
  readonly callTool?: (toolName: string, input: unknown) => Promise<unknown>;
  readonly listResources?: () => Promise<readonly string[]>;
  readonly requestApproval?: (input: PluginApprovalRequest) => Promise<PendingApprovalEntry>;
  readonly listToolStreamSummaries?: (executionId: string) => Promise<readonly ToolStreamSummary[]>;
  readonly fetchToolStreamChunks?: (
    executionId: string,
    correlationId: string
  ) => Promise<readonly PluginToolStreamEvent[]>;
  readonly replayToolStream?: (
    executionId: string,
    correlationId: string
  ) => Promise<number | { replayed: number }>;
}

export interface PluginRuntimeOptions {
  readonly target?: "web-ui" | "mcp-ui" | "headless";
  readonly logger?: PluginLogger;
  readonly availableEvents?: readonly string[];
  readonly availableMcpTools?: readonly string[];
  readonly descriptors?: readonly PluginDescriptor[];
  readonly bridge?: PluginRuntimeBridge;
}

interface CapabilitySnapshot {
  readonly manifest: PluginManifest;
  readonly grantedCapabilities: readonly PluginCapability[];
  readonly missingEvents: readonly string[];
  readonly missingTools: readonly string[];
}

const builtinDescriptors: PluginDescriptor[] = [
  {
    manifest: parsePluginManifest(executionTrailManifest),
    loader: () => import("../builtins/execution-trail/pluginModule")
  },
  {
    manifest: parsePluginManifest(mcpToolExplorerManifest),
    loader: () => import("../builtins/mcp-tool-explorer/pluginModule")
  }
];

export class PluginRuntime {
  readonly target: "web-ui" | "mcp-ui" | "headless";
  readonly logger: PluginLogger;

  private readonly availableEvents: readonly string[];
  private readonly availableMcpTools: readonly string[];
  private readonly descriptors: readonly PluginDescriptor[];
  private readonly bridge: PluginRuntimeBridge;

  private readonly overlayDisposers = new Map<string, () => void>();
  private readonly commandMap = new Map<string, PluginCommandDefinition>();
  private readonly panelMap = new Map<string, PluginPanelDefinition>();

  private readonly snapshots = new Map<string, CapabilitySnapshot>();

  private readonly commandListeners = new Set<() => void>();
  private readonly panelListeners = new Set<() => void>();
  private readonly bridgeOutputListeners = new Set<(event: PluginToolStreamEvent) => void>();

  private commandSnapshot: readonly PluginCommandDefinition[] = [];
  private panelSnapshot: readonly PluginPanelDefinition[] = [];

  private disposed = false;
  private initialised = false;
  private initialisePromise: Promise<void> | null = null;

  constructor(options: PluginRuntimeOptions = {}) {
    this.target = options.target ?? "web-ui";
    this.logger = options.logger ?? defaultLogger;
    this.availableEvents = options.availableEvents ?? [];
    this.availableMcpTools = options.availableMcpTools ?? [];
    this.descriptors = options.descriptors ?? builtinDescriptors;
    this.bridge = options.bridge ?? {};
  }

  async initialise(): Promise<void> {
    if (this.disposed) {
      this.logger.warn("插件运行时已释放，忽略 initialise 调用");
      return;
    }
    if (this.initialised) {
      return;
    }
    if (this.initialisePromise) {
      return this.initialisePromise;
    }
    this.initialisePromise = this.loadAllDescriptors();
    await this.initialisePromise;
    this.initialised = true;
  }

  listManifests(): PluginManifest[] {
    return Array.from(this.snapshots.values()).map((snapshot) => snapshot.manifest);
  }

  listSnapshots(): CapabilitySnapshot[] {
    return Array.from(this.snapshots.values());
  }

  getBridge(): PluginRuntimeBridge {
    return this.bridge;
  }

  listCommands(): readonly PluginCommandDefinition[] {
    return this.commandSnapshot;
  }

  listPanels(): readonly PluginPanelDefinition[] {
    return this.panelSnapshot;
  }

  async listTools(): Promise<readonly PluginToolDescriptor[]> {
    if (typeof this.bridge.listTools === "function") {
      return this.bridge.listTools();
    }
    return this.availableMcpTools.map((name) => ({ name }));
  }

  async callTool(toolName: string, input: unknown): Promise<unknown> {
    if (typeof this.bridge.callTool !== "function") {
      throw new Error("当前运行时未提供 MCP callTool 能力");
    }
    return this.bridge.callTool(toolName, input);
  }

  async listResources(): Promise<readonly string[]> {
    if (typeof this.bridge.listResources === "function") {
      return this.bridge.listResources();
    }
    return [];
  }

  async requestApproval(input: PluginApprovalRequest): Promise<PendingApprovalEntry> {
    if (typeof this.bridge.requestApproval !== "function") {
      throw new Error("当前运行时未提供审批请求能力");
    }
    return this.bridge.requestApproval(input);
  }

  async listToolStreamSummaries(executionId: string): Promise<readonly ToolStreamSummary[]> {
    if (typeof this.bridge.listToolStreamSummaries === "function") {
      return this.bridge.listToolStreamSummaries(executionId);
    }
    return [];
  }

  async fetchToolStreamChunks(
    executionId: string,
    correlationId: string
  ): Promise<readonly PluginToolStreamEvent[]> {
    if (typeof this.bridge.fetchToolStreamChunks === "function") {
      return this.bridge.fetchToolStreamChunks(executionId, correlationId);
    }
    return [];
  }

  async replayToolStream(executionId: string, correlationId: string): Promise<number> {
    if (typeof this.bridge.replayToolStream !== "function") {
      throw new Error("当前运行时未提供流式输出重放能力");
    }
    const result = await this.bridge.replayToolStream(executionId, correlationId);
    if (typeof result === "number") {
      return result;
    }
    if (result && typeof result === "object" && typeof (result as { replayed?: unknown }).replayed === "number") {
      return (result as { replayed: number }).replayed;
    }
    return 0;
  }

  supportsToolReplay(): boolean {
    return typeof this.bridge.replayToolStream === "function";
  }

  subscribeBridgeOutput(listener: (event: PluginToolStreamEvent) => void): () => void {
    this.bridgeOutputListeners.add(listener);
    return () => {
      this.bridgeOutputListeners.delete(listener);
    };
  }

  notifyBridgeOutput(event: PluginToolStreamEvent): void {
    if (this.disposed) {
      return;
    }
    for (const listener of this.bridgeOutputListeners) {
      listener(event);
    }
  }

  supportsToolInvocation(): boolean {
    return typeof this.bridge.callTool === "function";
  }

  subscribeCommands(listener: () => void): () => void {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  }

  subscribePanels(listener: () => void): () => void {
    this.panelListeners.add(listener);
    return () => {
      this.panelListeners.delete(listener);
    };
  }

  registerOverlay(definition: PlanNodeOverlayDefinition): () => void {
    if (this.disposed) {
      this.logger.warn("运行时已释放，无法注册 overlay", { id: definition.id });
      return () => {};
    }
    const disposer = registerPlanOverlay(definition);
    const previous = this.overlayDisposers.get(definition.id);
    if (previous) {
      previous();
    }
    this.overlayDisposers.set(definition.id, disposer);
    return () => {
      const current = this.overlayDisposers.get(definition.id);
      if (current === disposer) {
        disposer();
        this.overlayDisposers.delete(definition.id);
      } else {
        disposer();
      }
    };
  }

  registerCommand(definition: PluginCommandDefinition): () => void {
    if (this.disposed) {
      this.logger.warn("运行时已释放，无法注册 command", { id: definition.id });
      return () => {};
    }
    const normalised = { ...definition };
    this.commandMap.set(normalised.id, normalised);
    this.refreshCommandSnapshot();
    this.emitCommands();
    return () => {
      const current = this.commandMap.get(normalised.id);
      if (current === normalised) {
        this.commandMap.delete(normalised.id);
        this.refreshCommandSnapshot();
        this.emitCommands();
      }
    };
  }

  registerPanel(definition: PluginPanelDefinition): () => void {
    if (this.disposed) {
      this.logger.warn("运行时已释放，无法注册 panel", { id: definition.id });
      return () => {};
    }
    const normalised = { ...definition };
    this.panelMap.set(normalised.id, normalised);
    this.refreshPanelSnapshot();
    this.emitPanels();
    return () => {
      const current = this.panelMap.get(normalised.id);
      if (current === normalised) {
        this.panelMap.delete(normalised.id);
        this.refreshPanelSnapshot();
        this.emitPanels();
      }
    };
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    for (const dispose of this.overlayDisposers.values()) {
      try {
        dispose();
      } catch (error) {
        this.logger.error("释放 overlay 失败", { error });
      }
    }
    this.overlayDisposers.clear();
    this.commandMap.clear();
    this.panelMap.clear();
    this.bridgeOutputListeners.clear();
    this.refreshCommandSnapshot();
    this.refreshPanelSnapshot();
    this.emitCommands();
    this.emitPanels();
    this.snapshots.clear();
    this.disposed = true;
  }

  private refreshCommandSnapshot(): void {
    this.commandSnapshot = Array.from(this.commandMap.values()).sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.label.localeCompare(b.label, "zh-CN");
    });
  }

  private refreshPanelSnapshot(): void {
    this.panelSnapshot = Array.from(this.panelMap.values()).sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.title.localeCompare(b.title, "zh-CN");
    });
  }

  private emitCommands(): void {
    for (const listener of this.commandListeners) {
      listener();
    }
  }

  private emitPanels(): void {
    for (const listener of this.panelListeners) {
      listener();
    }
  }

  private async loadAllDescriptors(): Promise<void> {
    for (const descriptor of this.descriptors) {
      const manifest = descriptor.manifest;
      if (!manifest.targets.includes(this.target)) {
        continue;
      }
      if (this.snapshots.has(manifest.id)) {
        this.logger.warn("检测到重复插件 ID，已忽略后续加载", { id: manifest.id });
        continue;
      }
      const missingEvents = manifest.requiredEvents.filter(
        (event) => !this.availableEvents.includes(event)
      );
      const missingTools = manifest.requiredMcpTools.filter(
        (tool) => !this.availableMcpTools.includes(tool)
      );
      if (missingEvents.length > 0 || missingTools.length > 0) {
        this.logger.warn("插件能力缺失，保持禁用状态", {
          id: manifest.id,
          missingEvents,
          missingTools
        });
        this.snapshots.set(manifest.id, {
          manifest,
          grantedCapabilities: [],
          missingEvents,
          missingTools
        });
        continue;
      }
      try {
        const module = await descriptor.loader();
        if (typeof module?.register !== "function") {
          throw new Error("插件模块缺少 register(runtime) 导出");
        }
        await module.register(this, manifest);
        this.snapshots.set(manifest.id, {
          manifest,
          grantedCapabilities: manifest.capabilities,
          missingEvents,
          missingTools
        });
        this.logger.info("插件加载完成", { id: manifest.id, version: manifest.version });
      } catch (error) {
        this.logger.error("插件加载失败", { id: manifest.id, error });
      }
    }
  }
}

export function createPluginRuntime(options?: PluginRuntimeOptions): PluginRuntime {
  return new PluginRuntime(options);
}
