import { create } from "zustand";
import { temporal } from "zundo";
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  addEdge as rfAddEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "reactflow";
import {
  type Flow,
  type FlowNode,
  type NodeKind,
  type Scenario,
  type Entity,
  SCHEMA_VERSION,
  emptyFlow,
} from "@/schema";
import { getNodeType } from "@/nodes/registry";
import {
  applyMenuConnectToActions,
  applyMenuEdgeRemovalToActions,
  projectMenuEdges,
} from "./menuEdgeSync";

let idSeq = 1;
export function genId(prefix = "n"): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}${idSeq.toString(36)}`;
}

export interface FlowStore {
  schemaVersion: string;
  entity: Entity;
  nodes: Node<FlowNode["data"]>[];
  edges: Edge[];
  scenarios: Scenario[];
  selectedNodeId: string | null;
  /** Bumped every time `loadFlow` is called so the canvas knows to fitView. */
  loadCounter: number;
  /** True when the flow has changes since the last load/clear/export. */
  dirty: boolean;
  /** Epoch ms of the last load/clear/export — used for the "saved Ns ago" pill. */
  lastSavedAt: number | null;
  markSaved: () => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;

  addNode: (kind: NodeKind, position: { x: number; y: number }) => string;
  /**
   * Add a new node "as a child of" `sourceNodeId` — place it right of the source
   * (with collision-nudge), and if a sensible source handle is available, wire
   * an edge to it in the same history step.
   *
   * Returns `{ nodeId, edgeId }` where `edgeId` is `null` when no edge was
   * created (e.g., source has no free output, target kind has no input, or the
   * source is a menu node and the caller is expected to follow up with a key
   * pick). The node is always created.
   */
  addNodeConnectedTo: (
    kind: NodeKind,
    sourceNodeId: string,
    sourceHandle: string | null,
  ) => { nodeId: string; edgeId: string | null };
  /** Replaces the node's data wholesale — caller composes the full next object. */
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  duplicateNode: (id: string) => string | null;
  removeEdge: (id: string) => void;
  setSelected: (id: string | null) => void;

  setEntity: (entity: Entity) => void;
  loadFlow: (flow: Flow) => void;
  exportFlow: () => Flow;
  clearFlow: () => void;

  replaceLayout: (positions: Record<string, { x: number; y: number }>) => void;

  /**
   * Collapse duplicate "terminal-like" nodes that share kind + identical data
   * into a single canonical node, rewiring all inbound edges. Useful after a
   * flow grows organically and accumulates many identical Voicemail/Disconnect
   * terminals — one click and the canvas reads as the many-to-one fan-in it
   * really is. Goes through normal store mutation, so it lands in undo history.
   * Returns the number of duplicates removed.
   */
  mergeIdenticalTerminals: () => number;
}

/** Kinds that are cheap to collapse — terminal outcomes and "leaf" actions that
 *  don't carry downstream behaviour. Process nodes (menus, transfers, conditions)
 *  are NOT mergeable: two transfers with identical data still represent two
 *  distinct authoring intents in most flows. */
const MERGEABLE_KINDS = new Set<NodeKind>([
  "voicemail",
  "fax_mailbox",
  "action_disconnect",
  "action_nop",
  "term_answered",
  "term_voicemail_left",
  "term_forwarded_answered",
  "term_forwarded_unanswered",
  "term_rejected",
  "term_dropped",
]);

function flowNodeToRf(n: FlowNode): Node<FlowNode["data"]> {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  };
}

function rfToFlowNodes(nodes: Node<FlowNode["data"]>[]): FlowNode[] {
  return nodes.map(
    (n) =>
      ({
        id: n.id,
        type: n.type as FlowNode["type"],
        position: n.position,
        data: n.data,
      }) as FlowNode,
  );
}

const initialEntity: Entity = {
  type: "auto_attendant",
  id: "aa_default",
  did: "+18005551234",
  name: "Demo Auto Attendant",
  directory: [],
};

export const useFlowStore = create<FlowStore>()(
  temporal(
    (set, get) => ({
      schemaVersion: SCHEMA_VERSION,
      entity: initialEntity,
      nodes: [
        {
          id: "n_root",
          type: "menu_root",
          position: { x: 200, y: 160 },
          data: getNodeType("menu_root").defaultData(),
        },
      ],
      edges: [],
      scenarios: [],
      selectedNodeId: null,
      loadCounter: 0,
      dirty: false,
      lastSavedAt: null,

      markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

      onNodesChange: (changes) => {
        // applyNodeChanges emits selection / dimension changes that aren't actual
        // edits — we only set dirty for structural/data deltas.
        const isStructural = changes.some(
          (c) => c.type !== "select" && c.type !== "dimensions",
        );
        set({
          nodes: applyNodeChanges(changes, get().nodes),
          ...(isStructural ? { dirty: true } : {}),
        });
      },
      onEdgesChange: (changes) => {
        const isStructural = changes.some((c) => c.type !== "select");
        // Edges being removed → also drop the matching data.actions[key] on the
        // source menu, otherwise the inspector and exported JSON drift.
        let nodes = get().nodes;
        if (isStructural) {
          const beforeEdges = get().edges;
          for (const c of changes) {
            if (c.type === "remove") {
              const e = beforeEdges.find((x) => x.id === c.id);
              if (e) nodes = applyMenuEdgeRemovalToActions(nodes, e);
            }
          }
        }
        set({
          edges: applyEdgeChanges(changes, get().edges),
          nodes,
          ...(isStructural ? { dirty: true } : {}),
        });
      },
      onConnect: (conn) => {
        const edges = rfAddEdge({ ...conn, id: genId("e") }, get().edges);
        // If the user dragged from a `menu:<key>` handle, write the connection
        // back into the source menu's data.actions so the inspector stays in
        // sync with the canvas. React Flow's Connection type allows null
        // source/target during the drag; we only act on completed connects.
        const nodes =
          conn.source && conn.target
            ? applyMenuConnectToActions(get().nodes, {
                source: conn.source,
                target: conn.target,
                sourceHandle: conn.sourceHandle,
              })
            : get().nodes;
        set({ edges, nodes, dirty: true });
      },

      addNode: (kind, position) => {
        const def = getNodeType(kind);
        const id = genId(kind.slice(0, 4));
        const node: Node<FlowNode["data"]> = {
          id,
          type: kind,
          position,
          data: def.defaultData(),
        };
        set({ nodes: [...get().nodes, node], selectedNodeId: id, dirty: true });
        return id;
      },

      addNodeConnectedTo: (kind, sourceNodeId, sourceHandle) => {
        const state = get();
        const source = state.nodes.find((n) => n.id === sourceNodeId);
        if (!source) {
          // Source vanished — fall back to placing at a default origin.
          const id = state.addNode(kind, { x: 0, y: 0 });
          return { nodeId: id, edgeId: null };
        }
        const def = getNodeType(kind);
        const sourceDef = getNodeType(source.type as NodeKind);
        const isMenuSource =
          source.type === "menu_root" || source.type === "menu_custom";

        // Placement: right of source with collision nudge-down. Uses the same
        // ranksep/nodesep that dagre auto-layout applies, so manually-placed
        // children sit on the same visual grid as auto-laid-out ones.
        const RANKSEP = 260;
        const NODESEP = 40;
        const approxW = 200;
        const approxH = 80;
        let position = { x: source.position.x + RANKSEP, y: source.position.y };
        const overlapsExisting = (p: { x: number; y: number }) =>
          state.nodes.some(
            (n) =>
              Math.abs(n.position.x - p.x) < approxW &&
              Math.abs(n.position.y - p.y) < approxH,
          );
        let guard = 0;
        while (overlapsExisting(position) && guard < 20) {
          position = { x: position.x, y: position.y + NODESEP };
          guard += 1;
        }

        // Build the new node first so we know its id when (optionally) wiring.
        const newId = genId(kind.slice(0, 4));
        const newNode: Node<FlowNode["data"]> = {
          id: newId,
          type: kind,
          position,
          data: def.defaultData(),
        };
        const nextNodes = [...state.nodes, newNode];

        // Decide whether to also create an edge in this same commit.
        const targetInputs = def.inputs;
        const dragKindHasInput = targetInputs.length > 0;

        let resolvedHandle: string | null = sourceHandle;
        let canConnect = dragKindHasInput;

        if (canConnect) {
          if (resolvedHandle === null) {
            // Menu sources: caller is expected to follow up with a key pick.
            if (isMenuSource) {
              canConnect = false;
            } else if (sourceDef.outputs.length === 0) {
              canConnect = false;
            } else {
              // Default to the first output; if that handle is already wired,
              // walk through the rest looking for a free one. If everything's
              // taken, give up (place-only).
              const usedHandles = new Set(
                state.edges
                  .filter((e) => e.source === sourceNodeId)
                  .map((e) => e.sourceHandle ?? ""),
              );
              const freePort = sourceDef.outputs.find(
                (p) => !usedHandles.has(p.id),
              );
              if (freePort) {
                resolvedHandle = freePort.id;
              } else {
                canConnect = false;
              }
            }
          }
        }

        if (!canConnect) {
          set({ nodes: nextNodes, selectedNodeId: newId, dirty: true });
          return { nodeId: newId, edgeId: null };
        }

        const edgeId = genId("e");
        const newEdge: Edge = {
          id: edgeId,
          source: sourceNodeId,
          sourceHandle: resolvedHandle,
          target: newId,
          targetHandle: "in",
        };
        const edgesAfter = rfAddEdge(newEdge, state.edges);
        // Mirror onConnect's menu-actions sync so dragging a menu handle to the
        // palette doesn't desync data.actions from the new edge.
        const nodesAfter = applyMenuConnectToActions(nextNodes, {
          source: sourceNodeId,
          target: newId,
          sourceHandle: resolvedHandle,
        });

        set({
          nodes: nodesAfter,
          edges: edgesAfter,
          selectedNodeId: newId,
          dirty: true,
        });
        return { nodeId: newId, edgeId };
      },

      updateNodeData: (id, data) => {
        const nextNodes = get().nodes.map((n) =>
          n.id === id ? { ...n, data: data as typeof n.data } : n,
        );
        const updated = nextNodes.find((n) => n.id === id);
        let edges = get().edges;
        // If the user edited a menu's actions map in the inspector, re-project
        // edges so the canvas reflects the change immediately.
        if (updated && (updated.type === "menu_root" || updated.type === "menu_custom")) {
          edges = projectMenuEdges(updated, edges);
        }
        set({ nodes: nextNodes, edges, dirty: true });
      },

      removeNode: (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (node && getNodeType(node.type as NodeKind).singletonPerEntity) return;
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
          dirty: true,
        });
      },

      duplicateNode: (id) => {
        const src = get().nodes.find((n) => n.id === id);
        if (!src) return null;
        if (getNodeType(src.type as NodeKind).singletonPerEntity) return null;
        const newId = genId(src.type?.slice(0, 4) ?? "node");
        const clone: Node<FlowNode["data"]> = {
          id: newId,
          type: src.type,
          position: { x: src.position.x + 40, y: src.position.y + 40 },
          data: JSON.parse(JSON.stringify(src.data)),
        };
        set({ nodes: [...get().nodes, clone], selectedNodeId: newId, dirty: true });
        return newId;
      },

      removeEdge: (id) =>
        set({ edges: get().edges.filter((e) => e.id !== id), dirty: true }),

      setSelected: (id) => set({ selectedNodeId: id }),

      setEntity: (entity) => set({ entity, dirty: true }),

      loadFlow: (flow) =>
        set({
          schemaVersion: flow.schema_version,
          entity: flow.entity,
          nodes: flow.nodes.map(flowNodeToRf),
          edges: flow.edges as Edge[],
          scenarios: flow.scenarios,
          selectedNodeId: null,
          loadCounter: get().loadCounter + 1,
          dirty: false,
          lastSavedAt: Date.now(),
        }),

      clearFlow: () =>
        set({
          nodes: [],
          edges: [],
          scenarios: [],
          selectedNodeId: null,
          loadCounter: get().loadCounter + 1,
          dirty: false,
          lastSavedAt: Date.now(),
        }),

      exportFlow: () => ({
        schema_version: SCHEMA_VERSION,
        entity: get().entity,
        nodes: rfToFlowNodes(get().nodes),
        edges: get().edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
          label: typeof e.label === "string" ? e.label : undefined,
        })),
        scenarios: get().scenarios,
      }),

      replaceLayout: (positions) =>
        set({
          nodes: get().nodes.map((n) =>
            positions[n.id] ? { ...n, position: positions[n.id] } : n,
          ),
          dirty: true,
        }),

      mergeIdenticalTerminals: () => {
        const allNodes = get().nodes;
        const allEdges = get().edges;
        // Group mergeable nodes by (kind, data-shape). JSON.stringify is good
        // enough here — terminal data is small and order-insensitive on the
        // shapes we care about; if that ever stops being true, switch to a
        // stable serializer.
        const groups = new Map<string, Node<FlowNode["data"]>[]>();
        for (const n of allNodes) {
          if (!MERGEABLE_KINDS.has(n.type as NodeKind)) continue;
          const key = `${n.type}::${JSON.stringify(n.data)}`;
          const arr = groups.get(key) ?? [];
          arr.push(n);
          groups.set(key, arr);
        }
        // For each group of >1, keep the first (by id-sort for determinism)
        // and remap the rest to it.
        const remap = new Map<string, string>(); // dup-id -> canonical-id
        const removedIds = new Set<string>();
        for (const arr of groups.values()) {
          if (arr.length < 2) continue;
          const sorted = [...arr].sort((a, b) => (a.id < b.id ? -1 : 1));
          const canonical = sorted[0];
          for (let i = 1; i < sorted.length; i++) {
            remap.set(sorted[i].id, canonical.id);
            removedIds.add(sorted[i].id);
          }
        }
        if (removedIds.size === 0) return 0;

        const nextNodes = allNodes.filter((n) => !removedIds.has(n.id));
        // Rewire edges: any edge targeting a removed node now targets the
        // canonical replacement. De-dupe identical (source, sourceHandle,
        // target) tuples that emerge from the rewire so we don't leave
        // stacked-on-top-of-each-other edges behind.
        const seen = new Set<string>();
        const nextEdges: Edge[] = [];
        for (const e of allEdges) {
          const target = remap.get(e.target) ?? e.target;
          const dedupeKey = `${e.source}::${e.sourceHandle ?? ""}::${target}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          nextEdges.push(target === e.target ? e : { ...e, target });
        }
        set({ nodes: nextNodes, edges: nextEdges, dirty: true });
        return removedIds.size;
      },
    }),
    {
      limit: 100,
      partialize: (state) => ({
        entity: state.entity,
        nodes: state.nodes,
        edges: state.edges,
        scenarios: state.scenarios,
      }),
      equality: (a, b) =>
        a.nodes === b.nodes &&
        a.edges === b.edges &&
        a.scenarios === b.scenarios &&
        a.entity === b.entity,
    },
  ),
);

export function resetEmptyFlow(entity: Entity) {
  useFlowStore.getState().loadFlow(emptyFlow(entity));
}

// Convenience: clear undo history on initial load.
useFlowStore.temporal.getState().clear();

if (typeof window !== "undefined") {
  (window as any).__flow_store__ = useFlowStore;
}

