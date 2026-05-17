import { describe, expect, it, beforeEach } from "vitest";
import { simulate } from "@/simulator/engine";
import { mkExtFlow, mkNode, resetIds } from "./helpers";
import type { SimulatorInput } from "@/simulator/types";

const baseInput: SimulatorInput = {
  caller: "+14155550101",
  callee: "401",
  time: "2026-05-18T10:00:00Z",
};

beforeEach(() => resetIds());

describe("Call forwarding (§5.5)", () => {
  it("sequential: first rule answers → forwarded_answered", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode(
        "forward_follow_me",
        {
          rules: [
            { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 20, enabled: true },
            { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 20, enabled: true },
          ],
        },
      ),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("forwarded_answered");
    expect(t.terminal_detail).toContain("+15551111111");
  });

  it("sequential: when first rule times out, second rule is tried", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_follow_me", {
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 5, enabled: true },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 5, enabled: true },
        ],
      }),
    ]);
    const t = simulate(flow, {
      ...baseInput,
      answering_behavior: [
        { target: "+15551111111", outcome: "never_answer" },
        { target: "+15552222222", outcome: "answer_after" },
      ],
    });
    expect(t.terminal).toBe("forwarded_answered");
    expect(t.terminal_detail).toContain("+15552222222");
  });

  it("disabled rules are skipped", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_follow_me", {
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 5, enabled: false },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 5, enabled: true },
        ],
      }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("forwarded_answered");
    expect(t.terminal_detail).toContain("+15552222222");
  });

  it("rule whose time_check is not active is skipped", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_follow_me", {
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "business_hours", timeout_s: 5, enabled: true },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 5, enabled: true },
        ],
      }),
    ]);
    // No business_hours in active_periods → first rule is skipped.
    const t = simulate(flow, { ...baseInput, active_periods: [] });
    expect(t.terminal).toBe("forwarded_answered");
    expect(t.terminal_detail).toContain("+15552222222");
  });

  it("advanced simultaneous: any answerer wins", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_advanced", {
        ring_mode: "simultaneous",
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 20, enabled: true },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 20, enabled: true },
        ],
      }),
    ]);
    const t = simulate(flow, {
      ...baseInput,
      answering_behavior: [
        { target: "+15551111111", outcome: "never_answer" },
        { target: "+15552222222", outcome: "answer_after" },
      ],
    });
    expect(t.terminal).toBe("forwarded_answered");
    expect(t.terminal_detail).toContain("+15552222222");
    // Should have a "Simultaneous ring →" step, not sequential per-target attempts.
    expect(t.steps.some((s) => s.message.includes("Simultaneous"))).toBe(true);
  });

  it("percentage distribution: deterministic across runs and picks proportionally", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_follow_me", {
        ring_mode: "percentage",
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 20, enabled: true, percentage_weight: 90 },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 20, enabled: true, percentage_weight: 10 },
        ],
      }),
    ]);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const t = simulate(flow, { ...baseInput, caller: `+1415555${String(i).padStart(4, "0")}` });
      const picked = t.terminal_detail?.match(/Answered by (\+\d+)/)?.[1] ?? "?";
      counts[picked] = (counts[picked] ?? 0) + 1;
    }
    // Should mostly land on +15551111111 (~90%).
    expect(counts["+15551111111"]).toBeGreaterThan(counts["+15552222222"]);
    // Determinism: same input → same trace.
    const a = simulate(flow, baseInput);
    const b = simulate(flow, baseInput);
    expect(a).toEqual(b);
  });

  it("random order: deterministic + every rule eventually rings on no-answer", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_follow_me", {
        ring_mode: "random",
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 5, enabled: true },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 5, enabled: true },
          { id: "r3", target_node_id: "+15553333333", time_check: "always", timeout_s: 5, enabled: true },
        ],
      }),
    ]);
    const input = {
      ...baseInput,
      answering_behavior: [
        { target: "+15551111111", outcome: "never_answer" as const },
        { target: "+15552222222", outcome: "never_answer" as const },
        { target: "+15553333333", outcome: "never_answer" as const },
      ],
    };
    const a = simulate(flow, input);
    const b = simulate(flow, input);
    expect(a).toEqual(b);
    // All three targets should appear as ringing in the trace.
    const targets = ["+15551111111", "+15552222222", "+15553333333"];
    for (const t of targets) {
      expect(a.steps.some((s) => s.message.includes(t))).toBe(true);
    }
  });

  it("simultaneous: trace records CANCEL of losing legs", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_advanced", {
        ring_mode: "simultaneous",
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 20, enabled: true },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 20, enabled: true },
        ],
      }),
    ]);
    const t = simulate(flow, {
      ...baseInput,
      answering_behavior: [
        { target: "+15551111111", outcome: "never_answer" },
        { target: "+15552222222", outcome: "answer_after" },
      ],
    });
    expect(t.steps.some((s) => s.message.includes("CANCEL"))).toBe(true);
    expect(t.steps.some((s) => s.message.includes("call completed elsewhere"))).toBe(true);
  });

  it("advanced simultaneous: all unanswered → forwarded_unanswered after longest timeout", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "forward_only" }),
      mkNode("forward_advanced", {
        ring_mode: "simultaneous",
        rules: [
          { id: "r1", target_node_id: "+15551111111", time_check: "always", timeout_s: 5, enabled: true },
          { id: "r2", target_node_id: "+15552222222", time_check: "always", timeout_s: 30, enabled: true },
        ],
      }),
    ]);
    const t = simulate(flow, {
      ...baseInput,
      answering_behavior: [
        { target: "+15551111111", outcome: "never_answer" },
        { target: "+15552222222", outcome: "never_answer" },
      ],
    });
    expect(t.terminal).toBe("forwarded_unanswered");
    // Elapsed should be at least the longest rule timeout (30s).
    const last = t.steps[t.steps.length - 1];
    expect(last.elapsed_ms).toBeGreaterThanOrEqual(30000);
  });
});
