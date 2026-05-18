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
  g.setGraph({
    rankdir: direction,
    ranksep: 80,
    nodesep: 40,
    // Align upper-left so ROOT (with no incoming edges) sits at the top of its
    // rank instead of being vertically centred — Western reading order.
    align: "UL",
  });
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

  // Final pass: pin the ROOT menu (if present) to be at the visual top-left.
  // dagre may have placed it level with other rank-0 nodes; we want it anchored
  // as the unambiguous starting point of the flow.
  const root = nodes.find((n) => n.type === "menu_root");
  if (root && out[root.id]) {
    const minY = Math.min(...Object.values(out).map((p) => p.y));
    if (out[root.id].y !== minY) out[root.id] = { ...out[root.id], y: minY };
  }
  return out;
}
