import dagre from "dagre";
import type { Edge, Node } from "reactflow";

const NODE_W = 200;
const NODE_H = 80;

export function layoutDagre(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  const out: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const v = g.node(n.id);
    if (!v) continue;
    out[n.id] = { x: v.x - NODE_W / 2, y: v.y - NODE_H / 2 };
  }
  return out;
}
