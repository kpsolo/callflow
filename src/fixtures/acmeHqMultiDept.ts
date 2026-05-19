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

// Layout — five columns left-to-right:
//   COL_ROOT      ROOT menu (one tall card)
//   COL_MENU      department / holiday menus + dial-by-name
//   COL_TRANSFER  per-action transfer wrappers and shared disconnects
//   COL_TARGET    extension / hunt group / external-number target cards
//   COL_SINK      voicemail · fax · compliance recording
// Vertical spacing is sized for v2 inline-editor cards (the tallest of which
// is the ROOT menu at ~520 px — header + 3 inline rows + 11 action pills).
const COL_ROOT = 0;
const COL_MENU = 480;
const COL_TRANSFER = 960;
const COL_SINK = 1920;

// ---- nodes ----------------------------------------------------------------

const nodes: FlowNode[] = [
  // ===== ROOT =====
  {
    id: "root",
    type: "menu_root",
    position: { x: COL_ROOT, y: 1120 },
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
    position: { x: COL_MENU, y: 0 },
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
        "0": { target_node_id: "root" },
        no_input: { target_node_id: "tr_sales_default" },
      },
    }),
  },
  {
    id: "m_support",
    type: "menu_custom",
    position: { x: COL_MENU, y: 440 },
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
        "0": { target_node_id: "root" },
      },
    }),
  },
  {
    id: "m_eng",
    type: "menu_custom",
    position: { x: COL_MENU, y: 920 },
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
        "0": { target_node_id: "root" },
      },
    }),
  },
  {
    id: "m_billing",
    type: "menu_custom",
    position: { x: COL_MENU, y: 1360 },
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
        "0": { target_node_id: "root" },
      },
    }),
  },
  {
    id: "m_hr",
    type: "menu_custom",
    position: { x: COL_MENU, y: 1800 },
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
        "0": { target_node_id: "root" },
      },
    }),
  },

  // Holiday menu — active only when "holidays" is in active_periods.
  {
    id: "m_holiday",
    type: "menu_custom",
    position: { x: COL_MENU, y: 2240 },
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

  // ===== Dial-by-name =====
  {
    id: "a_dbn",
    type: "action_dial_by_name",
    position: { x: COL_MENU, y: 2560 },
    data: { prompt: "p_dial_by_name" },
  },

  // Top-level disconnect (key 9 → goodbye).
  {
    id: "a_disc_goodbye",
    type: "action_disconnect",
    position: { x: COL_MENU, y: 2760 },
    data: { play_before_action: "p_goodbye" },
  },

  // ===== Transfer wrappers (some carry play-before prompts) =====
  // Step 220 px in COL_TRANSFER — each action_transfer in v2 renders at ~180 px
  // (header + 3-field inline editor + 1 output port pill), so 220 px leaves a
  // ~40 px gap between cards.
  // Sales — note these transfers are intended to be recorded for compliance.
  { id: "tr_sales_new", type: "action_transfer", position: { x: COL_TRANSFER, y: 0 }, data: { mode: "extension", extension: "201" } },
  { id: "tr_sales_existing", type: "action_transfer", position: { x: COL_TRANSFER, y: 220 }, data: { mode: "extension", extension: "202" } },
  { id: "tr_sales_enterprise", type: "action_transfer", position: { x: COL_TRANSFER, y: 440 }, data: { mode: "extension", extension: "203" } },
  { id: "tr_sales_default", type: "action_transfer", position: { x: COL_TRANSFER, y: 660 }, data: { mode: "extension", extension: "201" } },

  // Support — hunt groups for tiers, single ext for accounts, external for emergency.
  { id: "tr_sup_tier1", type: "action_transfer", position: { x: COL_TRANSFER, y: 880 }, data: { mode: "hunt_group", hunt_group_id: "hg_support_tier1", label: "Support Tier 1" } },
  { id: "tr_sup_tier2", type: "action_transfer", position: { x: COL_TRANSFER, y: 1100 }, data: { mode: "hunt_group", hunt_group_id: "hg_support_tier2", label: "Support Tier 2" } },
  { id: "tr_sup_accounts", type: "action_transfer", position: { x: COL_TRANSFER, y: 1320 }, data: { mode: "extension", extension: "301" } },
  { id: "tr_emergency", type: "action_transfer", position: { x: COL_TRANSFER, y: 1540 }, data: { mode: "e164", number: "+18005551111" } },

  // Engineering
  { id: "tr_eng_platform", type: "action_transfer", position: { x: COL_TRANSFER, y: 1760 }, data: { mode: "extension", extension: "401" } },
  { id: "tr_eng_mobile", type: "action_transfer", position: { x: COL_TRANSFER, y: 1980 }, data: { mode: "extension", extension: "402" } },
  { id: "tr_eng_sre", type: "action_transfer", position: { x: COL_TRANSFER, y: 2200 }, data: { mode: "extension", extension: "403" } },

  // Billing
  { id: "tr_bill_invoices", type: "action_transfer", position: { x: COL_TRANSFER, y: 2420 }, data: { mode: "extension", extension: "501" } },
  { id: "tr_bill_payments", type: "action_transfer", position: { x: COL_TRANSFER, y: 2640 }, data: { mode: "extension", extension: "502" } },
  { id: "tr_bill_disputes", type: "action_transfer", position: { x: COL_TRANSFER, y: 2860 }, data: { mode: "extension", extension: "503" } },

  // HR
  { id: "tr_hr_benefits", type: "action_transfer", position: { x: COL_TRANSFER, y: 3080 }, data: { mode: "extension", extension: "601" } },
  { id: "tr_hr_recruiting", type: "action_transfer", position: { x: COL_TRANSFER, y: 3300 }, data: { mode: "extension", extension: "602" } },
  { id: "tr_hr_payroll", type: "action_transfer", position: { x: COL_TRANSFER, y: 3520 }, data: { mode: "extension", extension: "603" } },

  // Operator + holiday disconnect
  { id: "tr_operator", type: "action_transfer", position: { x: COL_TRANSFER, y: 3740 }, data: { mode: "extension", extension: "100" } },
  {
    id: "a_disc_holiday",
    type: "action_disconnect",
    position: { x: COL_TRANSFER, y: 3960 },
    data: { play_before_action: "p_holiday_closing" },
  },

  // ===== Voicemail / fax / compliance =====
  {
    id: "vm_after_hours",
    type: "voicemail",
    position: { x: COL_SINK, y: 100 },
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
    position: { x: COL_SINK, y: 460 },
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
    position: { x: COL_SINK, y: 820 },
    data: {
      email_option: "forward_as_attachment",
      email_address: "fax@acme.example",
    },
  },
  {
    id: "rec_compliance",
    type: "call_recording",
    position: { x: COL_SINK, y: 1000 },
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
      expected_terminal: "forwarded_answered",
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
