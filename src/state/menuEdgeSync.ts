import type { Edge, Node } from "reactflow";
import type { FlowNode } from "@/schema";

/**
 * Bidirectional sync between a menu's `data.actions` map and the canvas edges
 * with sourceHandle `menu:<key>`.
 *
 * Source of truth = `data.actions`. These helpers project that into the edge
 * list (replacing any existing menu edges for the same source) so that:
 *
 *  - editing an action in the inspector updates the canvas edges live, and
 *  - dragging a new edge from a `menu:X` handle (or deleting one) updates the
 *    actions map.
 *
 * Edge IDs for menu actions are deterministic — `menu_<sourceNodeId>_<key>` —
 * so re-syncing doesn't shuffle React Flow's renderer.
 */

const MENU_HANDLE_PREFIX = "menu:";

function isMenuNode(node: { type?: string }): boolean {
  return node.type === "menu_root" || node.type === "menu_custom";
}

function menuEdgeId(sourceId: string, key: string): string {
  return `menu_${sourceId}_${key}`;
}

interface MenuActionMapEntry {
  target_node_id: string;
  play_before_action?: string;
}

function readActions(node: Node<FlowNode["data"]>): Record<string, MenuActionMapEntry> {
  const d = node.data as Record<string, unknown>;
  return (d.actions as Record<string, MenuActionMapEntry> | undefined) ?? {};
}

/**
 * Project a single menu node's data.actions into edges. Returns the next edge
 * array with any prior `menu:*` edges from this node removed and replaced.
 */
export function projectMenuEdges(
  menuNode: Node<FlowNode["data"]>,
  existingEdges: Edge[],
): Edge[] {
  if (!isMenuNode(menuNode)) return existingEdges;
  const actions = readActions(menuNode);

  // Strip existing menu edges from this source so we can re-add deterministically.
  const filtered = existingEdges.filter(
    (e) => !(e.source === menuNode.id && (e.sourceHandle ?? "").startsWith(MENU_HANDLE_PREFIX)),
  );

  const next: Edge[] = [...filtered];
  for (const [key, action] of Object.entries(actions)) {
    if (!action || !action.target_node_id) continue;
    next.push({
      id: menuEdgeId(menuNode.id, key),
      source: menuNode.id,
      sourceHandle: `${MENU_HANDLE_PREFIX}${key}`,
      target: action.target_node_id,
      targetHandle: "in",
      label: key,
    });
  }
  return next;
}

/**
 * When a user drags a new edge from a `menu:<key>` handle, rewrite the source
 * node's data.actions[key] so the next save/export reflects the connection.
 * Returns the next nodes array; pass-through (same reference) when nothing changes.
 */
export function applyMenuConnectToActions(
  nodes: Node<FlowNode["data"]>[],
  conn: { source: string; sourceHandle?: string | null; target: string },
): Node<FlowNode["data"]>[] {
  const sh = conn.sourceHandle ?? "";
  if (!sh.startsWith(MENU_HANDLE_PREFIX)) return nodes;
  const key = sh.slice(MENU_HANDLE_PREFIX.length);
  return nodes.map((n) => {
    if (n.id !== conn.source || !isMenuNode(n)) return n;
    const existing = readActions(n);
    const prev = existing[key];
    const nextEntry: MenuActionMapEntry = {
      target_node_id: conn.target,
      // Preserve play_before_action if the entry already existed.
      ...(prev?.play_before_action ? { play_before_action: prev.play_before_action } : {}),
    };
    return {
      ...n,
      data: { ...n.data, actions: { ...existing, [key]: nextEntry } } as typeof n.data,
    };
  });
}

/**
 * When a menu edge is removed (via Delete, context menu, etc.), strip the
 * matching action entry so the inspector and the JSON stay in sync.
 */
export function applyMenuEdgeRemovalToActions(
  nodes: Node<FlowNode["data"]>[],
  removed: Edge,
): Node<FlowNode["data"]>[] {
  const sh = removed.sourceHandle ?? "";
  if (!sh.startsWith(MENU_HANDLE_PREFIX)) return nodes;
  const key = sh.slice(MENU_HANDLE_PREFIX.length);
  return nodes.map((n) => {
    if (n.id !== removed.source || !isMenuNode(n)) return n;
    const existing = readActions(n);
    if (!(key in existing)) return n;
    const next = { ...existing };
    delete next[key];
    return {
      ...n,
      data: { ...n.data, actions: next } as typeof n.data,
    };
  });
}
