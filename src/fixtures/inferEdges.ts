import type { FlowEdge, FlowNode } from "@/schema";

/**
 * Derive visual edges from the data-level references inside nodes
 * (menu action targets, inactive/no-input fallbacks, action transfer targets,
 * forwarding-rule targets, mailbox references).
 *
 * Use this when authoring fixtures so the canvas shows connections matching
 * what the simulator follows.
 */
export function inferEdges(nodes: FlowNode[]): FlowEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const edges: FlowEdge[] = [];
  let seq = 0;
  const add = (source: string, sourceHandle: string, target: string | undefined, label?: string) => {
    if (!target || !ids.has(target)) return;
    seq += 1;
    edges.push({
      id: `e_${seq}`,
      source,
      sourceHandle,
      target,
      targetHandle: "in",
      label,
    });
  };

  for (const n of nodes) {
    switch (n.type) {
      case "menu_root":
      case "menu_custom": {
        const actionKeys = new Set<string>();
        for (const [key, action] of Object.entries(n.data.actions)) {
          add(n.id, `menu:${key}`, action.target_node_id, key);
          actionKeys.add(key);
        }
        add(n.id, "inactive", n.data.inactive_action_node_id, "inactive");
        // Only emit a separate no_input edge if the actions map didn't already cover it.
        if (!actionKeys.has("no_input")) {
          add(n.id, "no_input", n.data.no_input.action_node_id, "no_input");
        }
        break;
      }
      case "action_transfer":
        add(n.id, "next", n.data.target_node_id);
        break;
      case "action_voicemail":
        add(n.id, "next", n.data.mailbox_node_id);
        break;
      case "action_goto_menu":
        add(n.id, "next", n.data.target_menu_node_id);
        break;
      case "forward_follow_me":
      case "forward_advanced": {
        for (const rule of n.data.rules) {
          add(n.id, "answered", rule.target_node_id, "rule");
        }
        break;
      }
      case "answering_mode_ext": {
        add(n.id, "forward", n.data.forward_node_id);
        add(n.id, "voicemail", n.data.voicemail_node_id);
        break;
      }
      case "answering_mode_aa": {
        add(n.id, "forward", n.data.forward_node_id);
        add(n.id, "ivr", n.data.ivr_menu_node_id);
        break;
      }
    }
  }
  return edges;
}
