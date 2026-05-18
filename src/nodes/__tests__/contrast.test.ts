import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  pickHeaderText,
  relativeLuminance,
} from "@/nodes/contrast";

describe("contrast helper", () => {
  it("picks dark text where it beats white on contrast (light or saturated colours)", () => {
    expect(pickHeaderText("#f4a261")).toBe("#11161f"); // action orange
    expect(pickHeaderText("#ffd166")).toBe("#11161f"); // condition yellow
    expect(pickHeaderText("#ffb454")).toBe("#11161f"); // answering amber
    expect(pickHeaderText("#06d6a0")).toBe("#11161f"); // forwarding green
    expect(pickHeaderText("#adb5bd")).toBe("#11161f"); // terminal grey
    expect(pickHeaderText("#ef476f")).toBe("#11161f"); // screening — surprising but correct (5.21 vs 3.60)
  });

  it("picks white text where it beats dark", () => {
    expect(pickHeaderText("#9d4edd")).toBe("#fff"); // menu purple — close call (4.55 vs 4.13)
    expect(pickHeaderText("#000000")).toBe("#fff");
  });

  it("luminance is a number in [0, 1]", () => {
    const cases = ["#000000", "#ffffff", "#9d4edd", "#f4a261"];
    for (const c of cases) {
      const l = relativeLuminance(c);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
    expect(relativeLuminance("#000000")).toBeLessThan(0.01);
    expect(relativeLuminance("#ffffff")).toBeGreaterThan(0.99);
  });

  it("pickHeaderText choices clear WCAG AA on action orange", () => {
    // Sanity-check the specific case the audit flagged: white on #f4a261 fails AA,
    // dark on #f4a261 passes — and that's what the helper picks.
    expect(contrastRatio("#fff", "#f4a261")).toBeLessThan(4.5);
    expect(contrastRatio("#11161f", "#f4a261")).toBeGreaterThan(4.5);
    expect(pickHeaderText("#f4a261")).toBe("#11161f");
  });
});
