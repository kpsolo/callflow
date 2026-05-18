import { describe, expect, it } from "vitest";
import { validate, hasErrors } from "@/validation/validate";
import { mkAaFlow, mkExtFlow, mkNode, resetIds } from "@/simulator/__tests__/helpers";

describe("Validation", () => {
  it("flags AA flow with no ROOT", () => {
    resetIds();
    const flow = mkAaFlow([]);
    const issues = validate(flow);
    expect(issues.some((i) => i.code === "root_missing")).toBe(true);
    expect(hasErrors(issues)).toBe(true);
  });

  it("flags duplicate ROOT", () => {
    resetIds();
    const flow = mkAaFlow([
      mkNode("menu_root", {}, "r1"),
      mkNode("menu_root", {}, "r2"),
    ]);
    expect(validate(flow).some((i) => i.code === "root_duplicate")).toBe(true);
  });

  it("flags missing menu action target", () => {
    resetIds();
    const flow = mkAaFlow([
      mkNode("menu_root", { actions: { "1": { target_node_id: "ghost" } } }, "root"),
    ]);
    expect(validate(flow).some((i) => i.code === "menu_action_ref")).toBe(true);
  });

  it("flags voicemail with email_option but no address", () => {
    resetIds();
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "voicemail_only" }),
      mkNode("voicemail", { email_option: "forward" }),
    ]);
    expect(validate(flow).some((i) => i.code === "voicemail_email_address")).toBe(true);
  });

  it("flags answering mode that needs forwarding when none exists", () => {
    resetIds();
    const flow = mkExtFlow([mkNode("answering_mode_ext", { mode: "ring_then_forward" })]);
    expect(validate(flow).some((i) => i.code === "mode_missing_forward")).toBe(true);
  });

  it("warns when forwarding has no enabled rules", () => {
    resetIds();
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_then_forward" }),
      mkNode("forward_follow_me", { rules: [] }),
    ]);
    const issues = validate(flow);
    expect(issues.some((i) => i.code === "forward_no_rules" && i.severity === "warning")).toBe(
      true,
    );
  });

  it("warns when call recording is on-demand but manual start/stop is disabled", () => {
    resetIds();
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", {
        mode: "on_demand",
        allow_manual_start_stop: false,
      }),
    ]);
    const issues = validate(flow);
    expect(
      issues.some((i) => i.code === "recording_on_demand_disabled" && i.severity === "warning"),
    ).toBe(true);
  });

  it("warns when call recording announcement is on but no started-prompt is set", () => {
    resetIds();
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", { mode: "automatic", announce_to_all: true }),
    ]);
    const issues = validate(flow);
    expect(
      issues.some((i) => i.code === "recording_announce_no_prompt" && i.severity === "warning"),
    ).toBe(true);
  });

  it("warns when forwarding exists but answering mode never triggers Forward", () => {
    resetIds();
    // ring_only does not include Forward; forwarding nodes would be unreachable.
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("forward_simple", { target_number: "+15551111111", timeout_s: 20 }),
    ]);
    const issues = validate(flow);
    expect(issues.some((i) => i.code === "forward_unreachable" && i.severity === "warning")).toBe(
      true,
    );
  });

  it("clean AA with ROOT and a disconnect action passes", () => {
    resetIds();
    const flow = mkAaFlow([
      mkNode("menu_root", { actions: { no_input: { target_node_id: "d" } } }, "root"),
      mkNode("action_disconnect", {}, "d"),
    ]);
    expect(hasErrors(validate(flow))).toBe(false);
  });
});
