import { useEffect, useRef } from "react";
import type { CollabClient } from "@/api";
import { useCollab } from "@/api";
import { useFlowStore } from "./store";

/**
 * Watches the flow store for structural changes and emits activity events
 * into the collaboration backend. Pure observer — never mutates the store.
 *
 * The detection model is intentionally diff-based rather than per-action
 * hook so the store implementation stays free of cross-cutting concerns.
 * Granularity is "logical operation": adding a node fires one event;
 * batched node-position changes from React Flow are collapsed into a
 * single "node_moved" we don't bother recording (positions aren't audit-
 * worthy in this app).
 */
export function useActivityRecorder(): void {
  const collab = useCollab();
  // Track previous snapshot keyed by entity id so switching entities resets cleanly.
  const previousRef = useRef<{
    flowId: string | null;
    nodeIds: Set<string>;
    edgeIds: Set<string>;
    nodeNames: Map<string, string>;
    edgeTargets: Map<string, string>;
    entityName: string | null;
  }>({
    flowId: null,
    nodeIds: new Set(),
    edgeIds: new Set(),
    nodeNames: new Map(),
    edgeTargets: new Map(),
    entityName: null,
  });

  useEffect(() => {
    const unsubscribe = useFlowStore.subscribe((state) => {
      const flowId = state.entity.id;
      const prev = previousRef.current;
      const isSameFlow = prev.flowId === flowId;

      const nodeIds = new Set(state.nodes.map((n) => n.id));
      const edgeIds = new Set(state.edges.map((e) => e.id));
      const nodeNames = new Map<string, string>();
      for (const n of state.nodes) {
        const data = n.data as { name?: string };
        if (data && typeof data.name === "string") nodeNames.set(n.id, data.name);
      }
      const edgeTargets = new Map<string, string>();
      for (const e of state.edges) edgeTargets.set(e.id, `${e.source}->${e.target}`);

      if (!isSameFlow) {
        // Flow switched — record a load event and reset baseline without
        // emitting spurious add/remove events for the natural delta.
        emit(collab, flowId, "flow_loaded", { entity: state.entity.type });
        previousRef.current = {
          flowId,
          nodeIds,
          edgeIds,
          nodeNames,
          edgeTargets,
          entityName: state.entity.name,
        };
        return;
      }

      // Same flow: diff and record per logical change.
      diffAndEmit(collab, flowId, prev, {
        nodeIds,
        edgeIds,
        nodeNames,
        edgeTargets,
      });

      if (prev.entityName !== state.entity.name) {
        emit(collab, flowId, "entity_renamed", {
          from: prev.entityName,
          to: state.entity.name,
        });
      }

      previousRef.current = {
        flowId,
        nodeIds,
        edgeIds,
        nodeNames,
        edgeTargets,
        entityName: state.entity.name,
      };
    });
    return () => unsubscribe();
  }, [collab]);
}

function diffAndEmit(
  collab: CollabClient,
  flowId: string,
  prev: {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
    nodeNames: Map<string, string>;
    edgeTargets: Map<string, string>;
  },
  next: {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
    nodeNames: Map<string, string>;
    edgeTargets: Map<string, string>;
  },
): void {
  // Added / removed nodes.
  for (const id of next.nodeIds) {
    if (!prev.nodeIds.has(id)) emit(collab, flowId, "node_added", { nodeId: id });
  }
  for (const id of prev.nodeIds) {
    if (!next.nodeIds.has(id)) emit(collab, flowId, "node_removed", { nodeId: id });
  }

  // Renamed nodes (only fires for kinds that carry data.name).
  for (const [id, name] of next.nodeNames.entries()) {
    const before = prev.nodeNames.get(id);
    if (before !== undefined && before !== name) {
      emit(collab, flowId, "node_renamed", { nodeId: id, from: before, to: name });
    }
  }

  // Added / removed edges. Menu retargets are detected as a same-id edge with
  // a changed source->target string — those fire `menu_action_retargeted`.
  for (const id of next.edgeIds) {
    if (!prev.edgeIds.has(id)) emit(collab, flowId, "edge_added", { edgeId: id });
  }
  for (const id of prev.edgeIds) {
    if (!next.edgeIds.has(id)) emit(collab, flowId, "edge_removed", { edgeId: id });
  }
  for (const [id, tgt] of next.edgeTargets.entries()) {
    const before = prev.edgeTargets.get(id);
    if (before !== undefined && before !== tgt && id.startsWith("menu_")) {
      emit(collab, flowId, "menu_action_retargeted", {
        edgeId: id,
        from: before,
        to: tgt,
      });
    }
  }
}

function emit(
  collab: CollabClient,
  flowId: string,
  kind: Parameters<CollabClient["recordActivity"]>[0]["kind"],
  payload?: Record<string, unknown>,
): void {
  collab.recordActivity({ flowId, kind, payload });
}
