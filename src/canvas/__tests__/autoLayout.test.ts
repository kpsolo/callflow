import { describe, it, expect } from "vitest";
import type { Node } from "reactflow";
import { estimateNodeDimensions, layoutDagre } from "../autoLayout";
import { validate } from "../../validation/validate";
import { useUiStore } from "../../state/uiStore";
import type { Flow } from "../../schema";

describe("Auto-layout and Overlap Detection", () => {
  it("should estimate default v1 and v2 node sizes correctly", () => {
    const nodeV1: Node = {
      id: "node_1",
      type: "voicemail",
      position: { x: 0, y: 0 },
      data: {
        email_option: "none",
      },
    };
    
    // Test V1 sizing
    useUiStore.getState().setNodeVersion("v1");
    const sizeV1 = estimateNodeDimensions(nodeV1);
    expect(sizeV1.width).toBe(220);
    expect(sizeV1.height).toBeGreaterThan(50);

    // Test V2 sizing
    useUiStore.getState().setNodeVersion("v2");
    const sizeV2 = estimateNodeDimensions(nodeV1);
    expect(sizeV2.width).toBe(280);
    expect(sizeV2.height).toBeGreaterThan(50);
  });

  it("should detect overlapping nodes and generate validation warnings", () => {
    const nodes: Node[] = [
      {
        id: "node_1",
        type: "voicemail",
        position: { x: 100, y: 100 },
        data: {},
        width: 220,
        height: 100,
      },
      {
        id: "node_2",
        type: "action_disconnect",
        position: { x: 110, y: 110 },
        data: {},
        width: 220,
        height: 80,
      },
    ];

    const flow = {
      schema_version: "1.0",
      entity: { type: "auto_attendant", id: "test-aa" },
      nodes: [
        { id: "node_1", type: "voicemail", position: { x: 100, y: 100 }, data: {} },
        { id: "node_2", type: "action_disconnect", position: { x: 110, y: 110 }, data: {} },
      ],
      edges: [],
      scenarios: [],
    } as unknown as Flow;

    const issues = validate(flow, nodes);
    const overlaps = issues.filter((i) => i.code === "node_overlap");
    
    expect(overlaps.length).toBe(2);
    expect(overlaps[0].node_id).toBe("node_1");
    expect(overlaps[1].node_id).toBe("node_2");
  });

  it("should layout nodes cleanly with custom sizes and resolve overlaps", () => {
    const nodes: Node[] = [
      {
        id: "node_1",
        type: "menu_root",
        position: { x: 0, y: 0 },
        data: { name: "ROOT", actions: {} },
        width: 220,
        height: 120,
      },
      {
        id: "node_2",
        type: "action_disconnect",
        position: { x: 0, y: 0 },
        data: {},
        width: 220,
        height: 80,
      },
    ];

    const edges = [
      { id: "e1-2", source: "node_1", target: "node_2" }
    ];

    const positions = layoutDagre(nodes, edges);
    
    expect(positions["node_1"]).toBeDefined();
    expect(positions["node_2"]).toBeDefined();
    
    const pos1 = positions["node_1"];
    const pos2 = positions["node_2"];
    
    const dx = Math.abs(pos1.x - pos2.x);
    const dy = Math.abs(pos1.y - pos2.y);
    
    const overlapX = dx < (220 + 220) / 2;
    const overlapY = dy < (120 + 80) / 2;
    
    expect(overlapX && overlapY).toBe(false);
  });
});
