import { describe, expect, it, beforeEach } from "vitest";
import type { Flow } from "@/schema";
import { useFlowStore } from "@/state/store";

function loadFixture(flow: Flow) {
  useFlowStore.getState().loadFlow(flow);
}

function snapshotIds(): { nodes: string[]; edges: Array<{ source: string; target: string }> } {
  const s = useFlowStore.getState();
  return {
    nodes: s.nodes.map((n) => n.id),
    edges: s.edges.map((e) => ({ source: e.source, target: e.target })),
  };
}

const baseFlow = (): Flow => ({
  schema_version: "1.0",
  entity: {
    type: "auto_attendant",
    id: "aa_test",
    did: "+18005551111",
    name: "Test AA",
    directory: [],
  },
  scenarios: [],
  nodes: [],
  edges: [],
});

describe("mergeIdenticalTerminals", () => {
  beforeEach(() => {
    loadFixture(baseFlow());
  });

  it("collapses two identical Voicemail nodes into one and rewires edges", () => {
    loadFixture({
      ...baseFlow(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: [
        { id: "src1", type: "action_disconnect", position: { x: 0, y: 0 }, data: {} },
        { id: "src2", type: "action_disconnect", position: { x: 0, y: 0 }, data: { play_before_action: "p_goodbye" } },
        { id: "vm_a", type: "voicemail", position: { x: 0, y: 0 }, data: { greeting: "standard", require_pin: true, auto_play: false, announce_datetime: true, email_option: "none" } },
        { id: "vm_b", type: "voicemail", position: { x: 0, y: 0 }, data: { greeting: "standard", require_pin: true, auto_play: false, announce_datetime: true, email_option: "none" } },
      ] as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: [
        { id: "e1", source: "src1", sourceHandle: "next", target: "vm_a", targetHandle: "in" },
        { id: "e2", source: "src2", sourceHandle: "next", target: "vm_b", targetHandle: "in" },
      ] as any,
    });

    const removed = useFlowStore.getState().mergeIdenticalTerminals();
    expect(removed).toBe(1);

    const snap = snapshotIds();
    expect(snap.nodes).toEqual(expect.arrayContaining(["src1", "src2", "vm_a"]));
    expect(snap.nodes).not.toContain("vm_b");
    // Both inbound edges now point at the canonical (vm_a).
    expect(snap.edges).toEqual(
      expect.arrayContaining([
        { source: "src1", target: "vm_a" },
        { source: "src2", target: "vm_a" },
      ]),
    );
  });

  it("returns 0 when no duplicates exist", () => {
    loadFixture({
      ...baseFlow(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: [
        { id: "vm_a", type: "voicemail", position: { x: 0, y: 0 }, data: { greeting: "standard", require_pin: true, auto_play: false, announce_datetime: true, email_option: "none" } },
        { id: "vm_b", type: "voicemail", position: { x: 0, y: 0 }, data: { greeting: "extended", require_pin: true, auto_play: false, announce_datetime: true, email_option: "none" } },
      ] as any,
      edges: [],
    });
    expect(useFlowStore.getState().mergeIdenticalTerminals()).toBe(0);
    expect(snapshotIds().nodes).toEqual(["vm_a", "vm_b"]);
  });

  it("does not merge process kinds even with identical data", () => {
    loadFixture({
      ...baseFlow(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: [
        { id: "t1", type: "action_transfer", position: { x: 0, y: 0 }, data: { mode: "extension" } },
        { id: "t2", type: "action_transfer", position: { x: 0, y: 0 }, data: { mode: "extension" } },
      ] as any,
      edges: [],
    });
    expect(useFlowStore.getState().mergeIdenticalTerminals()).toBe(0);
  });

  it("dedupes overlapping inbound edges that emerge from the rewire", () => {
    loadFixture({
      ...baseFlow(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: [
        { id: "src", type: "action_disconnect", position: { x: 0, y: 0 }, data: {} },
        { id: "d1", type: "term_dropped", position: { x: 0, y: 0 }, data: {} },
        { id: "d2", type: "term_dropped", position: { x: 0, y: 0 }, data: {} },
      ] as any,
      // Two edges from the same source: one to each terminal. After merge, both
      // would target the same canonical — dedupe should fold them into one edge.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: [
        { id: "e1", source: "src", sourceHandle: "next", target: "d1", targetHandle: "in" },
        { id: "e2", source: "src", sourceHandle: "next", target: "d2", targetHandle: "in" },
      ] as any,
    });

    const removed = useFlowStore.getState().mergeIdenticalTerminals();
    expect(removed).toBe(1);
    const snap = snapshotIds();
    expect(snap.edges.length).toBe(1);
  });
});
