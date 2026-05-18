import { beforeEach, describe, expect, it } from "vitest";
import { simulate } from "@/simulator/engine";
import { mkExtFlow, mkNode, resetIds } from "./helpers";
import type { SimulatorInput } from "@/simulator/types";

const baseInput: SimulatorInput = {
  caller: "+14155550101",
  callee: "401",
  time: "2026-05-18T10:00:00Z",
};

beforeEach(() => resetIds());

describe("call recording (MR129)", () => {
  it("automatic mode records every answered leg", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only", ring_timeout_s: 20 }),
      mkNode("call_recording", { mode: "automatic", format: "mp3" }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("answered");
    const started = t.side_effects.filter((s) => s.kind === "recording_started");
    expect(started).toHaveLength(1);
    expect(started[0].detail).toContain("format=mp3");
  });

  it("on-demand mode without allow_manual_start_stop never records", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", { mode: "on_demand", allow_manual_start_stop: false }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.terminal).toBe("answered");
    expect(t.side_effects.find((s) => s.kind === "recording_started")).toBeUndefined();
  });

  it("on-demand records when caller starts it and announces both prompts on stop", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", {
        mode: "on_demand",
        allow_manual_start_stop: true,
        announce_to_all: true,
        announce_started_prompt: "rec_started",
        announce_stopped_prompt: "rec_stopped",
      }),
    ]);
    const t = simulate(flow, { ...baseInput, manual_record: "started_stopped" });
    expect(t.terminal).toBe("answered");
    expect(t.side_effects.find((s) => s.kind === "recording_started")).toBeTruthy();
    expect(t.side_effects.find((s) => s.kind === "recording_stopped")).toBeTruthy();
    expect(t.prompts).toContain("rec_started");
    expect(t.prompts).toContain("rec_stopped");
  });

  it("on-demand without stop emits start only (no stop event)", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", {
        mode: "on_demand",
        allow_manual_start_stop: true,
      }),
    ]);
    const t = simulate(flow, { ...baseInput, manual_record: "started" });
    expect(t.side_effects.find((s) => s.kind === "recording_started")).toBeTruthy();
    expect(t.side_effects.find((s) => s.kind === "recording_stopped")).toBeUndefined();
  });

  it("transcription emits queued side-effect after the recording starts", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", {
        mode: "automatic",
        enable_transcription: true,
        send_to_email: "ops@acme.example",
      }),
    ]);
    const t = simulate(flow, baseInput);
    const tx = t.side_effects.find((s) => s.kind === "transcription_queued");
    expect(tx).toBeTruthy();
    expect(tx?.detail).toContain("ops@acme.example");
  });

  it("private_to_owner annotates the recording_started detail", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", { mode: "automatic", private_to_owner: true }),
    ]);
    const t = simulate(flow, baseInput);
    const started = t.side_effects.find((s) => s.kind === "recording_started");
    expect(started?.detail).toContain("private");
  });

  it("legacy `announce` + `announce_prompt` still trigger the started prompt", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", {
        announce: true,
        announce_prompt: "legacy_prompt",
      }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.prompts).toContain("legacy_prompt");
  });

  it("announcement off → no prompt plays even when started prompt is set", () => {
    const flow = mkExtFlow([
      mkNode("answering_mode_ext", { mode: "ring_only" }),
      mkNode("call_recording", {
        mode: "automatic",
        announce_to_all: false,
        announce_started_prompt: "rec_started",
      }),
    ]);
    const t = simulate(flow, baseInput);
    expect(t.prompts).not.toContain("rec_started");
    // Recording itself still fires.
    expect(t.side_effects.find((s) => s.kind === "recording_started")).toBeTruthy();
  });
});
