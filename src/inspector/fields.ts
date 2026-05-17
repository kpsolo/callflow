import type { NodeKind } from "@/schema";

export type FieldType =
  | "text"
  | "number"
  | "toggle"
  | "select"
  | "email"
  | "actions-map"
  | "rules-list"
  | "active-period"
  | "readonly";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Dotted path for nested data, e.g. "no_input.timeout_s" */
  path?: string;
  options?: readonly string[];
  placeholder?: string;
  min?: number;
  max?: number;
  description?: string;
}

const ANSWERING_EXT_MODES = [
  "ring_forward_voicemail",
  "ring_then_forward",
  "ring_then_voicemail",
  "forward_then_voicemail",
  "ring_only",
  "forward_only",
  "voicemail_only",
  "reject",
] as const;

const ANSWERING_AA_MODES = [
  "ring_forward_ivr",
  "ring_then_forward",
  "ring_then_ivr",
  "forward_then_ivr",
  "ring_only",
  "forward_only",
  "ivr_only",
  "reject",
] as const;

const VM_GREETING = ["standard", "personal", "name", "extended_absence"] as const;
const VM_EMAIL = ["none", "forward", "forward_as_attachment", "copy", "notify"] as const;
const RING_MODES = ["sequential", "simultaneous", "random", "percentage"] as const;

