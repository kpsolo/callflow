import { describe, it, expect, beforeEach } from "vitest";
import { simulate } from "../engine";
import { mkNode, mkExtFlow, resetIds } from "./helpers";
import type { FlowEdge } from "@/schema";

function mkEdge(id: string, source: string, target: string, sourceHandle?: string): FlowEdge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

beforeEach(() => resetIds());

describe("cond_time (legacy Time Check) node", () => {
  it("branches to true port when active period matches", () => {
    const condTime = mkNode("cond_time", { period: "business_hours" }, "cond_time_1");
    const screening = mkNode("call_screening", { fallback_node_id: condTime.id }, "screening_1");
    const successNode = mkNode("term_answered", {}, "success");
    const failNode = mkNode("action_disconnect", {}, "fail");
    
    const flow = mkExtFlow([screening, condTime, successNode, failNode]);
    flow.edges = [
      mkEdge("escr", screening.id, condTime.id, "fallback"),
      mkEdge("e1", condTime.id, successNode.id, "true"),
      mkEdge("e2", condTime.id, failNode.id, "false"),
    ];

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2026-05-29T12:00:00Z",
      active_periods: ["business_hours"],
    });

    expect(trace.terminal).toBe("answered"); // term_answered completes successfully
    expect(trace.visited_edge_ids).toContain("escr");
    expect(trace.visited_edge_ids).toContain("e1");
    expect(trace.visited_edge_ids).not.toContain("e2");
  });

  it("branches to false port when active period does not match", () => {
    const condTime = mkNode("cond_time", { period: "business_hours" }, "cond_time_1");
    const screening = mkNode("call_screening", { fallback_node_id: condTime.id }, "screening_1");
    const successNode = mkNode("term_answered", {}, "success");
    const failNode = mkNode("action_disconnect", {}, "fail");
    
    const flow = mkExtFlow([screening, condTime, successNode, failNode]);
    flow.edges = [
      mkEdge("escr", screening.id, condTime.id, "fallback"),
      mkEdge("e1", condTime.id, successNode.id, "true"),
      mkEdge("e2", condTime.id, failNode.id, "false"),
    ];

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2026-05-29T12:00:00Z",
      active_periods: ["some_other_period"],
    });

    expect(trace.terminal).toBe("disconnected"); // failNode disconnects
    expect(trace.visited_edge_ids).toContain("escr");
    expect(trace.visited_edge_ids).toContain("e2");
    expect(trace.visited_edge_ids).not.toContain("e1");
  });
});

describe("time_router (Schedule Switch) node", () => {
  it("routes call to the first matching active period exit handle", () => {
    const timeRouter = mkNode("time_router", {
      rules: [
        { id: "holiday_rule", name: "Holidays", period: "holidays", target_node_id: "holiday_target" },
        { id: "business_rule", name: "Business Hours", period: "business_hours", target_node_id: "business_target" },
      ],
      fallback_node_id: "fallback_target",
    }, "time_router_1");

    const screening = mkNode("call_screening", { fallback_node_id: timeRouter.id }, "screening_1");
    const holidayTarget = mkNode("term_answered", {}, "holiday_target");
    const businessTarget = mkNode("voicemail", {}, "business_target");
    const fallbackTarget = mkNode("action_disconnect", {}, "fallback_target");

    const flow = mkExtFlow([screening, timeRouter, holidayTarget, businessTarget, fallbackTarget]);
    flow.edges = [
      mkEdge("escr", screening.id, timeRouter.id, "fallback"),
      mkEdge("e1", timeRouter.id, holidayTarget.id, "period:holiday_rule"),
      mkEdge("e2", timeRouter.id, businessTarget.id, "period:business_rule"),
      mkEdge("e3", timeRouter.id, fallbackTarget.id, "fallback"),
    ];

    // Case A: Holidays is active (highest priority)
    const traceA = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2026-05-29T12:00:00Z",
      active_periods: ["holidays", "business_hours"],
    });
    expect(traceA.terminal).toBe("answered"); // holiday term_answered
    expect(traceA.visited_edge_ids).toContain("escr");
    expect(traceA.visited_edge_ids).toContain("e1");
    expect(traceA.visited_edge_ids).not.toContain("e2");
    expect(traceA.visited_edge_ids).not.toContain("e3");

    // Case B: Only Business Hours is active
    const traceB = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2026-05-29T12:00:00Z",
      active_periods: ["business_hours"],
    });
    expect(traceB.terminal).toBe("voicemail_left"); // goes to voicemail
    expect(traceB.visited_edge_ids).toContain("escr");
    expect(traceB.visited_edge_ids).toContain("e2");
    expect(traceB.visited_edge_ids).not.toContain("e1");
    expect(traceB.visited_edge_ids).not.toContain("e3");
  });

  it("routes call to fallback when no period matches", () => {
    const timeRouter = mkNode("time_router", {
      rules: [
        { id: "holiday_rule", name: "Holidays", period: "holidays", target_node_id: "holiday_target" },
        { id: "business_rule", name: "Business Hours", period: "business_hours", target_node_id: "business_target" },
      ],
      fallback_node_id: "fallback_target",
    }, "time_router_1");

    const screening = mkNode("call_screening", { fallback_node_id: timeRouter.id }, "screening_1");
    const holidayTarget = mkNode("term_answered", {}, "holiday_target");
    const businessTarget = mkNode("voicemail", {}, "business_target");
    const fallbackTarget = mkNode("action_disconnect", {}, "fallback_target");

    const flow = mkExtFlow([screening, timeRouter, holidayTarget, businessTarget, fallbackTarget]);
    flow.edges = [
      mkEdge("escr", screening.id, timeRouter.id, "fallback"),
      mkEdge("e1", timeRouter.id, holidayTarget.id, "period:holiday_rule"),
      mkEdge("e2", timeRouter.id, businessTarget.id, "period:business_rule"),
      mkEdge("e3", timeRouter.id, fallbackTarget.id, "fallback"),
    ];

    const trace = simulate(flow, {
      caller: "+15550001",
      callee: "ext_test",
      time: "2026-05-29T12:00:00Z",
      active_periods: ["lunch_break"], // Neither matches
    });

    expect(trace.terminal).toBe("disconnected"); // fallback disconnects
    expect(trace.visited_edge_ids).toContain("escr");
    expect(trace.visited_edge_ids).toContain("e3");
    expect(trace.visited_edge_ids).not.toContain("e1");
    expect(trace.visited_edge_ids).not.toContain("e2");
  });
});
