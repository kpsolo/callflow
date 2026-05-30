import { describe, expect, it, beforeEach } from "vitest";
import { simulate } from "@/simulator/engine";
import { mkExtFlow, mkNode, resetIds } from "./helpers";
import type { SimulatorInput } from "@/simulator/types";

const baseInput: SimulatorInput = {
  caller: "+14155550101",
  callee: "401",
  time: "2026-05-17T12:00:00Z",
};

beforeEach(() => resetIds());

describe("Extension simulator (§13.1)", () => {
  it("reject mode → rejected terminal with SIP code", () => {
    const flow = mkExtFlow([mkNode("answering_mode_ext", { mode: "reject", reject_sip_code: 486 })]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("rejected");
    expect(t.terminal_detail).toContain("486");
  });

  it("ring_only answered by extension", () => {
    const flow = mkExtFlow([mkNode("answering_mode_ext", { mode: "ring_only" })]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("answered");
  });

  it("ring_only no answer → dropped", () => {
    const flow = mkExtFlow([mkNode("answering_mode_ext", { mode: "ring_only", ring_timeout_s: 5 })]);
    const t = simulate(flow, {
      ...baseInput,
      answering_behavior: [{ target: "ext_test", outcome: "never_answer" }],
    });
    expect(t.terminal).toBe("dropped");
  });

  it("voicemail_only routes to voicemail and emits email side-effect", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "voicemail_only" }),
      mkNode("voicemail", { email_option: "forward", email_address: "ops@example.com" }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("voicemail_left");
    expect(t.side_effects).toHaveLength(1);
    expect(t.side_effects[0].kind).toBe("email_queued");
  });

  it("ring_then_voicemail falls through to voicemail when no answer", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_then_voicemail" }),
      mkNode("voicemail", {}),
    ]);
    const t = simulate(flow, {
      ...baseInput,
      answering_behavior: [{ target: "ext_test", outcome: "never_answer" }],
    });
    expect(t.terminal).toBe("voicemail_left");
  });

  it("screening rule matches before default answering mode", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("screening_rule", {
        id: "vip",
        name: "VIP",
        order: 0,
        enabled: true,
        conditions: {
          time_period: "always",
          caller: { kind: "prefix", value: "+1415" },
          callee: { kind: "any" },
        },
        action_mode: "reject",
      }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("rejected");
    expect(t.steps.some((s) => s.message.includes("matched"))).toBe(true);
  });

  it("first matching screening rule wins (lower order)", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("screening_rule", {
        id: "first",
        name: "First",
        order: 0,
        enabled: true,
        conditions: { time_period: "always", caller: { kind: "any" }, callee: { kind: "any" } },
        action_mode: "voicemail_only",
      }),
      mkNode("screening_rule", {
        id: "second",
        name: "Second",
        order: 1,
        enabled: true,
        conditions: { time_period: "always", caller: { kind: "any" }, callee: { kind: "any" } },
        action_mode: "reject",
      }),
      mkNode("voicemail", {}),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("voicemail_left");
  });

  it("determinism: identical input yields identical trace", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_then_voicemail" }),
      mkNode("voicemail", {}),
    ]);
    const input: SimulatorInput = {
      ...baseInput,
      answering_behavior: [{ target: "ext_test", outcome: "never_answer" }],
    };
    const a = simulate(flow, input);
    const b = simulate(flow, input);
    expect(a).toEqual(b);
  });
});
