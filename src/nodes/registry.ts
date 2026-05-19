import type { FlowNode, NodeKind } from "@/schema";

export type NodeCategory =
  | "entry"
  | "menu"
  | "action"
  | "answering"
  | "forwarding"
  | "screening"
  | "messaging"
  | "recording"
  | "condition"
  | "target"
  | "terminal";

export interface PortDef {
  id: string;
  label?: string;
}

export type EntityKind = "auto_attendant" | "extension";

export interface NodeTypeDef<K extends NodeKind = NodeKind> {
  kind: K;
  category: NodeCategory;
  label: string;
  shortLabel?: string;
  color: string;
  description: string;
  inputs: PortDef[];
  outputs: PortDef[];
  defaultData: () => Extract<FlowNode, { type: K }>["data"];
  /** ROOT menu is special-cased: cannot be created from palette or deleted. */
  paletteHidden?: boolean;
  singletonPerEntity?: boolean;
  /**
   * Entity types this node is primarily designed for. When omitted, the node is
   * considered shared (relevant to both AA and Extension flows). The palette uses
   * this to demote (not hide) off-pattern items for the current entity.
   */
  primaryFor?: EntityKind[];
}

const IN: PortDef[] = [{ id: "in" }];
const NO_PORTS: PortDef[] = [];
const OUT_NEXT: PortDef[] = [{ id: "next", label: "next" }];
const OUT_TF: PortDef[] = [
  { id: "true", label: "true" },
  { id: "false", label: "false" },
];
const OUT_ANSWERED_UNANSWERED: PortDef[] = [
  { id: "answered", label: "answered" },
  { id: "unanswered", label: "unanswered" },
];

const C = {
  entry: "#3a86ff",
  menu: "#9d4edd",
  action: "#f4a261",
  answering: "#ffb454",
  forwarding: "#06d6a0",
  screening: "#ef476f",
  messaging: "#8ecae6",
  recording: "#f75e9dff",
  condition: "#ffd166",
  target: "#5fa8d3",
  terminal: "#adb5bd",
} as const;

