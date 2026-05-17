import { describe, expect, it } from "vitest";
import { FlowSchema } from "@/schema";
import { acmeHqMultiDept } from "@/fixtures/acmeHqMultiDept";
import { simulate } from "@/simulator/engine";
import { validate, hasErrors } from "@/validation/validate";

describe("Acme HQ multi-dept fixture", () => {
  it("parses through the schema (round-trip)", () => {
    const json = JSON.parse(JSON.stringify(acmeHqMultiDept));
    const parsed = FlowSchema.parse(json);
    expect(parsed.nodes.length).toBe(acmeHqMultiDept.nodes.length);
  });

  it("passes validation with no errors", () => {
    const issues = validate(acmeHqMultiDept);
    expect(
      hasErrors(issues),
      `Validation errors:\n${issues.filter((i) => i.severity === "error").map((i) => `  ${i.code}: ${i.message}`).join("\n")}`,
    ).toBe(false);
  });

  it("each scenario's expected_terminal matches simulator output", () => {
    const failures: string[] = [];
    for (const s of acmeHqMultiDept.scenarios) {
      const t = simulate(acmeHqMultiDept, {
        caller: s.caller,
        callee: s.callee,
        time: s.time,
        active_mode: s.active_mode,
        press_sequence: s.press_sequence,
        answering_behavior: s.answering_behavior,
        // No active_periods override — period activity is computed from `time`
        // against entity.time_periods.
      });
      if (s.expected_terminal && t.terminal !== s.expected_terminal) {
        failures.push(
          `${s.name}: expected ${s.expected_terminal}, got ${t.terminal} (${t.terminal_detail ?? ""})`,
        );
      }
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});
