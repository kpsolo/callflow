import { describe, expect, it } from "vitest";
import { FlowSchema } from "@/schema";
import { acmeHqMultiDept } from "@/fixtures/acmeHqMultiDept";
import { cloneFlowWithFreshIds } from "@/state/cloneFlow";

describe("cloneFlowWithFreshIds", () => {
  it("re-mints every node id — no id appears in both source and clone", () => {
    const clone = cloneFlowWithFreshIds(acmeHqMultiDept);

    expect(clone.nodes.length).toBe(acmeHqMultiDept.nodes.length);

    const srcIds = new Set(acmeHqMultiDept.nodes.map((n) => n.id));
    const cloneIds = new Set(clone.nodes.map((n) => n.id));
    const overlap = [...cloneIds].filter((id) => srcIds.has(id));
    expect(overlap).toEqual([]);
  });

  it("re-mints every edge id", () => {
    const clone = cloneFlowWithFreshIds(acmeHqMultiDept);
    const srcEdgeIds = new Set(acmeHqMultiDept.edges.map((e) => e.id));
    for (const e of clone.edges) {
      expect(srcEdgeIds.has(e.id)).toBe(false);
    }
  });

  it("rewires edge source/target to the new ids", () => {
    const clone = cloneFlowWithFreshIds(acmeHqMultiDept);
    const cloneNodeIds = new Set(clone.nodes.map((n) => n.id));
    for (const e of clone.edges) {
      expect(cloneNodeIds.has(e.source)).toBe(true);
      expect(cloneNodeIds.has(e.target)).toBe(true);
    }
  });

  it("rewrites *_node_id references inside node data", () => {
    const clone = cloneFlowWithFreshIds(acmeHqMultiDept);
    const cloneNodeIds = new Set(clone.nodes.map((n) => n.id));
    const srcNodeIds = new Set(acmeHqMultiDept.nodes.map((n) => n.id));

    const visit = (value: unknown): void => {
      if (value === null || value === undefined) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== "object") return;
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === "string" && k.endsWith("_node_id")) {
          expect(srcNodeIds.has(v)).toBe(false);
          expect(cloneNodeIds.has(v)).toBe(true);
        } else {
          visit(v);
        }
      }
    };

    for (const n of clone.nodes) visit(n.data);
  });

  it("produces a flow that still passes the schema", () => {
    const clone = cloneFlowWithFreshIds(acmeHqMultiDept);
    expect(() => FlowSchema.parse(JSON.parse(JSON.stringify(clone)))).not.toThrow();
  });

  it("leaves the source flow untouched", () => {
    const before = JSON.stringify(acmeHqMultiDept);
    cloneFlowWithFreshIds(acmeHqMultiDept);
    expect(JSON.stringify(acmeHqMultiDept)).toBe(before);
  });
});
