import type { Flow } from "@/schema";
import { genId } from "./store";

/**
 * Return a structural clone of `src` with every node id, edge id, and intra-data
 * `*_node_id` reference re-minted. The source remains untouched.
 *
 * Today the canvas only ever holds one flow at a time, so a verbatim clone is
 * harmless — but the moment two flows coexist (compare view, multi-flow
 * workspace, paste-between-flows) reused ids cause node mix-ups. This helper
 * makes a clone safe to load alongside its source.
 *
 * `entity` and `scenarios` are copied as-is — entity identity is the caller's
 * concern, and scenarios reference nodes only by id (handled by the same
 * remap walk).
 */
export function cloneFlowWithFreshIds(src: Flow): Flow {
  const idMap = new Map<string, string>();
  for (const n of src.nodes) {
    const prefix = (n.type ?? "node").slice(0, 4);
    idMap.set(n.id, genId(prefix));
  }
  const remap = (id: string): string => idMap.get(id) ?? id;

  const nodes = src.nodes.map((n) => ({
    ...n,
    id: remap(n.id),
    data: rewriteIdRefs(n.data, remap) as typeof n.data,
  })) as Flow["nodes"];

  const edges = src.edges.map((e) => ({
    ...e,
    id: genId("e"),
    source: remap(e.source),
    target: remap(e.target),
  }));

  const scenarios = (rewriteIdRefs(src.scenarios, remap) ?? src.scenarios) as Flow["scenarios"];

  return {
    ...src,
    nodes,
    edges,
    scenarios,
  };
}

/**
 * Recursively walk `value`, replacing any string field whose key ends in
 * `_node_id` via `remap`. Keys we know about today: `target_node_id`,
 * `target_menu_node_id`, `mailbox_node_id`, `inactive_action_node_id`,
 * `action_node_id` (inside `no_input`), `forward_node_id`, `voicemail_node_id`,
 * `ivr_menu_node_id`. The generic suffix check future-proofs the helper
 * against new node-id fields added to the schemas later.
 */
function rewriteIdRefs(value: unknown, remap: (id: string) => string): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => rewriteIdRefs(v, remap));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && k.endsWith("_node_id")) {
      out[k] = remap(v);
    } else {
      out[k] = rewriteIdRefs(v, remap);
    }
  }
  return out;
}
