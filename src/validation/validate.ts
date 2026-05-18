import type { Flow, FlowNode, NodeOf } from "@/schema";

export type Severity = "error" | "warning" | "info";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  node_id?: string;
}

interface Ctx {
  flow: Flow;
  byId: Map<string, FlowNode>;
  issues: Issue[];
}

export function validate(flow: Flow): Issue[] {
  const ctx: Ctx = {
    flow,
    byId: new Map(flow.nodes.map((n) => [n.id, n])),
    issues: [],
  };

  rootIntegrity(ctx);
  referenceIntegrity(ctx);
  reachability(ctx);
  forwardingRules(ctx);
  voicemailEmail(ctx);
  modeWithoutForwarding(ctx);
  callRecordingConfig(ctx);

  return ctx.issues;
}

function add(ctx: Ctx, issue: Issue) {
  ctx.issues.push(issue);
}

function rootIntegrity(ctx: Ctx) {
  if (ctx.flow.entity.type !== "auto_attendant") return;
  const roots = ctx.flow.nodes.filter((n) => n.type === "menu_root");
  if (roots.length === 0) {
    add(ctx, {
      code: "root_missing",
      severity: "error",
      message: "Auto Attendant must have a ROOT menu.",
    });
    return;
  }
  if (roots.length > 1) {
    add(ctx, {
      code: "root_duplicate",
      severity: "error",
      message: "Only one ROOT menu is allowed per Auto Attendant.",
    });
  }
  const root = roots[0] as NodeOf<"menu_root">;
  if (root.data.name !== "ROOT") {
    add(ctx, {
      code: "root_name",
      severity: "error",
      message: "ROOT menu name must be 'ROOT'.",
      node_id: root.id,
    });
  }
  // PortaOne docs (Configure the Auto Attendant) explicitly state that ROOT may be
  // "Always" or constrained to a time interval, with the When-inactive chain handling
  // inactivity. We only enforce singleton + name; the period is free.
}

function referenceIntegrity(ctx: Ctx) {
  for (const n of ctx.flow.nodes) {
    if (n.type === "menu_root" || n.type === "menu_custom") {
      for (const [key, action] of Object.entries(n.data.actions)) {
        if (!ctx.byId.has(action.target_node_id)) {
          add(ctx, {
            code: "menu_action_ref",
            severity: "error",
            message: `Menu action '${key}' references missing node ${action.target_node_id}.`,
            node_id: n.id,
          });
        }
      }
      const inactive = n.data.inactive_action_node_id;
      if (inactive && !ctx.byId.has(inactive)) {
        add(ctx, {
          code: "menu_inactive_ref",
          severity: "error",
          message: `inactive_action_node_id references missing node ${inactive}.`,
          node_id: n.id,
        });
      }
      const niAction = n.data.no_input.action_node_id;
      if (niAction && !ctx.byId.has(niAction)) {
        add(ctx, {
          code: "menu_noinput_ref",
          severity: "error",
          message: `no_input.action_node_id references missing node ${niAction}.`,
          node_id: n.id,
        });
      }
    }
    if (n.type === "action_goto_menu" && n.data.target_menu_node_id) {
      if (!ctx.byId.has(n.data.target_menu_node_id)) {
        add(ctx, {
          code: "goto_menu_ref",
          severity: "error",
          message: `Go to Menu target ${n.data.target_menu_node_id} not found.`,
          node_id: n.id,
        });
      }
    }
    if (n.type === "forward_follow_me" || n.type === "forward_advanced") {
      for (const rule of n.data.rules) {
        if (rule.target_node_id && !ctx.byId.has(rule.target_node_id)) {
          add(ctx, {
            code: "forward_rule_ref",
            severity: "error",
            message: `Forwarding rule target ${rule.target_node_id} not found.`,
            node_id: n.id,
          });
        }
      }
    }
  }
}

function reachability(ctx: Ctx) {
  const entries = ctx.flow.nodes.filter(
    (n) => n.type === "incoming_call" || n.type === "menu_root" || n.type === "answering_mode_ext",
  );
  if (entries.length === 0) {
    add(ctx, {
      code: "no_entry",
      severity: "warning",
      message: "No entry point (Incoming Call / ROOT menu / Answering Mode) found.",
    });
    return;
  }
  // Light heuristic: warn if no terminal-ish nodes exist at all.
  const hasTerminal = ctx.flow.nodes.some(
    (n) =>
      n.type.startsWith("term_") ||
      n.type === "action_disconnect" ||
      n.type === "voicemail" ||
      n.type === "fax_mailbox",
  );
  if (!hasTerminal) {
    add(ctx, {
      code: "no_terminal",
      severity: "warning",
      message: "Flow has no terminal node (disconnect, voicemail, or term_*). Calls may drop.",
    });
  }
}

