import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

export async function applyElkLayout(graph: { nodes: any[]; edges: any[] }) {
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
