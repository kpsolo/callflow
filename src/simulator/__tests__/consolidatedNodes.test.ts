import { describe, it, expect, beforeEach } from "vitest";
import { simulate } from "../engine";
import { mkNode, mkExtFlow, mkAaFlow, resetIds } from "./helpers";
import type { FlowEdge, SimulatorInput } from "@/schema";

function mkEdge(id: string, source: string, target: string, sourceHandle?: string): FlowEdge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

beforeEach(() => resetIds());

// ────────────────────────────────────────────────────────────────────────────
// call_screening (extension flow — type-scan based, same pattern as screening_rule)
// ────────────────────────────────────────────────────────────────────────────

describe("call_screening consolidated node", () => {
  it("rejects anonymous callers when a matching screening rule exists", () => {
    const scr = mkNode("call_screening", {
      rules: [
        {
          name: "Block Anonymous",
          order: 0,
          enabled: true,
          conditions: {
            time_period: "always",
            caller: { kind: "anonymous" },
            callee: { kind: "any" },
          },
          action_mode: "reject",
        },
      ],
    });
    const am = mkNode("answering_mode_ext", { mode: "ring_only" });
    const flow = mkExtFlow([scr, am]);

    const trace = simulate(flow, {
      caller: "anonymous",
      callee: "ext_test",
      time: "2024-01-01T12:00:00Z",
    });
    expect(trace.terminal).toBe("rejected");
    expect(trace.steps.some((s) => s.message.includes("Block Anonymous"))).toBe(true);
  });

  it("falls through to ring_only answering mode when no rule matches", () => {
    const scr = mkNode("call_screening", {
      rules: [
        {
          name: "Block Anonymous",
          order: 0,
          enabled: true,
          conditions: {
            time_period: "always",
            caller: { kind: "anonymous" },
            callee: { kind: "any" },
          },
          action_mode: "reject",
        },
      ],
    });
    const am = mkNode("answering_mode_ext", { mode: "ring_only" });
    const flow = mkExtFlow([scr, am]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2024-01-01T12:00:00Z",
    });
    // Non-anonymous caller falls through to ring_only → answered (default entity answers)
    expect(trace.terminal).toBe("answered");
  });

  it("disabled rule is ignored", () => {
    const scr = mkNode("call_screening", {
      rules: [
        {
          name: "Disabled Rule",
          order: 0,
          enabled: false,
          conditions: {
            time_period: "always",
            caller: { kind: "any" },
            callee: { kind: "any" },
          },
          action_mode: "reject",
        },
      ],
    });
    const am = mkNode("answering_mode_ext", { mode: "ring_only" });
    const flow = mkExtFlow([scr, am]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2024-01-01T12:00:00Z",
    });
    expect(trace.terminal).toBe("answered");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// call_forwarding (extension flow — found by type scan in goForwardExt)
// ────────────────────────────────────────────────────────────────────────────

describe("call_forwarding consolidated node", () => {
  it("forwards sequentially via call_forwarding node", () => {
    // The call_forwarding rule's target_node_id is used as a lookup key in
    // answeringFor() — in existing forwarding tests it's the extension/entity ID.
    const TARGET = "ext_forward_target";
    const fwd = mkNode("call_forwarding", {
      ring_mode: "sequential",
      rules: [
        { enabled: true, target_node_id: TARGET, timeout_s: 20, time_check: "always" },
      ],
    });
    const am = mkNode("answering_mode_ext", { mode: "forward_only" });
    const flow = mkExtFlow([am, fwd]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2024-01-01T12:00:00Z",
      answering_behavior: [{ target: TARGET, outcome: "answer_after" }],
    });
    expect(trace.terminal).toBe("forwarded_answered");
  });

  it("returns forwarded_unanswered when all rules fail", () => {
    const TARGET = "ext_forward_target";
    const fwd = mkNode("call_forwarding", {
      ring_mode: "sequential",
      rules: [
        { enabled: true, target_node_id: TARGET, timeout_s: 5, time_check: "always" },
      ],
    });
    const am = mkNode("answering_mode_ext", { mode: "forward_only" });
    const flow = mkExtFlow([am, fwd]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2024-01-01T12:00:00Z",
      answering_behavior: [{ target: TARGET, outcome: "never_answer" }],
    });
    expect(trace.terminal).toBe("forwarded_unanswered");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// holiday_calendar (AA flow — reached via runNode from menu action)
// ────────────────────────────────────────────────────────────────────────────

describe("holiday_calendar node", () => {
  it("routes to voicemail on a holiday date (via menu action)", () => {
    const root = mkNode("menu_root", {
      name: "Main",
      active_period: "always",
      actions: { "1": { target_node_id: "holiday_1" } },
    });
    const holiday = mkNode("holiday_calendar", {
      dates: ["2024-12-25"],
      action_mode: "voicemail_only",
    }, "holiday_1");
    const vm = mkNode("voicemail");
    const term = mkNode("term_answered");
    const flow = {
      ...mkAaFlow([root, holiday, vm, term]),
      edges: [
        mkEdge("e1", holiday.id, term.id, "false"),
      ],
    };

    const holidayTrace = simulate(flow, {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-12-25T10:00:00",
      press_sequence: ["1"],
    });
    expect(holidayTrace.terminal).toBe("voicemail_left");

    const normalTrace = simulate(flow, {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-12-26T10:00:00",
      press_sequence: ["1"],
    });
    // On non-holiday, follows "false" edge → term_answered
    expect(normalTrace.terminal).toBe("answered");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// announcement node (AA flow — reached via runNode from menu action)
// ────────────────────────────────────────────────────────────────────────────

describe("announcement node", () => {
  it("plays a prompt and proceeds to next node via 'next' edge", () => {
    const root = mkNode("menu_root", {
      name: "Main",
      active_period: "always",
      actions: { "1": { target_node_id: "ann_1" } },
    });
    const ann = mkNode("announcement", { prompt: "welcome_announcement" }, "ann_1");
    const term = mkNode("term_answered");
    const flow = {
      ...mkAaFlow([root, ann, term]),
      edges: [mkEdge("e1", ann.id, term.id, "next")],
    };

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
    });
    expect(trace.terminal).toBe("answered");
    expect(trace.prompts).toContain("welcome_announcement");
  });

  it("drops the call if no 'next' edge is configured", () => {
    const root = mkNode("menu_root", {
      name: "Main",
      active_period: "always",
      actions: { "1": { target_node_id: "ann_1" } },
    });
    const ann = mkNode("announcement", { prompt: "welcome_announcement" }, "ann_1");
    const flow = mkAaFlow([root, ann]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
    });
    expect(trace.terminal).toBe("dropped");
    expect(trace.prompts).toContain("welcome_announcement");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// call_terminal node (AA flow — reached via runNode from menu action)
// ────────────────────────────────────────────────────────────────────────────

describe("call_terminal node", () => {
  function makeTerminalFlow(outcome: SimulatorInput["active_mode"] | string) {
    const root = mkNode("menu_root", {
      name: "Main",
      active_period: "always",
      actions: { "1": { target_node_id: "ct_1" } },
    });
    const ct = mkNode("call_terminal", { outcome: outcome as any }, "ct_1");
    return mkAaFlow([root, ct]);
  }

  it("terminates with 'rejected' outcome", () => {
    const trace = simulate(makeTerminalFlow("rejected"), {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
    });
    expect(trace.terminal).toBe("rejected");
  });

  it("terminates with 'answered' outcome", () => {
    const trace = simulate(makeTerminalFlow("answered"), {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
    });
    expect(trace.terminal).toBe("answered");
  });

  it("terminates with 'voicemail_left' outcome", () => {
    const trace = simulate(makeTerminalFlow("voicemail_left"), {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
    });
    expect(trace.terminal).toBe("voicemail_left");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// menu_action_transfer node (AA flow)
// ────────────────────────────────────────────────────────────────────────────

describe("menu_action_transfer node", () => {
  it("plays prompt and routes to target node", () => {
    const root = mkNode("menu_root", {
      name: "Main",
      active_period: "always",
      actions: { "1": { target_node_id: "mat_1" } },
    });
    const ext = mkNode("target_extension", { extension: "401" }, "ext_target_1");
    const mat = mkNode("menu_action_transfer", {
      play_before_action: "transferring",
      target_node_id: "ext_target_1",
    }, "mat_1");
    const flow = mkAaFlow([root, mat, ext]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
      answering_behavior: [{ target: "401", outcome: "answer_after" }],
    });
    expect(trace.terminal).toBe("answered");
    expect(trace.prompts).toContain("transferring");
  });

  it("supports inline destination configuration (extension)", () => {
    const root = mkNode("menu_root", {
      name: "Main",
      active_period: "always",
      actions: { "1": { target_node_id: "mat_1" } },
    });
    const mat = mkNode("menu_action_transfer", {
      play_before_action: "transferring",
      mode: "extension",
      extension: "401",
    }, "mat_1");
    const flow = mkAaFlow([root, mat]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
      answering_behavior: [{ target: "401", outcome: "answer_after" }],
    });
    expect(trace.terminal).toBe("answered");
    expect(trace.prompts).toContain("transferring");
  });

  it("supports inline destination configuration (e164)", () => {
    const root = mkNode("menu_root", {
      name: "Main",
      active_period: "always",
      actions: { "1": { target_node_id: "mat_1" } },
    });
    const mat = mkNode("menu_action_transfer", {
      play_before_action: "transferring",
      mode: "e164",
      number: "+18005551234",
    }, "mat_1");
    const flow = mkAaFlow([root, mat]);

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "aa_test",
      time: "2024-01-01T12:00:00Z",
      press_sequence: ["1"],
      answering_behavior: [{ target: "+18005551234", outcome: "answer_after" }],
    });
    expect(trace.terminal).toBe("forwarded_answered");
    expect(trace.prompts).toContain("transferring");
  });
});
