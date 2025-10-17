import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

export type LayoutRequest = {
  id: string;
  nodes: Array<{ id: string; width?: number; height?: number }>;
  edges: Array<{ id: string; source: string; target: string }>;
  options?: Record<string, string>;
};

export type LayoutResponse = {
  id: string;
  positions: Array<{ id: string; x: number; y: number }>;
  error?: string;
};

self.onmessage = async (evt: MessageEvent<LayoutRequest>) => {
  const req = evt.data;
  try {
    const options = {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
      "elk.spacing.nodeNode": "24",
      ...(req.options ?? {})
    } as Record<string, string>;
    const res = await elk.layout({
      id: "root",
      layoutOptions: options,
      children: req.nodes.map((n) => ({ id: n.id, width: n.width ?? 180, height: n.height ?? 36 })),
      edges: req.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }))
    } as any);
    const positions = (res.children ?? []).map((c: any) => ({ id: c.id as string, x: Number(c.x ?? 0), y: Number(c.y ?? 0) }));
    const payload: LayoutResponse = { id: req.id, positions };
    self.postMessage(payload);
  } catch (e) {
    const payload: LayoutResponse = { id: req.id, positions: [], error: (e as Error).message };
    self.postMessage(payload);
  }
};
