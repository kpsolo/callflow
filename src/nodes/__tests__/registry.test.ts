import { describe, expect, it } from "vitest";
import { FlowNodeSchema, NODE_KINDS, type NodeKind } from "@/schema";
import { NODE_TYPES } from "@/nodes/registry";

describe("Node registry", () => {
  it("has an entry for every NodeKind", () => {
    for (const k of NODE_KINDS) {
      expect(NODE_TYPES[k], `missing registry entry for ${k}`).toBeDefined();
      expect(NODE_TYPES[k].kind).toBe(k);
    }
  });

  it("defaultData produces schema-valid node data for every kind", () => {
    for (const k of NODE_KINDS) {
      const data = NODE_TYPES[k].defaultData();
      const result = FlowNodeSchema.safeParse({
        id: `n_${k}`,
        type: k,
        position: { x: 0, y: 0 },
        data,
      });
      if (!result.success) {
        throw new Error(`${k} defaultData fails schema: ${JSON.stringify(result.error.issues)}`);
      }
    }
  });

  it("ROOT menu is paletteHidden and singleton", () => {
    expect(NODE_TYPES.menu_root.paletteHidden).toBe(true);
    expect(NODE_TYPES.menu_root.singletonPerEntity).toBe(true);
  });

  it("terminals have no outputs; entry points have no inputs", () => {
    const terminals: NodeKind[] = [
      "term_answered",
      "term_voicemail_left",
      "term_forwarded_answered",
      "term_forwarded_unanswered",
      "term_rejected",
      "term_dropped",
    ];
    for (const k of terminals) expect(NODE_TYPES[k].outputs).toHaveLength(0);
    expect(NODE_TYPES.incoming_call.inputs).toHaveLength(0);
    expect(NODE_TYPES.outgoing_call.inputs).toHaveLength(0);
  });
});