export const NODE_TYPES: { [K in NodeKind]: NodeTypeDef<K> } = {
  incoming_call: {
    kind: "incoming_call",
    category: "entry",
    label: "Incoming Call",
    color: C.entry,
    description: "Entry point for an inbound call to this entity.",
    inputs: NO_PORTS,
    outputs: OUT_NEXT,
    defaultData: () => ({ label: "Incoming Call" }),
  },
  outgoing_call: {
    kind: "outgoing_call",
    category: "entry",
    label: "Outgoing Call",
    color: C.entry,
    description: "Outgoing-call configuration entry (barring, recording, unblock code).",
    inputs: NO_PORTS,
    outputs: OUT_NEXT,
    defaultData: () => ({
      label: "Outgoing Call",
      barred_categories: [],
      record: false,
      unblock_code_required: false,
    }),
  },
  menu_root: {
    kind: "menu_root",
    category: "menu",
    label: "ROOT Menu",
    color: C.menu,
    description: "Mandatory root menu — singleton per Auto Attendant, always active.",
    inputs: IN,
    outputs: OUT_NEXT,
    paletteHidden: true,
    singletonPerEntity: true,
    primaryFor: ["auto_attendant"],
    defaultData: () => ({
      name: "ROOT",
      active_period: "always",
      no_input: { timeout_s: 9 },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      actions: {},
    }),
  },
  menu_custom: {
    kind: "menu_custom",
    category: "menu",
    label: "Custom Menu",
    color: C.menu,
    description: "User-defined sub-menu with optional time-gated activation.",
    inputs: IN,
    outputs: OUT_NEXT,
    primaryFor: ["auto_attendant"],
    defaultData: () => ({
      name: "Menu",
      active_period: "always",
      no_input: { timeout_s: 9 },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      actions: {},
    }),
  },
  action_transfer: {
    kind: "action_transfer",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Transfer",
    color: C.action,
    description:
      "Transfer the call. Choose between routing to an internal target (extension, hunt group, SIP URI) or placing an outbound call to an E.164 number.",
    inputs: IN,
    outputs: NO_PORTS,
    defaultData: () => ({ mode: "extension", extension: "100" }),
  },
  action_prompt_extension: {
    kind: "action_prompt_extension",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Prompt for Extension",
    color: C.action,
    description: "Collect full extension digits from caller.",
    inputs: IN,
    outputs: OUT_NEXT,
    defaultData: () => ({ timeout_s: 5 }),
  },
  action_dial_direct: {
    kind: "action_dial_direct",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Dial Extension Directly",
    color: C.action,
    description: "Matched digit is the first digit of an extension; collect the rest.",
    inputs: IN,
    outputs: OUT_NEXT,
    defaultData: () => ({}),
  },
  action_voicemail: {
    kind: "action_voicemail",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Transfer to Voicemail",
    color: C.action,
    description: "Hand caller to a Voicemail or Fax Mailbox node.",
    inputs: IN,
    outputs: OUT_NEXT,
    defaultData: () => ({}),
  },
  action_dial_by_name: {
    kind: "action_dial_by_name",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Dial-by-Name",
    color: C.action,
    description: "Match caller DTMF against the first 3 letters of published extension names.",
    inputs: IN,
    outputs: OUT_NEXT,
    defaultData: () => ({}),
  },
  action_disconnect: {
    kind: "action_disconnect",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Disconnect",
    color: C.action,
    description: "Optionally play a prompt, then hang up.",
    inputs: IN,
    outputs: NO_PORTS,
    defaultData: () => ({}),
  },
  action_disa: {
    kind: "action_disa",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "DISA",
    color: C.action,
    description: "Prompt for password; on success allow outgoing dial.",
    inputs: IN,
    outputs: OUT_NEXT,
    defaultData: () => ({}),
  },
  action_queue: {
    kind: "action_queue",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Call Queue",
    color: C.action,
    description: "Hand call to a named Call Queue (referenced; not modeled as flow in MVP).",
    inputs: IN,
    outputs: OUT_NEXT,
    defaultData: () => ({}),
  },
  action_nop: {
    kind: "action_nop",
    category: "action",
    primaryFor: ["auto_attendant"],
    label: "Do Nothing",
    color: C.action,
    description:
      "Intentionally-inert action. The caller's input is consumed, an optional " +
      "prompt is played, and control returns to the parent menu — useful when " +
      "you want a key to be a no-op without leaving it unassigned.",
    inputs: IN,
    outputs: NO_PORTS,
    defaultData: () => ({}),
  },
  answering_mode_ext: {
    kind: "answering_mode_ext",
    category: "answering",
    primaryFor: ["extension"],
    label: "Answering Mode (Extension)",
    shortLabel: "Answering Mode",
    color: C.answering,
    description: "Default answering mode for an extension.",
    inputs: IN,
    outputs: [
      { id: "ring", label: "ring" },
      { id: "forward", label: "forward" },
      { id: "voicemail", label: "voicemail" },
      { id: "answered", label: "answered" },
      { id: "unanswered", label: "unanswered" },
      { id: "rejected", label: "rejected" },
    ],
    defaultData: () => ({
      mode: "ring_only",
      ring_timeout_s: 20,
      reject_sip_code: 486,
    }),
  },
  answering_mode_aa: {
    kind: "answering_mode_aa",
    category: "answering",
    primaryFor: ["auto_attendant"],
    label: "Answering Mode (Auto Attendant)",
    shortLabel: "Answering Mode",
    color: C.answering,
    description: "Default answering mode for an auto attendant DID.",
    inputs: IN,
    outputs: [
      { id: "ring", label: "ring" },
      { id: "forward", label: "forward" },
      { id: "ivr", label: "ivr" },
      { id: "answered", label: "answered" },
      { id: "unanswered", label: "unanswered" },
      { id: "rejected", label: "rejected" },
    ],
    defaultData: () => ({
      mode: "ivr_only",
      ring_timeout_s: 20,
      reject_sip_code: 486,
    }),
  },
  forward_follow_me: {
    kind: "forward_follow_me",
    category: "forwarding",
    primaryFor: ["extension"],
    label: "Follow-me",
    color: C.forwarding,
    description: "Ordered list of forwarding targets with per-rule time check and timeout.",
    inputs: IN,
    outputs: OUT_ANSWERED_UNANSWERED,
    defaultData: () => ({ ring_mode: "sequential", rules: [], replace_caller_id_name: false }),
  },
  forward_advanced: {
    kind: "forward_advanced",
    category: "forwarding",
    primaryFor: ["extension"],
    label: "Advanced Forwarding",
    color: C.forwarding,
    description: "Follow-me + per-rule SIP proxy + sequential/simultaneous/random/percentage.",
    inputs: IN,
    outputs: OUT_ANSWERED_UNANSWERED,
    defaultData: () => ({
      ring_mode: "sequential",
      rules: [],
      keep_original_cld: false,
      replace_caller_id_name: false,
    }),
  },
  forward_sip_uri: {
    kind: "forward_sip_uri",
    category: "forwarding",
    primaryFor: ["extension"],
    label: "Forward to SIP URI",
    color: C.forwarding,
    description: "Single SIP URI target with optional proxy.",
    inputs: IN,
    outputs: OUT_ANSWERED_UNANSWERED,
    defaultData: () => ({ timeout_s: 20 }),
  },
  forward_simple: {
    kind: "forward_simple",
    category: "forwarding",
    primaryFor: ["extension"],
    label: "Simple Forwarding",
    color: C.forwarding,
    description: "Forward to a single E.164 or internal extension.",
    inputs: IN,
    outputs: OUT_ANSWERED_UNANSWERED,
    defaultData: () => ({ timeout_s: 20 }),
  },
  screening_rule: {
    kind: "screening_rule",
    category: "screening",
    primaryFor: ["extension"],
    label: "Screening Rule",
    color: C.screening,
    description: "Conditional rule evaluated in order; first match wins.",
    inputs: IN,
    outputs: [
      { id: "matched", label: "matched" },
      { id: "next_rule", label: "next rule" },
    ],
    defaultData: () => ({
      name: "Rule",
      order: 0,
      enabled: true,
      conditions: {
        time_period: "always",
        caller: { kind: "any" },
        callee: { kind: "any" },
      },
      action_mode: "voicemail_only",
    }),
  },
  voicemail: {
    kind: "voicemail",
    category: "messaging",
    label: "Voicemail",
    color: C.messaging,
    description: "Voicemail mailbox with greeting, PIN, and email delivery options.",
    inputs: IN,
    outputs: [{ id: "done", label: "left" }],
    defaultData: () => ({
      greeting: "standard",
      require_pin: true,
      auto_play: false,
      announce_datetime: true,
      email_option: "none",
    }),
  },
  fax_mailbox: {
    kind: "fax_mailbox",
    category: "messaging",
    label: "Fax Mailbox",
    color: C.messaging,
    description: "Stores faxes; email delivery option.",
    inputs: IN,
    outputs: [{ id: "done", label: "stored" }],
    defaultData: () => ({ email_option: "forward_as_attachment" }),
  },
  call_recording: {
    kind: "call_recording",
    category: "recording",
    label: "Call Recording",
    color: C.recording,
    description:
      "Records the answered leg. Automatic mode records every call; on-demand " +
      "lets the caller start/stop with DTMF (default *44/*45). Optional " +
      "started/stopped announcements, wav/mp3 format, email delivery, " +
      "owner-only privacy, and AI transcription via Whisper.",
    inputs: IN,
    outputs: [{ id: "done", label: "next" }],
    defaultData: () => ({}),
  },
  cond_time: {
    kind: "cond_time",
    category: "condition",
    label: "Time Check",
    color: C.condition,
    description: "Branch based on a named time period (e.g., business hours).",
    inputs: IN,
    outputs: OUT_TF,
    defaultData: () => ({ period: "always" }),
  },
  cond_caller: {
    kind: "cond_caller",
    category: "condition",
    label: "Caller Check",
    color: C.condition,
    description: "Branch on caller number/prefix/regex/anonymous/caller-list.",
    inputs: IN,
    outputs: OUT_TF,
    defaultData: () => ({ kind: "number" }),
  },
  cond_callee: {
    kind: "cond_callee",
    category: "condition",
    label: "Callee Check",
    color: C.condition,
    description: "Branch on which DID or alias was dialed.",
    inputs: IN,
    outputs: OUT_TF,
    defaultData: () => ({ kind: "did" }),
  },
  cond_mode: {
    kind: "cond_mode",
    category: "condition",
    label: "Mode Check",
    color: C.condition,
    description: "Branch on currently active incoming-call mode.",
    inputs: IN,
    outputs: OUT_TF,
    defaultData: () => ({ mode: "business_hours" }),
  },
  target_extension: {
    kind: "target_extension",
    category: "target",
    label: "Extension",
    color: C.target,
    description: "Internal extension target.",
    inputs: IN,
    outputs: NO_PORTS,
    paletteHidden: true,
    defaultData: () => ({ extension: "100" }),
  },
  target_hunt_group_ref: {
    kind: "target_hunt_group_ref",
    category: "target",
    label: "Hunt Group",
    color: C.target,
    description: "Reference to a Hunt Group entity (full editor deferred).",
    inputs: IN,
    outputs: NO_PORTS,
    paletteHidden: true,
    defaultData: () => ({ hunt_group_id: "hg_1" }),
  },
  target_external: {
    kind: "target_external",
    category: "target",
    label: "External Number",
    color: C.target,
    description: "External E.164 number target.",
    inputs: IN,
    outputs: NO_PORTS,
    paletteHidden: true,
    defaultData: () => ({ number: "+10000000000" }),
  },
  target_sip_uri: {
    kind: "target_sip_uri",
    category: "target",
    label: "SIP URI",
    color: C.target,
    description: "Direct SIP endpoint target.",
    inputs: IN,
    outputs: NO_PORTS,
    paletteHidden: true,
    defaultData: () => ({ uri: "sip:user@example.com" }),
  },
  term_answered: termDef("term_answered", "Answered"),
  term_voicemail_left: termDef("term_voicemail_left", "Voicemail Left"),
  term_forwarded_answered: termDef("term_forwarded_answered", "Forwarded — Answered"),
  term_forwarded_unanswered: termDef("term_forwarded_unanswered", "Forwarded — Unanswered"),
  term_rejected: termDef("term_rejected", "Rejected"),
  term_dropped: termDef("term_dropped", "Dropped"),
};

