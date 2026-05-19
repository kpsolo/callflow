import type { Flow, FlowNode } from "@/schema";
import { inferEdges } from "./inferEdges";
import { splitFanIn } from "./splitFanIn";

/**
 * Riverside Medical Clinic — real-world Auto Attendant.
 *
 * DID:               +1-800-555-2273 (CARE)
 *
 * Patient experience the AA delivers:
 *   ┌── intro plays a brief "if this is a medical emergency, hang up and dial 911"
 *   │   safety disclaimer before the menu.
 *   │
 *   1 → Appointments  ── 1 New patient appointment
 *                       2 Reschedule
 *                       3 Cancel
 *                       0 Back to main menu
 *                       (after hours → appointment-line voicemail)
 *   2 → Prescription refill — straight transfer to the pharmacy line (ext 400)
 *   3 → Billing       ── 1 Statement / invoice questions
 *                       2 Make a payment
 *                       0 Back to main menu
 *                       (after hours → billing voicemail)
 *   4 → Speak with a nurse (urgent triage) — hunt group, always active
 *   8 → Receptionist (key 0 alias)
 *   9 → Hang up after playing "for emergencies, call 911" reminder
 *   0 → Receptionist
 *   fax → secure fax mailbox (records, referrals)
 *   no_input → Receptionist
 *
 * Notable wiring:
 *   • Sub-menus carry `inactive_action_node_id` so after-hours callers fall to
 *     a department-specific voicemail (not a generic mailbox).
 *   • The nurse-triage and pharmacy lines stay reachable 24/7 — they're
 *     mapped through hunt groups that have their own on-call rotation
 *     outside of this AA.
 *   • An optional Call Recording node is wired off-graph for compliance,
 *     surfaced so a clinic admin can toggle the announcement prompt.
 */

const def = <T>(d: T) => d;

// Layout — five columns. Wider than the Acme HQ flow because the clinic has
// fewer departments but each sub-menu is slightly taller (intro + menu prompt
// + several actions).
const COL_ROOT = 0;
const COL_MENU = 480;
const COL_TRANSFER = 960;
const COL_TARGET = 1440;
const COL_SINK = 1920;

