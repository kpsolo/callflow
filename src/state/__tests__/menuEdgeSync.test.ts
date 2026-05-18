import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";
import type { FlowNode } from "@/schema";
import {
  applyMenuConnectToActions,
  applyMenuEdgeRemovalToActions,
  projectMenuEdges,
} from "@/state/menuEdgeSync";

function menuNode(actions: Record<string, { target_node_id: string; play_before_action?: string }>): Node<FlowNode["data"]> {
  return {
    id: "root",
    type: "menu_root",
    position: { x: 0, y: 0 },
    data: {
      name: "ROOT",
      active_period: "always",
      no_input: { timeout_s: 9 },
      allow_direct_dial: false,
      interdigit_timeout_s: 5,
      actions,
    } as FlowNode["data"],
  };
}

describe("projectMenuEdges", () => {
  it("creates an edge per action key with stable id `menu_<src>_<key>`", () => {
    const node = menuNode({
      "1": { target_node_id: "tgt_a" },
      "2": { target_node_id: "tgt_b" },
    });
    const out = projectMenuEdges(node, []);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.id).sort()).toEqual(["menu_root_1", "menu_root_2"]);
    expect(out.find((e) => e.sourceHandle === "menu:1")?.target).toBe("tgt_a");
  });

  it("replaces prior menu edges from the same source", () => {
    const node = menuNode({ "1": { target_node_id: "tgt_a" } });
    const existing: Edge[] = [
      { id: "old_menu_1", source: "root", sourceHandle: "menu:1", target: "tgt_old" },
      // Edge from elsewhere should be preserved.
      { id: "e_keep", source: "other", target: "tgt_x" },
    ];
    const out = projectMenuEdges(node, existing);
    expect(out.some((e) => e.id === "old_menu_1")).toBe(false);
    expect(out.some((e) => e.id === "e_keep")).toBe(true);
    expect(out.find((e) => e.sourceHandle === "menu:1")?.target).toBe("tgt_a");
  });

  it("skips actions with empty target_node_id", () => {
    const node = menuNode({
      "1": { target_node_id: "tgt_a" },
      "2": { target_node_id: "" },
    });
    const out = projectMenuEdges(node, []);
    expect(out).toHaveLength(1);
    expect(out[0].sourceHandle).toBe("menu:1");
  });
});

describe("applyMenuConnectToActions", () => {
  it("writes the connection target into data.actions[key]", () => {
    const nodes = [menuNode({})];
    const next = applyMenuConnectToActions(nodes, {
      source: "root",
      target: "newTarget",
      sourceHandle: "menu:5",
    });
    const data = next[0].data as { actions: Record<string, { target_node_id: string }> };
    expect(data.actions["5"].target_node_id).toBe("newTarget");
  });

  it("preserves play_before_action on existing entries", () => {
    const nodes = [menuNode({ "1": { target_node_id: "old", play_before_action: "p1" } })];
    const next = applyMenuConnectToActions(nodes, {
      source: "root",
      target: "new",
      sourceHandle: "menu:1",
    });
    const data = next[0].data as { actions: Record<string, { target_node_id: string; play_before_action?: string }> };
    expect(data.actions["1"]).toEqual({ target_node_id: "new", play_before_action: "p1" });
  });

  it("is a no-op for non-menu source handles", () => {
    const nodes = [menuNode({})];
    const next = applyMenuConnectToActions(nodes, {
      source: "root",
      target: "x",
      sourceHandle: "next",
    });
    expect(next).toBe(nodes);
  });
});

describe("applyMenuEdgeRemovalToActions", () => {
  it("removes the action entry that matches the removed edge", () => {
    const nodes = [
      menuNode({
        "1": { target_node_id: "tgt_a" },
        "2": { target_node_id: "tgt_b" },
      }),
    ];
    const removed: Edge = {
      id: "menu_root_1",
      source: "root",
      sourceHandle: "menu:1",
      target: "tgt_a",
    };
    const next = applyMenuEdgeRemovalToActions(nodes, removed);
    const data = next[0].data as { actions: Record<string, unknown> };
    expect("1" in data.actions).toBe(false);
    expect("2" in data.actions).toBe(true);
  });
});
