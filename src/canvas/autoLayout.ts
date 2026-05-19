import dagre from "dagre";
import type { Edge, Node } from "reactflow";
import { getNodeType } from "../nodes/registry";
import { getNodeHeadline } from "../nodes/headline";
import { summaryRowCount } from "../nodes/summaries";
import { getInlineFields } from "../nodes/NodeInlineEditor";
import { useUiStore } from "../state/uiStore";
import type { NodeKind } from "../schema";

export function estimateNodeDimensions(node: Node) {
  const kind = node.type as NodeKind;
  const def = getNodeType(kind);
  if (!def) {
    return { width: 200, height: 80 };
  }
  const data = node.data || {};

  // Retrieve V2 flag from uiStore
  const nodeVersion = useUiStore.getState().nodeVersion;
  const isV2 = nodeVersion === "v2";

  // Width estimation: V2 node cards are wider
  const width = isV2 ? 280 : 220;

  // Header height:
  const headline = getNodeHeadline(kind, data);
  const headerH = headline ? 36 : 24;

  // Body height:
  const inlineFields = isV2 ? getInlineFields(kind, data) : [];
  const hasInlineEditor = isV2 && inlineFields.length > 0;

  let bodyH = 0;
  if (hasInlineEditor) {
    // 8px top padding + 10px bottom padding + (rows * 22px) + ((rows - 1) * 6px gap)
    bodyH = 18 + inlineFields.length * 22 + (inlineFields.length - 1) * 6;
  } else {
    const ROW_H = 16;
    const BODY_PAD_Y = 12;
    const bodyRows = summaryRowCount(kind, data);
    bodyH = bodyRows > 0 ? bodyRows * ROW_H + BODY_PAD_Y : 0;
  }

  // Dynamic/Static Outputs:
  const isMenu = kind === "menu_root" || kind === "menu_custom";
  let dynamicOutputsCount = 0;
  if (isMenu) {
    const actions = data.actions ?? {};
    const actionKeys = Object.keys(actions);
    dynamicOutputsCount = actionKeys.length;
    if (data.inactive_action_node_id) dynamicOutputsCount++;
    if (data.no_input?.action_node_id && !actionKeys.includes("no_input")) {
      dynamicOutputsCount++;
    }
  }
  const totalOutputs = def.outputs.length + dynamicOutputsCount;

  // Divider height:
  const hasBody = hasInlineEditor || bodyH > 0;
  const hasDivider = hasBody && totalOutputs > 0;
  const dividerH = hasDivider ? 3 : 0;

  // Ports Height:
  // Each output pill has margin 5px 10px and padding/content of approx 22px -> total 32px height.
  // Plus some padding top (4px) and bottom (6px) inside .fn-node-ports container -> 10px padding.
  const portsH = totalOutputs > 0 ? totalOutputs * 32 + 10 : 0;

  // Total Height:
  const height = headerH + bodyH + dividerH + portsH + 6; // 6px for borders & padding

  return { width, height };
}

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

  for (const n of nodes) {
    const size = {
      width: n.width && n.width > 0 ? n.width : estimateNodeDimensions(n).width,
      height: n.height && n.height > 0 ? n.height : estimateNodeDimensions(n).height,
    };
    g.setNode(n.id, size);
  }
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  const out: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const v = g.node(n.id);
    if (!v) continue;
    const w = n.width && n.width > 0 ? n.width : estimateNodeDimensions(n).width;
    const h = n.height && n.height > 0 ? n.height : estimateNodeDimensions(n).height;
    out[n.id] = { x: v.x - w / 2, y: v.y - h / 2 };
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

