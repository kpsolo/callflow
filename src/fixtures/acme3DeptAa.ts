import type { Flow } from "@/schema";
import { inferEdges } from "./inferEdges";
import { splitFanIn } from "./splitFanIn";

// Layout columns — sized for v2 inline-editor nodes (max-width 320 px) with
// breathing room. Wider gutters mean both v1 and v2 modes render cleanly
// without manually nudging cards.
const COL_ROOT = 0;
const COL_MENU = 480;
const COL_TRANSFER = 960;
const COL_TARGET = 1440;

export const acme3DeptAa: Flow = (() => {
  const f: Flow = {
  schema_version: "1.0",
  entity: {
    type: "auto_attendant",
    id: "aa_acme",
    did: "+18005551234",
    name: "Acme 3-Department AA",
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
        no_input: { timeout_s: 9, action_node_id: "disc_root" },
        allow_direct_dial: true,
        interdigit_timeout_s: 5,
        actions: {
          "1": { target_node_id: "sales" },
          "2": { target_node_id: "eng" },
          "3": { target_node_id: "support" },
          "9": { target_node_id: "disc_root", play_before_action: "p_goodbye" },
          fax: { target_node_id: "vm" },
          no_input: { target_node_id: "disc_root" },
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
          "1": { target_node_id: "tgt_alice" },
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
          "1": { target_node_id: "tgt_bob" },
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
          "1": { target_node_id: "tgt_carol" },
          no_input: { target_node_id: "vm" },
        },
      },
    },
    {
      id: "disc_root",
      type: "action_disconnect",
      position: { x: COL_MENU, y: 1000 },
      data: { play_before_action: "p_goodbye" },
    },
    {
      id: "tgt_alice",
      type: "action_transfer",
      position: { x: COL_TRANSFER, y: 40 },
      data: { mode: "extension", target_node_id: "ext_201" },
    },
    {
      id: "tgt_bob",
      type: "action_transfer",
      position: { x: COL_TRANSFER, y: 360 },
      data: { mode: "extension", target_node_id: "ext_202" },
    },
    {
      id: "tgt_carol",
      type: "action_transfer",
      position: { x: COL_TRANSFER, y: 680 },
      data: { mode: "extension", target_node_id: "ext_301" },
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
    {
      id: "ext_201",
      type: "target_extension",
      position: { x: COL_TARGET, y: 40 },
      data: { extension: "201" },
    },
    {
      id: "ext_202",
      type: "target_extension",
      position: { x: COL_TARGET, y: 360 },
      data: { extension: "202" },
    },
    {
      id: "ext_301",
      type: "target_extension",
      position: { x: COL_TARGET, y: 680 },
      data: { extension: "301" },
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
  ],
  };
  const split = splitFanIn(f.nodes, inferEdges(f.nodes));
  f.nodes = split.nodes;
  f.edges = split.edges;
  return f;
})();
