import { describe, expect, it, beforeEach } from "vitest";
import { simulate } from "@/simulator/engine";
import { mkAaFlow, mkNode, resetIds } from "./helpers";
import type { SimulatorInput } from "@/simulator/types";

const baseInput: SimulatorInput = {
  caller: "+14155550101",
  callee: "18005551234",
  time: "2026-05-17T12:00:00Z",
  active_periods: ["business_hours"],
};

beforeEach(() => resetIds());

describe("Auto Attendant simulator (§13.2)", () => {
  it("reject answering mode → rejected", () => {
    const flow = mkAaFlow([
      mkNode("menu_root", {}, "root"),
      mkNode("answering_mode_aa", { mode: "reject" }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("rejected");
  });

  it("plays intro and menu prompts on entry", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          intro_prompt: "p_intro",
          menu_prompt: "p_menu",
          actions: { "1": { target_node_id: "disc" } },
        },
        "root",
      ),
      mkNode("action_disconnect", {}, "disc"),
    ]);
    const t = simulate(flow, { ...baseInput, press_sequence: ["1"] });
    expect(t.prompts).toContain("p_intro");
    expect(t.prompts).toContain("p_menu");
    expect(t.terminal).toBe("disconnected");
  });

  it("inactive sub-menu routes to its inactive_action_node_id", () => {
    // ROOT (always-active) routes '1' to a custom menu that is gated to business_hours.
    // When business_hours is NOT in active_periods, the custom menu's inactive_action fires.
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        { actions: { "1": { target_node_id: "hours" } } },
        "root",
      ),
      mkNode(
        "menu_custom",
        {
          name: "Hours",
          active_period: "business_hours",
          inactive_action_node_id: "afterhours",
          actions: {},
        },
        "hours",
      ),
      mkNode(
        "action_disconnect",
        { play_before_action: "p_closed" },
        "afterhours",
      ),
    ]);
    const t = simulate(flow, {
      ...baseInput,
      active_periods: [],
      press_sequence: ["1"],
    });
    expect(t.terminal).toBe("disconnected");
    expect(t.prompts).toContain("p_closed");
  });

  it("press '1' executes that menu action", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          actions: {
            "1": { target_node_id: "vm" },
          },
        },
        "root",
      ),
      mkNode("voicemail", { greeting: "standard" }, "vm"),
    ]);
    const t = simulate(flow, { ...baseInput, press_sequence: ["1"] });
    expect(t.terminal).toBe("voicemail_left");
  });

  it("no input triggers no_input action", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          actions: { no_input: { target_node_id: "disc" } },
        },
        "root",
      ),
      mkNode("action_disconnect", {}, "disc"),
    ]);
    const t = simulate(flow, { ...baseInput, press_sequence: [] });
    expect(t.terminal).toBe("disconnected");
  });

  it("dial-by-name unique match → answered", () => {
    const flow = mkAaFlow(
      [
        mkNode(
          "menu_root",
          { actions: { "9": { target_node_id: "dbn" } } },
          "root",
        ),
        mkNode("action_dial_by_name", {}, "dbn"),
      ],
      [
        { extension: "201", name: "Bob Lee" },
        { extension: "202", name: "Carol Day" },
      ],
    );
    // Press 9 → enter dial-by-name. Then 2-2-5 (B-A-J? no, 2=ABC, 2=ABC, 5=JKL).
    // We want "BOB" → 2,6,2 since B=2 O=6 B=2.
    const t = simulate(flow, { ...baseInput, press_sequence: ["9", "2", "6", "2"] });
    expect(t.terminal).toBe("answered");
    expect(t.terminal_detail).toContain("201");
  });

  it("dial-by-name announces matched extension when announce_extensions is on", () => {
    const flow = mkAaFlow(
      [
        mkNode("menu_root", { actions: { "9": { target_node_id: "dbn" } } }, "root"),
        mkNode("action_dial_by_name", { announce_extensions: true }, "dbn"),
      ],
      [{ extension: "201", name: "Bob Lee" }],
    );
    const t = simulate(flow, { ...baseInput, press_sequence: ["9", "2", "6", "2"] });
    expect(t.terminal).toBe("answered");
    expect(t.prompts).toContain("ext_201");
  });

  it("dial-by-name no match → dropped", () => {
    const flow = mkAaFlow(
      [
        mkNode("menu_root", { actions: { "9": { target_node_id: "dbn" } } }, "root"),
        mkNode("action_dial_by_name", {}, "dbn"),
      ],
      [{ extension: "201", name: "Bob Lee" }],
    );
    const t = simulate(flow, { ...baseInput, press_sequence: ["9", "9", "9", "9"] });
    expect(t.terminal).toBe("dropped");
  });

  it("direct-dial: press digits of a published extension bypasses menu actions", () => {
    const flow = mkAaFlow(
      [
        mkNode(
          "menu_root",
          {
            allow_direct_dial: true,
            interdigit_timeout_s: 5,
            actions: { "2": { target_node_id: "vm" } }, // would route '2' to voicemail without direct-dial
          },
          "root",
        ),
        mkNode("voicemail", {}, "vm"),
      ],
      [{ extension: "2145", name: "Alice Smith" }],
    );
    const t = simulate(flow, { ...baseInput, press_sequence: ["2", "1", "4", "5"] });
    expect(t.terminal).toBe("answered");
    expect(t.terminal_detail).toContain("2145");
  });

  it("goto_menu jumps into custom menu", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        { actions: { "1": { target_node_id: "goto" } } },
        "root",
      ),
      mkNode("action_goto_menu", { target_menu_node_id: "sales" }, "goto"),
      mkNode(
        "menu_custom",
        {
          name: "Sales",
          active_period: "always",
          actions: { "1": { target_node_id: "vm" } },
        },
        "sales",
      ),
      mkNode("voicemail", {}, "vm"),
    ]);
    const t = simulate(flow, { ...baseInput, press_sequence: ["1", "1"] });
    expect(t.terminal).toBe("voicemail_left");
    expect(t.steps.some((s) => s.message.includes("Sales"))).toBe(true);
  });

  it("retries on invalid input up to max_input_errors then disconnects", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          menu_prompt: "p_menu",
          max_input_errors: 3,
          on_unavailable_prompt: "aa_disabled",
          max_fails_prompt: "max_fails",
          actions: { "1": { target_node_id: "vm" } },
        },
        "root",
      ),
      mkNode("voicemail", {}, "vm"),
    ]);
    // Three invalid keys in a row → max_fails prompt → disconnected.
    const t = simulate(flow, { ...baseInput, press_sequence: ["5", "5", "5"] });
    expect(t.terminal).toBe("disconnected");
    expect(t.terminal_detail).toContain("Max input errors");
    // aa_disabled prompt should play 3 times, max_fails once.
    expect(t.prompts.filter((p) => p === "aa_disabled")).toHaveLength(3);
    expect(t.prompts).toContain("max_fails");
  });

  it("invalid then valid input — caller recovers without hitting max", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          menu_prompt: "p_menu",
          max_input_errors: 3,
          actions: { "1": { target_node_id: "vm" } },
        },
        "root",
      ),
      mkNode("voicemail", {}, "vm"),
    ]);
    const t = simulate(flow, { ...baseInput, press_sequence: ["8", "1"] });
    expect(t.terminal).toBe("voicemail_left");
  });

  it("no-input loop disconnects after max_input_errors when no `no_input` action set", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          menu_prompt: "p_menu",
          max_input_errors: 2,
          on_timeout_prompt: "aa_timeout",
          actions: { "1": { target_node_id: "vm" } },
        },
        "root",
      ),
      mkNode("voicemail", {}, "vm"),
    ]);
    const t = simulate(flow, { ...baseInput, press_sequence: [] });
    expect(t.terminal).toBe("disconnected");
    expect(t.prompts.filter((p) => p === "aa_timeout")).toHaveLength(2);
  });

  it("prompt-for-extension clamps consumed digits to max_digits", () => {
    const flow = mkAaFlow(
      [
        mkNode("menu_root", { actions: { "5": { target_node_id: "pfx" } } }, "root"),
        mkNode("action_prompt_extension", { max_digits: 3 }, "pfx"),
      ],
      [
        { extension: "201", name: "Alice" },
        { extension: "2014", name: "Alice-Ext" },
      ],
    );
    // Press 5, then 2-0-1-4. Action takes max 3 digits → "201" → matches Alice.
    const t = simulate(flow, { ...baseInput, press_sequence: ["5", "2", "0", "1", "4"] });
    expect(t.terminal).toBe("answered");
    expect(t.terminal_detail).toContain("201");
    // Without clamping, "2014" would match Alice-Ext instead.
    expect(t.terminal_detail).not.toContain("2014");
  });

  it("prompt-for-extension reports max-digits limit on no match", () => {
    const flow = mkAaFlow(
      [
        mkNode("menu_root", { actions: { "5": { target_node_id: "pfx" } } }, "root"),
        mkNode("action_prompt_extension", { max_digits: 3 }, "pfx"),
      ],
      [{ extension: "9999", name: "Other" }],
    );
    const t = simulate(flow, { ...baseInput, press_sequence: ["5", "1", "2", "3", "4"] });
    expect(t.terminal).toBe("dropped");
    expect(t.terminal_detail).toMatch(/max 3 digits/);
  });

  it("ROOT can be gated to a time interval (per PortaOne docs)", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          active_period: "business_hours",
          inactive_action_node_id: "afterhours",
          actions: {},
        },
        "root",
      ),
      mkNode("action_disconnect", { play_before_action: "p_closed" }, "afterhours"),
    ]);
    // No business_hours active → ROOT inactive → falls through to afterhours action.
    const t = simulate(flow, { ...baseInput, active_periods: [], press_sequence: [] });
    expect(t.terminal).toBe("disconnected");
    expect(t.prompts).toContain("p_closed");
  });

  it("PRD §11.3 inactive-after-hours example", () => {
    const flow = mkAaFlow([
      mkNode(
        "menu_root",
        {
          intro_prompt: "prompt_welcome",
          menu_prompt: "prompt_root_options",
          allow_direct_dial: true,
          interdigit_timeout_s: 5,
          inactive_action_node_id: "after_hours",
          actions: {
            "9": { target_node_id: "disc", play_before_action: "prompt_goodbye" },
            no_input: { target_node_id: "disc" },
          },
        },
        "n_root",
      ),
      mkNode("action_disconnect", { play_before_action: "prompt_goodbye" }, "disc"),
      mkNode("action_disconnect", { play_before_action: "prompt_afterhours" }, "after_hours"),
    ]);
    // ROOT.active_period = "always", so it's active. Press [] → no_input → disconnect.
    const t = simulate(flow, { ...baseInput, press_sequence: [] });
    expect(t.terminal).toBe("disconnected");
  });
});
