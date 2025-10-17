import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

export async function applyElkLayout(graph: { nodes: any[]; edges: any[] }, opts?: { useWorker?: boolean }) {
  if (opts?.useWorker) {
    try {
      const { default: WorkerCtor } = await import("./layout.worker?worker&inline");
      const worker: Worker = new (WorkerCtor as any)();
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const payload = {
        id,
        nodes: graph.nodes.map((n: any) => ({ id: n.id, width: 180, height: 36 })),
        edges: graph.edges.map((e: any) => ({ id: e.id ?? `${e.source}-${e.target}`, source: e.source, target: e.target }))
      };
      const res = await new Promise<{ positions: Array<{ id: string; x: number; y: number }> }>((resolve, reject) => {
        const onMsg = (evt: MessageEvent<any>) => {
          if (evt.data?.id === id) {
            worker.removeEventListener('message', onMsg);
            worker.terminate();
            if (evt.data?.error) reject(new Error(evt.data.error));
            else resolve({ positions: evt.data.positions ?? [] });
          }
        };
        worker.addEventListener('message', onMsg);
        worker.postMessage(payload);
      });
      const posMap = new Map(res.positions.map((p) => [p.id, { x: p.x, y: p.y }] as const));
      return {
        nodes: graph.nodes.map((n: any) => ({ ...n, position: posMap.get(n.id) ?? n.position ?? { x: 0, y: 0 } })),
        edges: graph.edges
      };
    } catch {
      // 如果 worker 不可用，退回主线程版本
    }
  }
  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
      "elk.spacing.nodeNode": "24"
    },
    children: graph.nodes.map((n: any) => ({ id: n.id, width: 180, height: 36 })),
    edges: graph.edges.map((e: any) => ({ id: e.id ?? `${e.source}-${e.target}`, sources: [e.source], targets: [e.target] }))
  };
  const res = await elk.layout(elkGraph);
  const posMap = new Map<string, { x: number; y: number }>();
  for (const child of res.children ?? []) {
    posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return {
    nodes: graph.nodes.map((n: any) => ({ ...n, position: posMap.get(n.id) ?? n.position ?? { x: 0, y: 0 } })),
    edges: graph.edges
  };
}