export const FIELDS: Partial<Record<NodeKind, FieldDef[]>> = {
  incoming_call: [
    { key: "label", label: "Label", type: "text" },
    { key: "did", label: "DID", type: "text", placeholder: "+18005551234" },
  ],
  outgoing_call: [
    { key: "label", label: "Label", type: "text" },
    { key: "record", label: "Record calls", type: "toggle" },
    {
      key: "record_announce_prompt",
      label: "Announcement prompt",
      type: "text",
      placeholder: "prompt_id",
    },
    { key: "record_send_to_email", label: "Send to email", type: "email" },
    { key: "unblock_code_required", label: "Require unblock code (IVR)", type: "toggle" },
  ],
  menu_root: [
    { key: "name", label: "Name", type: "readonly" },
    { key: "active_period", label: "Active period", type: "active-period" },
    { key: "intro_prompt", label: "Intro prompt", type: "text" },
    { key: "menu_prompt", label: "Menu prompt", type: "text" },
    {
      key: "no_input.timeout_s",
      label: "No-input timeout (s)",
      type: "number",
      min: 1,
      max: 60,
    },
    { key: "allow_direct_dial", label: "Allow direct extension dial", type: "toggle" },
    {
      key: "interdigit_timeout_s",
      label: "Interdigit timeout (s)",
      type: "number",
      min: 1,
      max: 30,
    },
    { key: "actions", label: "Menu actions", type: "actions-map" },
    { key: "max_input_errors", label: "Max input errors", type: "number", min: 1, max: 10 },
    { key: "on_timeout_prompt", label: "On-timeout prompt", type: "text" },
    { key: "on_unavailable_prompt", label: "On-unavailable prompt", type: "text" },
    { key: "max_fails_prompt", label: "Max-fails prompt", type: "text" },
  ],
  menu_custom: [
    { key: "name", label: "Name", type: "text" },
    { key: "active_period", label: "Active period", type: "active-period" },
    { key: "intro_prompt", label: "Intro prompt", type: "text" },
    { key: "menu_prompt", label: "Menu prompt", type: "text" },
    { key: "no_input.timeout_s", label: "No-input timeout (s)", type: "number" },
    { key: "allow_direct_dial", label: "Allow direct extension dial", type: "toggle" },
    { key: "interdigit_timeout_s", label: "Interdigit timeout (s)", type: "number" },
    { key: "actions", label: "Menu actions", type: "actions-map" },
    { key: "max_input_errors", label: "Max input errors", type: "number", min: 1, max: 10 },
    { key: "on_timeout_prompt", label: "On-timeout prompt", type: "text" },
    { key: "on_unavailable_prompt", label: "On-unavailable prompt", type: "text" },
    { key: "max_fails_prompt", label: "Max-fails prompt", type: "text" },
  ],
  action_transfer_e164: [
    { key: "number", label: "E.164 number", type: "text", placeholder: "+18005551234" },
    { key: "play_before_action", label: "Play before action", type: "text" },
  ],
  action_prompt_extension: [
    { key: "prompt", label: "Prompt", type: "text" },
    { key: "timeout_s", label: "Timeout (s)", type: "number", min: 1, max: 30 },
    { key: "max_digits", label: "Max digits", type: "number", min: 1, max: 10 },
  ],
  action_dial_direct: [
    {
      key: "first_digit",
      label: "First digit",
      type: "select",
      options: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    },
    { key: "max_digits", label: "Max digits", type: "number", min: 1, max: 10 },
  ],
  action_disconnect: [{ key: "play_before_action", label: "Play before action", type: "text" }],
  action_disa: [{ key: "password_prompt", label: "Password prompt", type: "text" }],
  action_queue: [{ key: "queue_name", label: "Queue name", type: "text" }],
  action_dial_by_name: [
    { key: "prompt", label: "Prompt", type: "text" },
    { key: "announce_extensions", label: "Announce extension numbers", type: "toggle" },
  ],
  answering_mode_ext: [
    { key: "mode", label: "Mode", type: "select", options: ANSWERING_EXT_MODES },
    { key: "ring_timeout_s", label: "Ring timeout (s)", type: "number", min: 1, max: 120 },
    { key: "reject_sip_code", label: "Reject SIP code", type: "number", min: 400, max: 699 },
  ],
  answering_mode_aa: [
    { key: "mode", label: "Mode", type: "select", options: ANSWERING_AA_MODES },
    { key: "ring_timeout_s", label: "Ring timeout (s)", type: "number", min: 1, max: 120 },
    { key: "reject_sip_code", label: "Reject SIP code", type: "number", min: 400, max: 699 },
  ],
  forward_follow_me: [
    { key: "ring_mode", label: "Ring mode", type: "select", options: RING_MODES },
    { key: "replace_caller_id_name", label: "Replace caller display name", type: "toggle" },
    { key: "rules", label: "Forwarding rules", type: "rules-list" },
  ],
  forward_advanced: [
    { key: "ring_mode", label: "Ring mode", type: "select", options: RING_MODES },
    { key: "keep_original_cld", label: "Keep Original CLD", type: "toggle" },
    { key: "replace_caller_id_name", label: "Replace caller display name", type: "toggle" },
    { key: "rules", label: "Forwarding rules", type: "rules-list" },
  ],
  forward_sip_uri: [
    { key: "target_uri", label: "Target URI", type: "text", placeholder: "sip:user@host" },
    { key: "sip_proxy", label: "SIP proxy", type: "text" },
    { key: "timeout_s", label: "Timeout (s)", type: "number", min: 1, max: 120 },
  ],
  forward_simple: [
    { key: "target_number", label: "Target", type: "text", placeholder: "+1… or 401" },
    { key: "timeout_s", label: "Timeout (s)", type: "number", min: 1, max: 120 },
  ],
  screening_rule: [
    { key: "name", label: "Rule name", type: "text" },
    { key: "order", label: "Order", type: "number", min: 0 },
    { key: "enabled", label: "Enabled", type: "toggle" },
    { key: "conditions.time_period", label: "Time period", type: "active-period" },
    {
      key: "conditions.caller.kind",
      label: "Caller check",
      type: "select",
      options: ["any", "number", "prefix", "regex", "anonymous", "caller_list"],
    },
    { key: "conditions.caller.value", label: "Caller value", type: "text" },
    {
      key: "conditions.callee.kind",
      label: "Callee check",
      type: "select",
      options: ["any", "did", "alias"],
    },
    { key: "conditions.callee.value", label: "Callee value", type: "text" },
    { key: "action_mode", label: "Action mode", type: "select", options: ANSWERING_EXT_MODES },
    { key: "play_before_action", label: "Play before action", type: "text" },
  ],
  voicemail: [
    { key: "greeting", label: "Greeting", type: "select", options: VM_GREETING },
    { key: "require_pin", label: "Require PIN", type: "toggle" },
    { key: "auto_play", label: "Auto-play on login", type: "toggle" },
    { key: "announce_datetime", label: "Announce date/time", type: "toggle" },
    { key: "email_option", label: "Email option", type: "select", options: VM_EMAIL },
    { key: "email_address", label: "Email address", type: "email" },
  ],
  fax_mailbox: [
    { key: "email_option", label: "Email option", type: "select", options: VM_EMAIL },
    { key: "email_address", label: "Email address", type: "email" },
  ],
  call_recording: [
    { key: "announce", label: "Play announcement", type: "toggle" },
    { key: "announce_prompt", label: "Announcement prompt", type: "text" },
    { key: "send_to_email", label: "Send to email", type: "email" },
  ],
  cond_time: [{ key: "period", label: "Time period", type: "active-period" }],
  cond_caller: [
    {
      key: "kind",
      label: "Kind",
      type: "select",
      options: ["number", "prefix", "regex", "anonymous", "caller_list"],
    },
    { key: "value", label: "Value", type: "text" },
  ],
  cond_callee: [
    { key: "kind", label: "Kind", type: "select", options: ["did", "alias"] },
    { key: "value", label: "Value", type: "text" },
  ],
  cond_mode: [
    { key: "mode", label: "Mode", type: "text", placeholder: "business_hours" },
  ],
  target_extension: [{ key: "extension", label: "Extension", type: "text" }],
  target_hunt_group_ref: [
    { key: "hunt_group_id", label: "Hunt group ID", type: "text" },
    { key: "label", label: "Label", type: "text" },
  ],
  target_external: [{ key: "number", label: "E.164 number", type: "text" }],
  target_sip_uri: [{ key: "uri", label: "SIP URI", type: "text" }],
};