type TerminalKind =
  | "term_answered"
  | "term_voicemail_left"
  | "term_forwarded_answered"
  | "term_forwarded_unanswered"
  | "term_rejected"
  | "term_dropped";

function termDef<K extends TerminalKind>(kind: K, label: string): NodeTypeDef<K> {
  return {
    kind,
    category: "terminal",
    label,
    color: C.terminal,
    description: "Terminal outcome of a call flow.",
    inputs: IN,
    outputs: NO_PORTS,
    defaultData: (() => ({})) as NodeTypeDef<K>["defaultData"],
  };
}

export const NODE_TYPE_LIST: NodeTypeDef[] = Object.values(NODE_TYPES) as NodeTypeDef[];

export const CATEGORY_ORDER: NodeCategory[] = [
  "entry",
  "menu",
  "action",
  "answering",
  "forwarding",
  "screening",
  "condition",
  "messaging",
  "recording",
  "target",
  "terminal",
];

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  entry: "Entry Points",
  menu: "Menus",
  action: "Menu Actions",
  answering: "Answering Modes",
  forwarding: "Forwarding",
  screening: "Screening",
  condition: "Conditions",
  messaging: "Messaging",
  recording: "Recording",
  target: "Targets",
  terminal: "Terminals",
};

export function getNodeType<K extends NodeKind>(kind: K): NodeTypeDef<K> {
  return NODE_TYPES[kind];
}
