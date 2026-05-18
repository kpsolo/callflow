import { describe, expect, it } from "vitest";
import { splitFanIn } from "@/fixtures/splitFanIn";
import { mkAaFlow, mkNode, resetIds } from "@/simulator/__tests__/helpers";
import { inferEdges } from "@/fixtures/inferEdges";

describe("splitFanIn", () => {
  it("leaves a node with ≤ 2 inbound edges unchanged", () => {
    resetIds();
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          actions: {
            "1": { target_node_id: "vm" },
            "2": { target_node_id: "vm" },
          },
        },
        "root",
      ),
      mkNode("voicemail", {}, "vm"),
    ]);
    const split = splitFanIn(flow.nodes, inferEdges(flow.nodes));
    // 2 inbound is at threshold — no duplication.
    expect(split.nodes.filter((n) => n.id.startsWith("vm")).length).toBe(1);
  });

  it("duplicates a voicemail referenced by 4 menus once per extra inbound source", () => {
    resetIds();
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          actions: {
            "1": { target_node_id: "vm" },
            "2": { target_node_id: "vm" },
            "3": { target_node_id: "vm" },
            "4": { target_node_id: "vm" },
          },
        },
        "root",
      ),
      mkNode("voicemail", {}, "vm"),
    ]);
    const edges = inferEdges(flow.nodes);
    const split = splitFanIn(flow.nodes, edges);
    const voicemails = split.nodes.filter((n) => n.type === "voicemail");
    // Original + 3 clones (4 inbound edges → first keeps the original, 3 cloned).
    expect(voicemails).toHaveLength(4);
    // Every voicemail in the result is reached by exactly one edge.
    const inCounts = new Map<string, number>();
    for (const e of split.edges) inCounts.set(e.target, (inCounts.get(e.target) ?? 0) + 1);
    for (const vm of voicemails) expect(inCounts.get(vm.id) ?? 0).toBe(1);
  });

  it("clone IDs are deterministic and re-running is a no-op-ish", () => {
    resetIds();
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          actions: {
            "1": { target_node_id: "vm" },
            "2": { target_node_id: "vm" },
            "3": { target_node_id: "vm" },
            "4": { target_node_id: "vm" },
          },
        },
        "root",
      ),
      mkNode("voicemail", {}, "vm"),
    ]);
    const edges = inferEdges(flow.nodes);
    const a = splitFanIn(flow.nodes, edges);
    const b = splitFanIn(flow.nodes, edges);
    expect(a.nodes.map((n) => n.id).sort()).toEqual(b.nodes.map((n) => n.id).sort());
    // Cloned IDs follow the documented shape.
    for (const node of a.nodes) {
      if (node.id.includes("__forMenu_")) {
        expect(node.id).toMatch(/^vm__forMenu_.+/);
      }
    }
  });
});
