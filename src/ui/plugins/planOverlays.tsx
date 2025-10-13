import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import type {
  ExecutionVisualizationStatus,
  PlanNodeEvent,
  PlanNodeOverlayRenderContext,
  PlanNodeState
} from "../visualizationTypes";

export interface PlanNodeOverlayDefinition {
  readonly id: string;
  readonly label?: string;
  readonly priority?: number;
  readonly shouldRender?: (context: PlanNodeOverlayRenderContext) => boolean;
  readonly render: (context: PlanNodeOverlayRenderContext) => ReactNode;
}

interface Snapshot {
  readonly overlays: readonly PlanNodeOverlayDefinition[];
}

class PlanOverlayRegistry {
  private overlays = new Map<string, PlanNodeOverlayDefinition>();
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = { overlays: [] };

  register(definition: PlanNodeOverlayDefinition): () => void {
    const normalised = { ...definition };
    this.overlays.set(normalised.id, normalised);
    this.refreshSnapshot();
    this.emit();
    return () => {
      this.overlays.delete(normalised.id);
      this.refreshSnapshot();
      this.emit();
    };
  }

  has(id: string): boolean {
    return this.overlays.has(id);
  }

  list(): readonly PlanNodeOverlayDefinition[] {
    return this.snapshot.overlays;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    if (this.overlays.size === 0) {
      return;
    }
    this.overlays.clear();
    this.refreshSnapshot();
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private refreshSnapshot(): void {
    const overlays = Array.from(this.overlays.values()).sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA;
    });
    this.snapshot = { overlays };
  }
}

const FALLBACK_REGISTRY = new PlanOverlayRegistry();
const GLOBAL_KEY = "__HushOpsPlanOverlayRegistry__";

declare global {
  interface Window {
    __HushOpsPlanOverlayRegistry__?: PlanOverlayRegistry;
  }
}

function resolveRegistry(): PlanOverlayRegistry {
  if (typeof window === "undefined") {
    return FALLBACK_REGISTRY;
  }
  const globalWindow = window as Window & { [GLOBAL_KEY]?: PlanOverlayRegistry };
  if (!globalWindow[GLOBAL_KEY]) {
    globalWindow[GLOBAL_KEY] = new PlanOverlayRegistry();
  }
  return globalWindow[GLOBAL_KEY]!;
}

export function getPlanOverlayRegistry(): PlanOverlayRegistry {
  return resolveRegistry();
}

export function registerPlanOverlay(definition: PlanNodeOverlayDefinition): () => void {
  return getPlanOverlayRegistry().register(definition);
}

export function usePlanNodeOverlays(): readonly PlanNodeOverlayDefinition[] {
  const registry = getPlanOverlayRegistry();
  const subscribe = (listener: () => void) => registry.subscribe(listener);
  const getSnapshot = () => registry.list();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetPlanOverlayRegistryForTests(): void {
  getPlanOverlayRegistry().clear();
}

export type {
  ExecutionVisualizationStatus,
  PlanNodeEvent,
  PlanNodeOverlayRenderContext,
  PlanNodeState
};
