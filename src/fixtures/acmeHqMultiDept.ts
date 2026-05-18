import type { Flow, FlowNode } from "@/schema";
import { inferEdges } from "./inferEdges";
import { splitFanIn } from "./splitFanIn";

/**
 * Acme Corp HQ — multi-department Auto Attendant.
 *
 * DID:               +1-800-555-7890
 * Departments:       Sales · Support · Engineering · Billing · HR
 * Special branches:  Operator · Dial-by-Name · Holiday announcement · Fax · After-hours voicemail
 *
 * Active periods used (set them in the simulator via `active_periods`):
 *   business_hours  — normal weekday hours; department sub-menus active.
 *   holidays        — closed for the holiday; key 0 plays the holiday announcement.
 *   weekend         — purely cosmetic in this demo, behaves like after-hours.
 *
 * Behaviour summary
 *   ROOT is always active. Press:
 *     1 → Sales (sub-menu, business_hours; otherwise → after-hours voicemail)
 *     2 → Support (sub-menu, business_hours; otherwise → emergency external line)
 *     3 → Engineering (sub-menu, business_hours; otherwise → after-hours voicemail)
 *     4 → Billing (sub-menu, business_hours; otherwise → after-hours voicemail)
 *     5 → HR (sub-menu, business_hours; otherwise → after-hours voicemail)
 *     6 → Operator (ext 100)
 *     7 → Dial-by-Name directory
 *     0 → Holiday announcement (menu_custom gated to "holidays"; otherwise → after-hours voicemail)
 *     9 → Disconnect with goodbye prompt
 *   fax  → shared fax mailbox
 *   no_input → Operator
 *
 * Sales transfers go through a Call Recording node (compliance).
 */

// ---- helpers to keep the literal compact ---------------------------------

const VM_GREETING_AFTER = "p_after_hours_greeting";
const VM_GREETING_HOLIDAY = "p_holiday_greeting";

const def = <T>(d: T) => d;

// ---- nodes ----------------------------------------------------------------