const nodes: FlowNode[] = [
  // ===== ROOT =====
  {
    id: "root",
    type: "menu_root",
    position: { x: COL_ROOT, y: 570 },
    data: def({
      name: "ROOT" as const,
      active_period: "always" as const,
      intro_prompt: "p_clinic_welcome_and_911_disclaimer",
      menu_prompt: "p_clinic_main_menu",
      no_input: { timeout_s: 9, action_node_id: "tr_receptionist" },
      allow_direct_dial: true,
      interdigit_timeout_s: 5,
      actions: {
        "1": { target_node_id: "m_appointments" },
        "2": { target_node_id: "tr_pharmacy", play_before_action: "p_connecting_pharmacy" },
        "3": { target_node_id: "m_billing" },
        "4": { target_node_id: "tr_nurse_triage", play_before_action: "p_connecting_nurse" },
        "0": { target_node_id: "tr_receptionist" },
        "9": { target_node_id: "a_disc_emergency_reminder", play_before_action: "p_call_911_reminder" },
        fax: { target_node_id: "fax_records" },
        no_input: { target_node_id: "tr_receptionist" },
      },
    }),
  },

  // ===== Sub-menus =====
  {
    id: "m_appointments",
    type: "menu_custom",
    position: { x: COL_MENU, y: 0 },
    data: def({
      name: "Appointments",
      active_period: "business_hours",
      intro_prompt: "p_appts_intro",
      menu_prompt: "p_appts_menu",
      no_input: { timeout_s: 9, action_node_id: "tr_appt_desk" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      inactive_action_node_id: "vm_appointments",
      actions: {
        "1": { target_node_id: "tr_new_appt" },
        "2": { target_node_id: "tr_reschedule" },
        "3": { target_node_id: "tr_cancel" },
        "0": { target_node_id: "root" },
      },
    }),
  },
  {
    id: "m_billing",
    type: "menu_custom",
    position: { x: COL_MENU, y: 420 },
    data: def({
      name: "Billing",
      active_period: "business_hours",
      menu_prompt: "p_billing_menu",
      no_input: { timeout_s: 9, action_node_id: "vm_billing" },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      inactive_action_node_id: "vm_billing",
      actions: {
        "1": { target_node_id: "tr_bill_questions" },
        "2": { target_node_id: "tr_bill_payment" },
        "0": { target_node_id: "root" },
      },
    }),
  },

  // ===== Direct-from-ROOT transfers + emergency disconnect =====
  // Action_transfer cards are ~180 px tall in v2, so a 220 px step gives ~40 px
  // between them. tr_pharmacy starts well below m_billing's bottom (~782 px).
  {
    id: "tr_pharmacy",
    type: "action_transfer",
    position: { x: COL_MENU, y: 880 },
    data: { mode: "extension", target_node_id: "ext_pharmacy" },
  },
  {
    id: "tr_nurse_triage",
    type: "action_transfer",
    position: { x: COL_MENU, y: 1100 },
    data: { mode: "extension", target_node_id: "hg_nurses" },
  },
  {
    id: "tr_receptionist",
    type: "action_transfer",
    position: { x: COL_MENU, y: 1320 },
    data: { mode: "extension", target_node_id: "ext_reception" },
  },
  {
    id: "a_disc_emergency_reminder",
    type: "action_disconnect",
    position: { x: COL_MENU, y: 1540 },
    data: { play_before_action: "p_call_911_reminder" },
  },

  // ===== Appointment / billing leaf transfers =====
  // 220 px step matches the direct-from-ROOT transfers above so cards line up
  // visually across COL_MENU and COL_TRANSFER.
  {
    id: "tr_new_appt",
    type: "action_transfer",
    position: { x: COL_TRANSFER, y: 0 },
    data: { mode: "extension", target_node_id: "hg_appt_desk", play_before_action: "p_new_patient_intro" },
  },
  {
    id: "tr_reschedule",
    type: "action_transfer",
    position: { x: COL_TRANSFER, y: 220 },
    data: { mode: "extension", target_node_id: "hg_appt_desk" },
  },
  {
    id: "tr_cancel",
    type: "action_transfer",
    position: { x: COL_TRANSFER, y: 440 },
    data: { mode: "extension", target_node_id: "hg_appt_desk" },
  },
  {
    id: "tr_appt_desk",
    type: "action_transfer",
    position: { x: COL_TRANSFER, y: 660 },
    data: { mode: "extension", target_node_id: "hg_appt_desk" },
  },
  {
    id: "tr_bill_questions",
    type: "action_transfer",
    position: { x: COL_TRANSFER, y: 880 },
    data: { mode: "extension", target_node_id: "ext_billing" },
  },
  {
    id: "tr_bill_payment",
    type: "action_transfer",
    position: { x: COL_TRANSFER, y: 1100 },
    data: { mode: "extension", target_node_id: "ext_billing" },
  },

  // ===== Targets =====
  // hg_appt_desk gets 4 inbound transfers and is cloned by splitFanIn; the
  // original sits at y=0 and clones cascade ~210 px below — keep room below it.
  {
    id: "hg_appt_desk",
    type: "target_hunt_group_ref",
    position: { x: COL_TARGET, y: 0 },
    data: { hunt_group_id: "hg_appointments_desk", label: "Appointment desk" },
  },
  {
    id: "ext_billing",
    type: "target_extension",
    position: { x: COL_TARGET, y: 880 },
    data: { extension: "300" },
  },
  {
    id: "ext_pharmacy",
    type: "target_extension",
    position: { x: COL_TARGET, y: 1100 },
    data: { extension: "400" },
  },
  {
    id: "hg_nurses",
    type: "target_hunt_group_ref",
    position: { x: COL_TARGET, y: 1240 },
    data: { hunt_group_id: "hg_nurse_triage", label: "Nurse triage" },
  },
  {
    id: "ext_reception",
    type: "target_extension",
    position: { x: COL_TARGET, y: 1400 },
    data: { extension: "500" },
  },

  // ===== Voicemail / fax / compliance =====
  {
    id: "vm_appointments",
    type: "voicemail",
    position: { x: COL_SINK, y: 100 },
    data: {
      greeting: "extended_absence",
      require_pin: true,
      auto_play: false,
      announce_datetime: true,
      email_option: "forward_as_attachment",
      email_address: "appointments@riverside.example",
    },
  },
  {
    id: "vm_billing",
    type: "voicemail",
    position: { x: COL_SINK, y: 460 },
    data: {
      greeting: "extended_absence",
      require_pin: true,
      auto_play: false,
      announce_datetime: true,
      email_option: "forward_as_attachment",
      email_address: "billing@riverside.example",
    },
  },
  {
    id: "fax_records",
    type: "fax_mailbox",
    position: { x: COL_SINK, y: 820 },
    data: {
      email_option: "forward_as_attachment",
      email_address: "records@riverside.example",
    },
  },
  {
    id: "rec_compliance",
    type: "call_recording",
    position: { x: COL_SINK, y: 1000 },
    data: {
      announce: true,
      announce_prompt: "p_recording_notice",
      send_to_email: "compliance@riverside.example",
    },
  },
];

export const riversideMedicalClinic: Flow = {
  schema_version: "1.0",
  entity: {
    type: "auto_attendant",
    id: "aa_riverside_clinic",
    did: "+18005552273",
    name: "Riverside Medical Clinic",
    time_periods: {
      business_hours: [
        { time_from: "08:00", time_to: "17:00", days_of_week: [1, 2, 3, 4, 5] },
        { time_from: "09:00", time_to: "13:00", days_of_week: [6] },
      ],
      after_hours: [
        { time_from: "17:00", time_to: "23:59", days_of_week: [1, 2, 3, 4, 5] },
        { time_from: "00:00", time_to: "08:00", days_of_week: [1, 2, 3, 4, 5] },
        { time_from: "13:00", time_to: "23:59", days_of_week: [6] },
        { days_of_week: [7] },
      ],
      // US holidays the clinic observes.
      holidays: [
        { months: [1], days_of_month: [1] },   // New Year's Day
        { months: [7], days_of_month: [4] },   // Independence Day
        { months: [11], days_of_month: [28] }, // Thanksgiving (illustrative)
        { months: [12], days_of_month: [25] }, // Christmas Day
      ],
    },
    directory: [
      { extension: "100", name: "Dr. Smith — Family Medicine", published: true },
      { extension: "101", name: "Dr. Lee — Pediatrics", published: true },
      { extension: "102", name: "Dr. Patel — Cardiology", published: true },
      { extension: "200", name: "Nurse station", published: false },
      { extension: "300", name: "Billing desk", published: true },
      { extension: "400", name: "Pharmacy refills", published: true },
      { extension: "500", name: "Reception", published: true },
    ],
  },
  ...splitFanIn(nodes, inferEdges(nodes)),
  scenarios: [
    {
      name: "Business hours · press 1 1 → New patient appointment desk",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["1", "1"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Business hours · press 2 → Pharmacy refill line",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["2"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Business hours · press 4 → Nurse triage (urgent)",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["4"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "After hours · press 1 → Appointment voicemail",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T22:00:00-07:00",
      press_sequence: ["1"],
      answering_behavior: [],
      expected_terminal: "voicemail_left",
    },
    {
      name: "After hours · press 3 → Billing voicemail",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T22:00:00-07:00",
      press_sequence: ["3"],
      answering_behavior: [],
      expected_terminal: "voicemail_left",
    },
    {
      name: "Caller presses 9 → 911 reminder then disconnect",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["9"],
      answering_behavior: [],
      expected_terminal: "disconnected",
    },
    {
      name: "Caller says nothing → routed to reception",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: [],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Direct-dial 102 → Dr. Patel (Cardiology)",
      caller: "+14155550100",
      callee: "18005552273",
      time: "2026-05-18T10:00:00-07:00",
      active_mode: "business_hours",
      press_sequence: ["1", "0", "2"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
  ],
};
