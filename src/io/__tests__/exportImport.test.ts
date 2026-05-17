import { describe, expect, it } from "vitest";
import { parseAndValidate, serialize } from "@/io/exportImport";
import { mkAaFlow, mkNode, resetIds } from "@/simulator/__tests__/helpers";

describe("Import/export", () => {
  it("round-trips a flow through JSON without data loss", () => {
    resetIds();
    const flow = mkAaFlow([
      mkNode("menu_root", { actions: { "1": { target_node_id: "vm" } } }, "root"),
      mkNode("voicemail", { email_option: "forward", email_address: "ops@example.com" }, "vm"),
    ]);
    const json = serialize(flow);
    const result = parseAndValidate(json);
    expect(result.ok).toBe(true);
    expect(result.flow).toEqual(flow);
  });

  it("rejects invalid JSON", () => {
    const result = parseAndValidate("{ this is not json");
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toMatch(/Invalid JSON/);
  });

  it("rejects schema_version 2.x", () => {
    const result = parseAndValidate(
      JSON.stringify({
        schema_version: "2.0",
        entity: { type: "extension", id: "x", extension: "401", name: "x" },
        nodes: [],
        edges: [],
        scenarios: [],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toMatch(/Unsupported schema_version/);
  });

  it("rejects schema violations with field paths", () => {
    const result = parseAndValidate(
      JSON.stringify({
        schema_version: "1.0",
        entity: { type: "extension", id: "x", extension: "401", name: "x" },
        nodes: [
          { id: "n", type: "voicemail", position: { x: 0, y: 0 }, data: { email_option: "weird" } },
        ],
        edges: [],
        scenarios: [],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.some((m) => m.includes("email_option"))).toBe(true);
  });
});