function forwardingRules(ctx: Ctx) {
  for (const n of ctx.flow.nodes) {
    if (n.type === "forward_follow_me" || n.type === "forward_advanced") {
      const enabled = n.data.rules.filter((r) => r.enabled);
      if (enabled.length === 0) {
        add(ctx, {
          code: "forward_no_rules",
          severity: "warning",
          message: "Forwarding node has no enabled rules.",
          node_id: n.id,
        });
      }
    }
  }
}

function callRecordingConfig(ctx: Ctx) {
  for (const n of ctx.flow.nodes) {
    if (n.type !== "call_recording") continue;
    const d = n.data;
    const mode = d.mode ?? "automatic";

    // On-demand requires the manual-toggle to actually allow starting/stopping;
    // otherwise the recording never fires for this node.
    if (mode === "on_demand" && !d.allow_manual_start_stop) {
      add(ctx, {
        code: "recording_on_demand_disabled",
        severity: "warning",
        message:
          "Recording mode is 'on_demand' but manual start/stop is not allowed — recording will never start.",
        node_id: n.id,
      });
    }

    // Both auto-record toggles + on-demand mode is a contradiction (the docs say
    // auto_record_* implies automatic).
    if (mode === "on_demand" && (d.auto_record_incoming || d.auto_record_redirected)) {
      add(ctx, {
        code: "recording_mode_conflict",
        severity: "warning",
        message:
          "Auto-record toggles only apply to 'automatic' mode. Switch mode to 'automatic' or clear the toggles.",
        node_id: n.id,
      });
    }

    // Announce-to-all without any prompt configured falls back to a system default
    // that we don't model — flag so the author sees a recording without sound.
    const announceOn = d.announce_to_all ?? d.announce ?? true;
    const hasPrompt = d.announce_started_prompt ?? d.announce_prompt;
    if (announceOn && !hasPrompt) {
      add(ctx, {
        code: "recording_announce_no_prompt",
        severity: "warning",
        message:
          "Announcement is enabled but no started-prompt is set. PortaSwitch falls back to the English system prompt.",
        node_id: n.id,
      });
    }

    // Stopped-prompt without started-prompt is meaningless (stop never fires).
    if (d.announce_stopped_prompt && !d.announce_started_prompt && !d.announce_prompt) {
      add(ctx, {
        code: "recording_stopped_prompt_orphan",
        severity: "warning",
        message: "Stopped prompt is set but no started prompt — the stop event will not announce.",
        node_id: n.id,
      });
    }
  }
}

function voicemailEmail(ctx: Ctx) {
  for (const n of ctx.flow.nodes) {
    if (n.type === "voicemail" || n.type === "fax_mailbox") {
      if (n.data.email_option !== "none" && !n.data.email_address) {
        add(ctx, {
          code: "voicemail_email_address",
          severity: "error",
          message: `Email option '${n.data.email_option}' requires an email_address.`,
          node_id: n.id,
        });
      }
    }
  }
}

function modeWithoutForwarding(ctx: Ctx) {
  const ext = ctx.flow.nodes.find(
    (n): n is NodeOf<"answering_mode_ext"> => n.type === "answering_mode_ext",
  );
  if (!ext) return;
  const modesUsingForward = new Set([
    "ring_forward_voicemail",
    "ring_then_forward",
    "forward_then_voicemail",
    "forward_only",
  ]);
  const hasForwardNode = ctx.flow.nodes.some((n) => n.type.startsWith("forward_"));

  if (modesUsingForward.has(ext.data.mode) && !hasForwardNode) {
    add(ctx, {
      code: "mode_missing_forward",
      severity: "error",
      message: `Answering mode '${ext.data.mode}' requires a forwarding node, but none exists.`,
      node_id: ext.id,
    });
  }

  // PortaSwitch (MR129 Call Forwarding): "If the default answering mode … does not include
  // the 'Forward' action ('Ring then voicemail', 'Ring only', 'Voicemail only' or 'Reject'),
  // then the call will not be forwarded, no matter what forwarding mode is used."
  if (!modesUsingForward.has(ext.data.mode) && hasForwardNode) {
    add(ctx, {
      code: "forward_unreachable",
      severity: "warning",
      message: `Answering mode '${ext.data.mode}' never triggers Forward — forwarding nodes on this flow will be ignored.`,
      node_id: ext.id,
    });
  }
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
