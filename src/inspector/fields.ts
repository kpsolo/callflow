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
  /**
   * Per-option human description for `select` fields. The Inspector renders the
   * description for the currently selected value below the dropdown.
   */
  optionDescriptions?: Record<string, string>;
  placeholder?: string;
  min?: number;
  max?: number;
  description?: string;
  /**
   * Predicate to hide the field based on sibling values. Use for discriminator
   * patterns (e.g., only show `number` when `mode === "e164"`).
   */
  visibleWhen?: (data: Record<string, unknown>) => boolean;
  /**
   * For complex node types (menus), which inspector tab this field belongs in.
   * `undefined` = no tab grouping; the Inspector falls back to a flat layout.
   */
  tab?: "general" | "prompts" | "actions" | "errors";
  /**
   * Hide this field from the v2 in-node inline editor. Use for fields that are
   * primarily set by drawing edges (e.g. action_transfer.target_node_id) — they
   * would just clutter the card without being directly editable.
   * The sidebar Inspector still shows the field.
   */
  inlineHidden?: boolean;
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
    { key: "name", label: "Name", type: "readonly", tab: "general" },
    { key: "active_period", label: "Active period", type: "active-period", tab: "general" },
    { key: "allow_direct_dial", label: "Allow direct extension dial", type: "toggle", tab: "general" },
    {
      key: "interdigit_timeout_s",
      label: "Interdigit timeout (s)",
      type: "number",
      min: 1,
      max: 30,
      tab: "general",
      inlineHidden: true,
    },
    { key: "intro_prompt", label: "Intro prompt", type: "text", tab: "prompts" },
    { key: "menu_prompt", label: "Menu prompt", type: "text", tab: "prompts" },
    { key: "actions", label: "Menu actions", type: "actions-map", tab: "actions" },
    {
      key: "no_input.timeout_s",
      label: "No-input timeout (s)",
      type: "number",
      min: 1,
      max: 60,
      tab: "errors",
    },
    { key: "max_input_errors", label: "Max input errors", type: "number", min: 1, max: 10, tab: "errors" },
    { key: "on_timeout_prompt", label: "On-timeout prompt", type: "text", tab: "errors" },
    { key: "on_unavailable_prompt", label: "On-unavailable prompt", type: "text", tab: "errors" },
    { key: "max_fails_prompt", label: "Max-fails prompt", type: "text", tab: "errors" },
  ],
  menu_custom: [
    { key: "name", label: "Name", type: "text", tab: "general" },
    { key: "active_period", label: "Active period", type: "active-period", tab: "general" },
    { key: "allow_direct_dial", label: "Allow direct extension dial", type: "toggle", tab: "general" },
    { key: "interdigit_timeout_s", label: "Interdigit timeout (s)", type: "number", tab: "general", inlineHidden: true },
    { key: "intro_prompt", label: "Intro prompt", type: "text", tab: "prompts" },
    { key: "menu_prompt", label: "Menu prompt", type: "text", tab: "prompts" },
    { key: "actions", label: "Menu actions", type: "actions-map", tab: "actions" },
    { key: "no_input.timeout_s", label: "No-input timeout (s)", type: "number", tab: "errors" },
    { key: "max_input_errors", label: "Max input errors", type: "number", min: 1, max: 10, tab: "errors" },
    { key: "on_timeout_prompt", label: "On-timeout prompt", type: "text", tab: "errors" },
    { key: "on_unavailable_prompt", label: "On-unavailable prompt", type: "text", tab: "errors" },
    { key: "max_fails_prompt", label: "Max-fails prompt", type: "text", tab: "errors" },
  ],
  action_transfer: [
    {
      key: "mode",
      label: "Transfer to",
      type: "select",
      options: ["extension", "hunt_group", "sip_uri", "e164"],
      optionDescriptions: {
        extension: "Route the call to an internal extension directly configured in this node.",
        hunt_group: "Route the call to a hunt group directly configured in this node.",
        sip_uri: "Route the call to a SIP URI directly configured in this node.",
        e164: "Place an outbound call to an E.164 number (e.g. +18005551234).",
      },
    },
    {
      key: "extension",
      label: "Extension",
      type: "text",
      placeholder: "100",
      visibleWhen: (d) => d.mode === "extension",
    },
    {
      key: "hunt_group_id",
      label: "Hunt group ID",
      type: "text",
      placeholder: "hg_1",
      visibleWhen: (d) => d.mode === "hunt_group",
    },
    {
      key: "uri",
      label: "SIP URI",
      type: "text",
      placeholder: "sip:user@example.com",
      visibleWhen: (d) => d.mode === "sip_uri",
    },
    {
      key: "number",
      label: "E.164 number",
      type: "text",
      placeholder: "+18005551234",
      visibleWhen: (d) => d.mode === "e164",
    },
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
  action_nop: [{ key: "prompt", label: "Optional prompt", type: "text" }],
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
    {
      key: "mode",
      label: "Recording mode",
      type: "select",
      options: ["automatic", "on_demand"],
    },
    {
      key: "allow_manual_start_stop",
      label: "Allow start/stop with DTMF",
      type: "toggle",
    },
    { key: "start_dtmf_code", label: "Start DTMF code", type: "text", placeholder: "*44" },
    { key: "stop_dtmf_code", label: "Stop DTMF code", type: "text", placeholder: "*45" },
    { key: "announce_to_all", label: "Announce to all parties", type: "toggle" },
    { key: "announce_started_prompt", label: "Started prompt", type: "text" },
    { key: "announce_stopped_prompt", label: "Stopped prompt", type: "text" },
    { key: "auto_record_incoming", label: "Auto-record incoming", type: "toggle" },
    { key: "auto_record_redirected", label: "Auto-record redirected", type: "toggle" },
    { key: "format", label: "Output format", type: "select", options: ["wav", "mp3"] },
    { key: "send_to_email", label: "Send to email", type: "email" },
    { key: "private_to_owner", label: "Show to myself only", type: "toggle" },
    { key: "enable_transcription", label: "Enable AI transcription", type: "toggle" },
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
