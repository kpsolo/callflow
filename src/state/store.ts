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

let idSeq = 1;
function genId(prefix = "n"): string {
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
}

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
        set({
          edges: applyEdgeChanges(changes, get().edges),
          ...(isStructural ? { dirty: true } : {}),
        });
      },
      onConnect: (conn) =>
        set({
          edges: rfAddEdge({ ...conn, id: genId("e") }, get().edges),
          dirty: true,
        }),

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

      updateNodeData: (id, data) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, data: data as typeof n.data } : n,
          ),
          dirty: true,
        }),

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
