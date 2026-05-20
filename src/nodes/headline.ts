import type { FlowNode, NodeKind, NodeOf } from "@/schema";

/**
 * The headline is the human-meaningful identifier of a node — the thing a user
 * would naturally use to refer to it. When present it becomes the large text
 * in the node header, and the kind/type label demotes to a small tag.
 *
 * Returning `null` falls back to the registry `label`/`shortLabel` (today's
 * behaviour) — appropriate for kinds that don't carry their own identifier.
 *
 * Kept lean on purpose: only emit a headline when it's actually a more useful
 * identifier than the type label. e.g. an action_transfer in `extension` mode
 * pointing at a target node would just say the target's id — not useful — so
 * we skip it. The body summary already surfaces those details.
 */
type HeadlineFn<K extends NodeKind> = (data: NodeOf<K>["data"]) => string | null;

const headlines: { [K in NodeKind]?: HeadlineFn<K> } = {
  menu_root: (d) => d.name || null,
  menu_custom: (d) => d.name || null,
  screening_rule: (d) => d.name || null,
  target_extension: (d) => d.extension || null,
  target_external: (d) => d.number || null,
  target_sip_uri: (d) => d.uri || null,
  target_hunt_group_ref: (d) => d.label || d.hunt_group_id || null,
  forward_simple: (d) => d.target_number || null,
  forward_sip_uri: (d) => d.target_uri || null,
  action_transfer: (d) => {
    if (d.mode === "extension") return d.extension || d.target_node_id || null;
    if (d.mode === "hunt_group") return d.label || d.hunt_group_id || null;
    if (d.mode === "sip_uri") return d.uri || null;
    return d.number || null;
  },
  menu_action_transfer: (d) => {
    if (d.mode === "extension") return d.extension || null;
    if (d.mode === "hunt_group") return d.label || d.hunt_group_id || null;
    if (d.mode === "sip_uri") return d.uri || null;
    if (d.mode === "e164") return d.number || null;
    return d.target_node_id || null;
  },
  action_queue: (d) => d.queue_name || null,
};

export function getNodeHeadline<K extends NodeKind>(
  kind: K,
  data: FlowNode["data"],
): string | null {
  const fn = headlines[kind] as HeadlineFn<K> | undefined;
  if (!fn) return null;
  return fn(data as NodeOf<K>["data"]);
}
