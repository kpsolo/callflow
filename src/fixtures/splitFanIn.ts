import type { FlowEdge, FlowNode } from "@/schema";

/**
 * Terminal-like node kinds that we treat as "cheap to duplicate" — when many
 * sources point at one of these, fan-in clutter destroys readability and
 * cloning the terminal per consumer is the simpler cure.
 */
const DUPLICATABLE_KINDS = new Set([
  "voicemail",
  "fax_mailbox",
  "action_disconnect",
  "term_answered",
  "term_voicemail_left",
  "term_forwarded_answered",
  "term_forwarded_unanswered",
  "term_rejected",
  "term_dropped",
]);

/** Inbound edge-count threshold above which we start cloning. */
const FAN_IN_THRESHOLD = 2;

/**
 * Visually de-cluttered nodes + edges: for each terminal-kind node with more
 * than `FAN_IN_THRESHOLD` inbound edges, clones it once per inbound source and
 * rewires the edges so each source has its own copy. Cloned nodes inherit data
 * and get deterministic IDs of the form `<original>__forMenu_<sourceId>`, so the
 * result is stable across re-runs of the helper.
 *
 * Simulator behaviour is unchanged: the per-clone data is identical to the
 * original and the engine evaluates voicemail/disconnect locally per visited
 * node id, so the trace's terminal codes remain the same.
 */
export function splitFanIn(
  nodes: FlowNode[],
  edges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const inbound = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    const arr = inbound.get(e.target) ?? [];
    arr.push(e);
    inbound.set(e.target, arr);
  }

  const outNodes: FlowNode[] = [...nodes];
  const outEdges: FlowEdge[] = [];

  // Build a quick lookup of which source-to-target edges need rewiring.
  // Key = original edge id, value = the new target id.
  const rewires = new Map<string, string>();

  // Stagger clones with a per-original sequence so a single tall terminal
  // (e.g. voicemail in v2 mode is ~270 px tall: header + 6 inline fields +
  // "done" port pill) doesn't get clones stacking on top of it. 300 px
  // leaves a comfortable gap for both v1 summary cards and v2 inline-editor
  // cards, and matches the spacing used by COL_SINK in the fixtures.
  const CLONE_Y_STEP = 300;
  const CLONE_X_OFFSET = 60;

  for (const node of nodes) {
    if (!DUPLICATABLE_KINDS.has(node.type)) continue;
    const inEdges = inbound.get(node.id) ?? [];
    if (inEdges.length <= FAN_IN_THRESHOLD) continue;

    // Keep the original node attached to the first inbound source.
    // Clone for every additional inbound source so each menu/action transfer
    // has its own visible terminal.
    let localSeq = 0;
    for (let i = 1; i < inEdges.length; i++) {
      const e = inEdges[i];
      // Disambiguate when several edges from the SAME source point at this terminal
      // (a menu with two keys both going to voicemail, for instance). Mostly we
      // include the source handle; if even that collides, fall back to the edge id.
      const handlePart = e.sourceHandle ? `_${e.sourceHandle.replace(/[^a-zA-Z0-9]/g, "_")}` : "";
      const cloneId = `${node.id}__forMenu_${e.source}${handlePart}`;
      localSeq += 1;
      const clone: FlowNode = {
        ...node,
        id: cloneId,
        position: {
          x: node.position.x + CLONE_X_OFFSET,
          y: node.position.y + localSeq * CLONE_Y_STEP,
        },
        // Deep clone data so later edits to one don't affect the other.
        data: JSON.parse(JSON.stringify(node.data)),
      } as FlowNode;
      outNodes.push(clone);
      rewires.set(e.id, cloneId);
    }
  }

  for (const e of edges) {
    const newTarget = rewires.get(e.id);
    outEdges.push(newTarget ? { ...e, target: newTarget } : e);
  }

  return { nodes: outNodes, edges: outEdges };
}
