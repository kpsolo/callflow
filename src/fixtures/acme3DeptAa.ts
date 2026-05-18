import type { Flow } from "@/schema";
import { inferEdges } from "./inferEdges";
import { splitFanIn } from "./splitFanIn";

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
      position: { x: 0, y: 200 },
      data: {
        name: "ROOT",
        active_period: "always",
        intro_prompt: "p_welcome_to_acme",
        menu_prompt: "p_root_options",
        no_input: { timeout_s: 9, action_node_id: "disc_root" },
        allow_direct_dial: true,
        interdigit_timeout_s: 5,
        actions: {
          "1": { target_node_id: "goto_sales" },
          "2": { target_node_id: "goto_eng" },
          "3": { target_node_id: "goto_support" },
          "9": { target_node_id: "disc_root", play_before_action: "p_goodbye" },
          fax: { target_node_id: "vm" },
          no_input: { target_node_id: "disc_root" },
        },
      },
    },
    {
      id: "goto_sales",
      type: "action_goto_menu",
      position: { x: 280, y: 80 },
      data: { target_menu_node_id: "sales" },
    },
    {
      id: "goto_eng",
      type: "action_goto_menu",
      position: { x: 280, y: 200 },
      data: { target_menu_node_id: "eng" },
    },
    {
      id: "goto_support",
      type: "action_goto_menu",
      position: { x: 280, y: 320 },
      data: { target_menu_node_id: "support" },
    },
    {
      id: "sales",
      type: "menu_custom",
      position: { x: 560, y: 80 },
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
      position: { x: 560, y: 200 },
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
      position: { x: 560, y: 320 },
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
      id: "tgt_alice",
      type: "action_transfer",
      position: { x: 840, y: 60 },
      data: { target_node_id: "ext_201" },
    },
    {
      id: "tgt_bob",
      type: "action_transfer",
      position: { x: 840, y: 200 },
      data: { target_node_id: "ext_202" },
    },
    {
      id: "tgt_carol",
      type: "action_transfer",
      position: { x: 840, y: 340 },
      data: { target_node_id: "ext_301" },
    },
    {
      id: "ext_201",
      type: "target_extension",
      position: { x: 1100, y: 60 },
      data: { extension: "201" },
    },
    {
      id: "ext_202",
      type: "target_extension",
      position: { x: 1100, y: 200 },
      data: { extension: "202" },
    },
    {
      id: "ext_301",
      type: "target_extension",
      position: { x: 1100, y: 340 },
      data: { extension: "301" },
    },
    {
      id: "vm",
      type: "voicemail",
      position: { x: 1100, y: 480 },
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
      id: "disc_root",
      type: "action_disconnect",
      position: { x: 280, y: 480 },
      data: { play_before_action: "p_goodbye" },
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
