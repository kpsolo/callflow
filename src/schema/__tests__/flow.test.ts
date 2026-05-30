import { describe, expect, it } from "vitest";
import { FlowSchema, SCHEMA_VERSION, emptyFlow } from "@/schema";

describe("Flow schema", () => {
  it("empty AA flow round-trips through Zod", () => {
    const flow = emptyFlow({
      type: "auto_attendant",
      id: "aa_1",
      did: "+18005551234",
      name: "Acme main",
      directory: [],
    });
    const parsed = FlowSchema.parse(JSON.parse(JSON.stringify(flow)));
    expect(parsed.schema_version).toBe(SCHEMA_VERSION);
    expect(parsed.entity.type).toBe("auto_attendant");
    expect(parsed.nodes).toEqual([]);
  });

  it("PRD §11.3 example AA shape parses", () => {
    const flow = {
      schema_version: "1.0",
      entity: {
        type: "auto_attendant",
        id: "aa_18005551234",
        did: "+18005551234",
        name: "SmartDesign main line",
        directory: [
          { extension: "2145", name: "Alice Smith", published: true },
          { extension: "301", name: "Bob Lee", published: true },
        ],
      },
      nodes: [
        {
          id: "n_root",
          type: "menu_root",
          position: { x: 0, y: 0 },
          data: {
            name: "ROOT",
            active_period: "always",
            intro_prompt: "prompt_welcome",
            menu_prompt: "prompt_root_options",
            no_input: { timeout_s: 9, action_node_id: "n_disconnect" },
            allow_direct_dial: true,
            interdigit_timeout_s: 5,
            inactive_action_node_id: "n_after_hours",
            actions: {
              "1": { target_node_id: "n_sales" },
              "2": { target_node_id: "q_support" },
              "9": { target_node_id: "n_disconnect", play_before_action: "prompt_goodbye" },
              fax: { target_node_id: "n_voicemail" },
              no_input: { target_node_id: "n_disconnect" },
            },
          },
        },
        {
          id: "n_disconnect",
          type: "action_disconnect",
          position: { x: 200, y: 0 },
          data: { play_before_action: "prompt_goodbye" },
        },
      ],
      edges: [
        { id: "e1", source: "n_root", sourceHandle: "1", target: "n_sales" },
        { id: "e2", source: "n_root", sourceHandle: "9", target: "n_disconnect" },
      ],
      scenarios: [
        {
          name: "After hours caller hangs up",
          caller: "+14155550101",
          callee: "18005551234",
          time: "2026-05-17T22:30:00Z",
          press_sequence: [],
          answering_behavior: [],
          expected_terminal: "disconnected",
        },
      ],
    };
    const parsed = FlowSchema.parse(flow);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.scenarios[0].name).toBe("After hours caller hangs up");
  });

  it("rejects 2.x schema_version", () => {
    const result = FlowSchema.safeParse({
      schema_version: "2.0",
      entity: { type: "extension", id: "x", extension: "401", name: "x" },
      nodes: [],
      edges: [],
      scenarios: [],
    });
    expect(result.success).toBe(false);
  });

  it("round-trips JSON without data loss", () => {
    const flow = emptyFlow({
      type: "extension",
      id: "ext_401",
      extension: "401",
      name: "Sales lead",
    });
    flow.nodes.push({
      id: "n_screen",
      type: "screening_rule",
      position: { x: 50, y: 50 },
      data: {
        id: "vip_rule",
        name: "VIP",
        order: 0,
        enabled: true,
        conditions: {
          time_period: "always",
          caller: { kind: "prefix", value: "+1415" },
          callee: { kind: "any" },
        },
        action_mode: "ring_only",
      },
    });
    const serialized = JSON.stringify(flow);
    const parsed = FlowSchema.parse(JSON.parse(serialized));
    expect(parsed).toEqual(flow);
  });
});