const nodes: FlowNode[] = [
  // ===== ROOT =====
  {
    id: "root",
    type: "menu_root",
    position: { x: 0, y: 600 },
    data: def({
      name: "ROOT" as const,
      active_period: "always" as const,
      intro_prompt: "p_acme_welcome",
      menu_prompt: "p_acme_main_menu",
      no_input: { timeout_s: 9, action_node_id: "tr_operator" },
      allow_direct_dial: true,
      interdigit_timeout_s: 5,
      actions: {
        "1": { target_node_id: "m_sales" },
        "2": { target_node_id: "m_support" },
        "3": { target_node_id: "m_eng" },
        "4": { target_node_id: "m_billing" },
        "5": { target_node_id: "m_hr" },
        "6": { target_node_id: "tr_operator", play_before_action: "p_connecting_operator" },
        "7": { target_node_id: "a_dbn" },
        "0": { target_node_id: "m_holiday" },
        "9": { target_node_id: "a_disc_goodbye", play_before_action: "p_goodbye" },
        fax: { target_node_id: "fax_main" },
        no_input: { target_node_id: "tr_operator" },
      },
    }),
  },

  // ===== Department menus (active during business_hours) =====
  {
    id: "m_sales",
    type: "menu_custom",
    position: { x: 320, y: 0 },
    data: def({
      name: "Sales",
      active_period: "business_hours",
      intro_prompt: "p_sales_intro",
      menu_prompt: "p_sales_menu",
      no_input: { timeout_s: 9, action_node_id: "tr_sales_default" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      inactive_action_node_id: "vm_after_hours",
      actions: {
        "1": { target_node_id: "tr_sales_new", play_before_action: "p_connecting_sales" },
        "2": { target_node_id: "tr_sales_existing", play_before_action: "p_connecting_sales" },
        "3": { target_node_id: "tr_sales_enterprise", play_before_action: "p_connecting_sales" },
        "0": { target_node_id: "a_goto_root" },
        no_input: { target_node_id: "tr_sales_default" },
      },
    }),
  },
  {
    id: "m_support",
    type: "menu_custom",
    position: { x: 320, y: 200 },
    data: def({
      name: "Support",
      active_period: "business_hours",
      intro_prompt: "p_support_intro",
      menu_prompt: "p_support_menu",
      no_input: { timeout_s: 9, action_node_id: "tr_sup_tier1" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      inactive_action_node_id: "tr_emergency", // urgent issues forward to external line after hours
      actions: {
        "1": { target_node_id: "tr_sup_tier1" },
        "2": { target_node_id: "tr_sup_tier2" },
        "3": { target_node_id: "tr_sup_accounts" },
        "9": { target_node_id: "tr_emergency", play_before_action: "p_connecting_emergency" },
        "0": { target_node_id: "a_goto_root" },
      },
    }),
  },
  {
    id: "m_eng",
    type: "menu_custom",
    position: { x: 320, y: 400 },
    data: def({
      name: "Engineering",
      active_period: "business_hours",
      menu_prompt: "p_eng_menu",
      no_input: { timeout_s: 9, action_node_id: "vm_after_hours" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      inactive_action_node_id: "vm_after_hours",
      actions: {
        "1": { target_node_id: "tr_eng_platform" },
        "2": { target_node_id: "tr_eng_mobile" },
        "3": { target_node_id: "tr_eng_sre" },
        "0": { target_node_id: "a_goto_root" },
      },
    }),
  },
  {
    id: "m_billing",
    type: "menu_custom",
    position: { x: 320, y: 600 },
    data: def({
      name: "Billing",
      active_period: "business_hours",
      menu_prompt: "p_billing_menu",
      no_input: { timeout_s: 9, action_node_id: "vm_after_hours" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      inactive_action_node_id: "vm_after_hours",
      actions: {
        "1": { target_node_id: "tr_bill_invoices" },
        "2": { target_node_id: "tr_bill_payments" },
        "3": { target_node_id: "tr_bill_disputes" },
        "0": { target_node_id: "a_goto_root" },
      },
    }),
  },
  {
    id: "m_hr",
    type: "menu_custom",
    position: { x: 320, y: 800 },
    data: def({
      name: "HR",
      active_period: "business_hours",
      menu_prompt: "p_hr_menu",
      no_input: { timeout_s: 9, action_node_id: "vm_after_hours" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      inactive_action_node_id: "vm_after_hours",
      actions: {
        "1": { target_node_id: "tr_hr_benefits" },
        "2": { target_node_id: "tr_hr_recruiting" },
        "3": { target_node_id: "tr_hr_payroll" },
        "0": { target_node_id: "a_goto_root" },
      },
    }),
  },

  // Holiday menu — active only when "holidays" is in active_periods.
  {
    id: "m_holiday",
    type: "menu_custom",
    position: { x: 320, y: 1000 },
    data: def({
      name: "Holiday announcement",
      active_period: "holidays",
      intro_prompt: "p_holiday_announcement",
      menu_prompt: "p_holiday_options",
      no_input: { timeout_s: 5, action_node_id: "a_disc_holiday" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      // When holidays are NOT active, fall through to normal after-hours voicemail.
      inactive_action_node_id: "vm_after_hours",
      actions: {
        "1": { target_node_id: "vm_holiday" },
        no_input: { target_node_id: "a_disc_holiday" },
      },
    }),
  },

  // ===== Action: go back to ROOT (shared by all sub-menus on key 0) =====
  {
    id: "a_goto_root",
    type: "action_goto_menu",
    position: { x: 640, y: 700 },
    data: { target_menu_node_id: "root" },
  },

  // ===== Dial-by-name =====
  {
    id: "a_dbn",
    type: "action_dial_by_name",
    position: { x: 640, y: 900 },
    data: { prompt: "p_dial_by_name" },
  },

  // ===== Transfer wrappers (some carry play-before prompts) =====
  // Sales — note these transfers are intended to be recorded for compliance.
  { id: "tr_sales_new", type: "action_transfer", position: { x: 640, y: 0 }, data: { mode: "extension", target_node_id: "ext_201" } },
  { id: "tr_sales_existing", type: "action_transfer", position: { x: 640, y: 60 }, data: { mode: "extension", target_node_id: "ext_202" } },
  { id: "tr_sales_enterprise", type: "action_transfer", position: { x: 640, y: 120 }, data: { mode: "extension", target_node_id: "ext_203" } },
  { id: "tr_sales_default", type: "action_transfer", position: { x: 640, y: 180 }, data: { mode: "extension", target_node_id: "ext_201" } },

  // Support — hunt groups for tiers, single ext for accounts, external for emergency.
  { id: "tr_sup_tier1", type: "action_transfer", position: { x: 640, y: 240 }, data: { mode: "extension", target_node_id: "hg_tier1" } },
  { id: "tr_sup_tier2", type: "action_transfer", position: { x: 640, y: 300 }, data: { mode: "extension", target_node_id: "hg_tier2" } },
  { id: "tr_sup_accounts", type: "action_transfer", position: { x: 640, y: 360 }, data: { mode: "extension", target_node_id: "ext_301" } },
  { id: "tr_emergency", type: "action_transfer", position: { x: 640, y: 420 }, data: { mode: "extension", target_node_id: "ext_emergency_line" } },

  // Engineering
  { id: "tr_eng_platform", type: "action_transfer", position: { x: 640, y: 480 }, data: { mode: "extension", target_node_id: "ext_401" } },
  { id: "tr_eng_mobile", type: "action_transfer", position: { x: 640, y: 540 }, data: { mode: "extension", target_node_id: "ext_402" } },
  { id: "tr_eng_sre", type: "action_transfer", position: { x: 640, y: 600 }, data: { mode: "extension", target_node_id: "ext_403" } },

  // Billing
  { id: "tr_bill_invoices", type: "action_transfer", position: { x: 640, y: 660 }, data: { mode: "extension", target_node_id: "ext_501" } },
  { id: "tr_bill_payments", type: "action_transfer", position: { x: 640, y: 720 }, data: { mode: "extension", target_node_id: "ext_502" } },
  { id: "tr_bill_disputes", type: "action_transfer", position: { x: 640, y: 780 }, data: { mode: "extension", target_node_id: "ext_503" } },

  // HR
  { id: "tr_hr_benefits", type: "action_transfer", position: { x: 640, y: 840 }, data: { mode: "extension", target_node_id: "ext_601" } },
  { id: "tr_hr_recruiting", type: "action_transfer", position: { x: 640, y: 900 }, data: { mode: "extension", target_node_id: "ext_602" } },
  { id: "tr_hr_payroll", type: "action_transfer", position: { x: 640, y: 960 }, data: { mode: "extension", target_node_id: "ext_603" } },

  // Operator
  { id: "tr_operator", type: "action_transfer", position: { x: 640, y: 1020 }, data: { mode: "extension", target_node_id: "ext_100" } },

  // Disconnect actions
  {
    id: "a_disc_goodbye",
    type: "action_disconnect",
    position: { x: 640, y: 1080 },
    data: { play_before_action: "p_goodbye" },
  },
  {
    id: "a_disc_holiday",
    type: "action_disconnect",
    position: { x: 640, y: 1140 },
    data: { play_before_action: "p_holiday_closing" },
  },

  // ===== Target nodes (extensions + hunt groups + external) =====
  { id: "ext_100", type: "target_extension", position: { x: 960, y: 1020 }, data: { extension: "100" } },
  { id: "ext_201", type: "target_extension", position: { x: 960, y: 0 }, data: { extension: "201" } },
  { id: "ext_202", type: "target_extension", position: { x: 960, y: 60 }, data: { extension: "202" } },
  { id: "ext_203", type: "target_extension", position: { x: 960, y: 120 }, data: { extension: "203" } },
  { id: "ext_301", type: "target_extension", position: { x: 960, y: 360 }, data: { extension: "301" } },
  { id: "ext_401", type: "target_extension", position: { x: 960, y: 480 }, data: { extension: "401" } },
  { id: "ext_402", type: "target_extension", position: { x: 960, y: 540 }, data: { extension: "402" } },
  { id: "ext_403", type: "target_extension", position: { x: 960, y: 600 }, data: { extension: "403" } },
  { id: "ext_501", type: "target_extension", position: { x: 960, y: 660 }, data: { extension: "501" } },
  { id: "ext_502", type: "target_extension", position: { x: 960, y: 720 }, data: { extension: "502" } },
  { id: "ext_503", type: "target_extension", position: { x: 960, y: 780 }, data: { extension: "503" } },
  { id: "ext_601", type: "target_extension", position: { x: 960, y: 840 }, data: { extension: "601" } },
  { id: "ext_602", type: "target_extension", position: { x: 960, y: 900 }, data: { extension: "602" } },
  { id: "ext_603", type: "target_extension", position: { x: 960, y: 960 }, data: { extension: "603" } },

  { id: "hg_tier1", type: "target_hunt_group_ref", position: { x: 960, y: 240 }, data: { hunt_group_id: "hg_support_tier1", label: "Support Tier 1" } },
  { id: "hg_tier2", type: "target_hunt_group_ref", position: { x: 960, y: 300 }, data: { hunt_group_id: "hg_support_tier2", label: "Support Tier 2" } },

  { id: "ext_emergency_line", type: "target_external", position: { x: 960, y: 420 }, data: { number: "+18005551111" } },

  // ===== Voicemail / fax =====
  {
    id: "vm_after_hours",
    type: "voicemail",
    position: { x: 960, y: 1080 },
    data: {
      greeting: "extended_absence",
      require_pin: true,
      auto_play: false,
      announce_datetime: true,
      email_option: "forward_as_attachment",
      email_address: "voicemail@acme.example",
    },
  },
  {
    id: "vm_holiday",
    type: "voicemail",
    position: { x: 960, y: 1140 },
    data: {
      greeting: "extended_absence",
      require_pin: true,
      auto_play: false,
      announce_datetime: true,
      email_option: "forward_as_attachment",
      email_address: "voicemail@acme.example",
    },
  },
  {
    id: "fax_main",
    type: "fax_mailbox",
    position: { x: 960, y: 1200 },
    data: {
      email_option: "forward_as_attachment",
      email_address: "fax@acme.example",
    },
  },

  // ===== Compliance recording (applies whenever a leg answers) =====
  {
    id: "rec_compliance",
    type: "call_recording",
    position: { x: 0, y: 1200 },
    data: {
      announce: true,
      announce_prompt: "p_recording_notice",
      send_to_email: "compliance@acme.example",
    },
  },
];

// keep VM_GREETING_AFTER / VM_GREETING_HOLIDAY referenced for future per-voicemail greeting wiring
void VM_GREETING_AFTER;
void VM_GREETING_HOLIDAY;

// ---- flow + scenarios -----------------------------------------------------

export const acmeHqMultiDept: Flow = {
  schema_version: "1.0",
  entity: {
    type: "auto_attendant",
    id: "aa_acme_hq",
    did: "+18005557890",
    name: "Acme Corp HQ",
    time_periods: {
      business_hours: [
        { time_from: "08:00", time_to: "18:00", days_of_week: [1, 2, 3, 4, 5] },
      ],
      after_hours: [
        // Evenings on weekdays
        { time_from: "18:00", time_to: "23:59", days_of_week: [1, 2, 3, 4, 5] },
        { time_from: "00:00", time_to: "08:00", days_of_week: [1, 2, 3, 4, 5] },
        // Whole weekend
        { days_of_week: [6, 7] },
      ],
      weekend: [{ days_of_week: [6, 7] }],
      // US-style holidays: New Year's Day, Independence Day, Christmas Day.
      holidays: [
        { months: [1], days_of_month: [1] },
        { months: [7], days_of_month: [4] },
        { months: [12], days_of_month: [25] },
      ],
    },
    directory: [
      { extension: "100", name: "Operator", published: true },
      { extension: "201", name: "Alice Sales", published: true },
      { extension: "202", name: "Bob Sales", published: true },
      { extension: "203", name: "Carol Sales", published: true },
      { extension: "301", name: "David Support", published: true },
      { extension: "401", name: "Erin Engineering", published: true },
      { extension: "402", name: "Frank Engineering", published: true },
      { extension: "403", name: "Grace SRE", published: false },
      { extension: "501", name: "Hank Billing", published: true },
      { extension: "502", name: "Ivy Billing", published: true },
      { extension: "503", name: "Jane Disputes", published: true },
      { extension: "601", name: "Karen HR Benefits", published: true },
      { extension: "602", name: "Liam HR Recruiting", published: true },
      { extension: "603", name: "Mona HR Payroll", published: false },
    ],
  },
  // splitFanIn duplicates voicemail/disconnect terminals when too many menus
  // point at them, so the rendered graph reads cleanly instead of every
  // department dumping into one node.
  ...splitFanIn(nodes, inferEdges(nodes)),
  scenarios: [
    {
      name: "Business hours · press 1 1 → Alice (Sales new customer)",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["1", "1"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Business hours · press 2 1 → Tier 1 hunt group",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["2", "1"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "After hours · press 1 → Sales inactive → voicemail",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T22:00:00-07:00",
      press_sequence: ["1"],
      answering_behavior: [],
      expected_terminal: "voicemail_left",
    },
    {
      name: "After hours · press 2 9 → Support emergency external line",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T22:00:00-07:00",
      press_sequence: ["2"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Holiday · press 0 → holiday announcement + disconnect",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-12-25T11:00:00-08:00",
      active_mode: "holidays",
      press_sequence: ["0"],
      answering_behavior: [],
      expected_terminal: "disconnected",
    },
    {
      name: "Business hours · no input → operator",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: [],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Dial-by-name 'BOB' (2-6-2) → Bob Sales (202)",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["7", "2", "6", "2"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Fax tone at ROOT → fax mailbox",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["fax"],
      answering_behavior: [],
      expected_terminal: "voicemail_left",
    },
    {
      name: "Direct-dial 401 from ROOT (allow_direct_dial)",
      caller: "+14155550101",
      callee: "18005557890",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["4", "0", "1"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
  ],
};
