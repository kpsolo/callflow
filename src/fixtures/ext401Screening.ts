import type { Flow } from "@/schema";
import { inferEdges } from "./inferEdges";
import { splitFanIn } from "./splitFanIn";

// Layout: three columns. Screening rules and the answering mode card are tall
// in v2 (inline editor + answering_mode_ext has 6 output handles), so vertical
// gaps are generous enough that they never bump into each other.
const COL_IN = 0;
const COL_RULES = 480;
const COL_SINK = 960;

export const ext401Screening: Flow = (() => {
  const f: Flow = {
  schema_version: "1.0",
  entity: {
    type: "extension",
    id: "ext_401",
    extension: "401",
    name: "Sales lead — Dave",
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
  },
  nodes: [
    {
      id: "incoming",
      type: "incoming_call",
      position: { x: COL_IN, y: 600 },
      data: { label: "Incoming Call" },
    },
    {
      id: "rule_vip",
      type: "screening_rule",
      position: { x: COL_RULES, y: 0 },
      data: {
        name: "VIP — always ring",
        order: 0,
        enabled: true,
        conditions: {
          time_period: "always",
          caller: { kind: "prefix", value: "+1415" },
          callee: { kind: "any" },
        },
        action_mode: "ring_only",
      },
    },
    {
      id: "rule_afterhours",
      type: "screening_rule",
      position: { x: COL_RULES, y: 360 },
      data: {
        name: "After-hours → voicemail",
        order: 1,
        enabled: true,
        conditions: {
          time_period: "after_hours",
          caller: { kind: "any" },
          callee: { kind: "any" },
        },
        action_mode: "voicemail_only",
      },
    },
    {
      id: "am",
      type: "answering_mode_ext",
      position: { x: COL_RULES, y: 720 },
      data: {
        mode: "ring_then_voicemail",
        ring_timeout_s: 20,
        reject_sip_code: 486,
        voicemail_node_id: "vm",
      },
    },
    {
      id: "rec",
      type: "call_recording",
      position: { x: COL_SINK, y: 0 },
      data: {
        announce: true,
        announce_prompt: "p_recording_notice",
        send_to_email: "compliance@acme.example",
      },
    },
    {
      id: "vm",
      type: "voicemail",
      position: { x: COL_SINK, y: 780 },
      data: {
        greeting: "personal",
        require_pin: true,
        auto_play: false,
        announce_datetime: true,
        email_option: "forward_as_attachment",
        email_address: "dave@acme.example",
      },
    },
  ],
  edges: [],
  scenarios: [
    {
      name: "VIP rings during business hours",
      caller: "+14155550101",
      callee: "401",
      time: "2026-05-17T10:00:00Z",
      press_sequence: [],
      answering_behavior: [{ target: "ext_401", outcome: "answer_after" }],
      expected_terminal: "answered",
    },
    {
      name: "After-hours non-VIP → voicemail",
      caller: "+12025550199",
      callee: "401",
      time: "2026-05-17T22:00:00Z",
      press_sequence: [],
      answering_behavior: [],
      expected_terminal: "voicemail_left",
    },
    {
      name: "Business hours non-VIP caller → Dave answers",
      caller: "+12025550199",
      callee: "401",
      time: "2026-05-18T10:00:00Z",
      press_sequence: [],
      answering_behavior: [],
      expected_terminal: "answered",
    },
    {
      name: "Business hours non-VIP caller → Dave doesn't answer → Voicemail",
      caller: "+12025550199",
      callee: "401",
      time: "2026-05-18T10:00:00Z",
      press_sequence: [],
      answering_behavior: [{ target: "ext_401", outcome: "never_answer" }],
      expected_terminal: "voicemail_left",
    },
    {
      name: "VIP bypasses After-hours → Dave answers",
      caller: "+14155550101",
      callee: "401",
      time: "2026-05-17T22:00:00Z",
      press_sequence: [],
      answering_behavior: [],
      expected_terminal: "answered",
    },
  ],
  };
  f.edges = [
    ...inferEdges(f.nodes),
    // Visual chain showing screening-rule evaluation order; the simulator orders
    // rules by `data.order`, so these edges are decorative but help readability.
    { id: "v_e1", source: "incoming", sourceHandle: "next", target: "rule_vip", targetHandle: "in" },
    { id: "v_e2", source: "rule_vip", sourceHandle: "next_rule", target: "rule_afterhours", targetHandle: "in" },
    { id: "v_e3", source: "rule_afterhours", sourceHandle: "next_rule", target: "am", targetHandle: "in" },
    { id: "v_e4", source: "rule_vip", sourceHandle: "matched", target: "am", targetHandle: "in", label: "VIP → ring" },
    { id: "v_e5", source: "rule_afterhours", sourceHandle: "matched", target: "vm", targetHandle: "in", label: "after-hours → vm" },
    // Recording is attached implicitly by the simulator on any answered leg; show it as a dotted hook off the answering mode.
    { id: "v_e6", source: "am", sourceHandle: "answered", target: "rec", targetHandle: "in", label: "recorded" },
  ];
  const split = splitFanIn(f.nodes, f.edges);
  f.nodes = split.nodes;
  f.edges = split.edges;
  return f;
})();
