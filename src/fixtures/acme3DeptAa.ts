import type { Flow } from "@/schema";
import { inferEdges } from "./inferEdges";
import { splitFanIn } from "./splitFanIn";

// Layout columns — sized for v2 inline-editor nodes (max-width 320 px) with
// breathing room. Wider gutters mean both v1 and v2 modes render cleanly
// without manually nudging cards.
const COL_ROOT = 0;
const COL_MENU = 480;
const COL_TRANSFER = 960;

export const acme3DeptAa: Flow = (() => {
  const f: Flow = {
  schema_version: "1.0",
  entity: {
    type: "auto_attendant",
    id: "aa_acme",
    did: "+18005551234",
    name: "Acme 3-Department AA",
    time_periods: {
      business_hours: [
        { time_from: "08:00", time_to: "17:00", days_of_week: [1, 2, 3, 4, 5] },
      ],
      after_hours: [
        { time_from: "17:00", time_to: "23:59", days_of_week: [1, 2, 3, 4, 5] },
        { time_from: "00:00", time_to: "08:00", days_of_week: [1, 2, 3, 4, 5] },
        { days_of_week: [6, 7] },
      ],
    },
    directory: [
      { extension: "201", name: "Alice Sales", published: true },
      { extension: "202", name: "Bob Engineering", published: true },
      { extension: "301", name: "Carol Support", published: true },
      { extension: "401", name: "Dave Billing", published: true },
    ],
  },
  nodes: [
    {
      id: "root",
      type: "menu_root",
      position: { x: COL_ROOT, y: 220 },
      data: {
        name: "ROOT",
        active_period: "always",
        intro_prompt: "p_welcome_to_acme",
        menu_prompt: "p_root_options",
        no_input: { timeout_s: 9, action_node_id: "ann_goodbye" },
        allow_direct_dial: true,
        interdigit_timeout_s: 5,
        actions: {
          "1": { target_node_id: "sales" },
          "2": { target_node_id: "eng" },
          "3": { target_node_id: "support" },
          "9": { target_node_id: "ann_goodbye" },
          fax: { target_node_id: "vm" },
          no_input: { target_node_id: "ann_goodbye" },
        },
      },
    },
    {
      id: "sales",
      type: "menu_custom",
      position: { x: COL_MENU, y: 0 },
      data: {
        name: "Sales",
        active_period: "always",
        menu_prompt: "p_sales_options",
        no_input: { timeout_s: 9 },
        allow_direct_dial: false,
        interdigit_timeout_s: 5,
        actions: {
          "1": { target_node_id: "mat_alice" },
          no_input: { target_node_id: "vm" },
        },
      },
    },
    {
      id: "eng",
      type: "menu_custom",
      position: { x: COL_MENU, y: 320 },
      data: {
        name: "Engineering",
        active_period: "always",
        menu_prompt: "p_eng_options",
        no_input: { timeout_s: 9 },
        allow_direct_dial: false,
        interdigit_timeout_s: 5,
        actions: {
          "1": { target_node_id: "mat_bob" },
          no_input: { target_node_id: "vm" },
        },
      },
    },
    {
      id: "support",
      type: "menu_custom",
      position: { x: COL_MENU, y: 640 },
      data: {
        name: "Support",
        active_period: "business_hours",
        menu_prompt: "p_support_options",
        no_input: { timeout_s: 9 },
        allow_direct_dial: false,
        interdigit_timeout_s: 5,
        inactive_action_node_id: "vm",
        actions: {
          "1": { target_node_id: "mat_carol" },
          no_input: { target_node_id: "vm" },
        },
      },
    },
    {
      id: "ann_goodbye",
      type: "announcement",
      position: { x: COL_MENU, y: 1000 },
      data: { prompt: "p_goodbye" },
    },
    {
      id: "disc_root",
      type: "call_terminal",
      position: { x: COL_MENU + 60, y: 1200 },
      data: { outcome: "disconnected" },
    },
    {
      id: "mat_alice",
      type: "menu_action_transfer",
      position: { x: COL_TRANSFER, y: 40 },
      data: { mode: "extension", extension: "201" },
    },
    {
      id: "mat_bob",
      type: "menu_action_transfer",
      position: { x: COL_TRANSFER, y: 360 },
      data: { mode: "extension", extension: "202" },
    },
    {
      id: "mat_carol",
      type: "menu_action_transfer",
      position: { x: COL_TRANSFER, y: 680 },
      data: { mode: "extension", extension: "301" },
    },
    {
      id: "vm",
      type: "voicemail",
      position: { x: COL_TRANSFER, y: 1000 },
      data: {
        greeting: "standard",
        require_pin: true,
        auto_play: false,
        announce_datetime: true,
        email_option: "forward_as_attachment",
        email_address: "voicemail@acme.example",
      },
    },
  ],
  edges: [],
  scenarios: [
    {
      name: "After hours caller hangs up",
      caller: "+14155550101",
      callee: "18005551234",
      time: "2026-05-17T22:30:00Z",
      press_sequence: [],
      answering_behavior: [],
      expected_terminal: "disconnected",
    },
    {
      name: "Press 1 reaches Alice",
      caller: "+14155550101",
      callee: "18005551234",
      time: "2026-05-17T10:00:00Z",
      press_sequence: ["1", "1"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Business hours · press 2 1 → Bob (Engineering)",
      caller: "+14155550101",
      callee: "18005551234",
      time: "2026-05-18T10:00:00Z",
      press_sequence: ["2", "1"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Business hours · press 3 1 → Carol (Support)",
      caller: "+14155550101",
      callee: "18005551234",
      time: "2026-05-18T10:00:00Z",
      press_sequence: ["3", "1"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "After hours · press 3 → Support inactive → Voicemail",
      caller: "+14155550101",
      callee: "18005551234",
      time: "2026-05-17T22:00:00Z",
      press_sequence: ["3"],
      answering_behavior: [],
      expected_terminal: "voicemail_left",
    },
    {
      name: "Direct-dial Bob (ext 202) from ROOT",
      caller: "+14155550101",
      callee: "18005551234",
      time: "2026-05-18T10:00:00Z",
      press_sequence: ["2", "0", "2"],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Fax tone sent at ROOT → Voicemail",
      caller: "+14155550101",
      callee: "18005551234",
      time: "2026-05-18T10:00:00Z",
      press_sequence: ["fax"],
      answering_behavior: [],
      expected_terminal: "voicemail_left",
    },
  ],
  };
  const explicitEdges = [
    { id: "e_goodbye", source: "ann_goodbye", sourceHandle: "next", target: "disc_root", targetHandle: "in" }
  ];
  const split = splitFanIn(f.nodes, [...inferEdges(f.nodes), ...explicitEdges]);
  f.nodes = split.nodes;
  f.edges = split.edges;
  return f;
})();
