import { describe, expect, it } from "vitest";
import { getEdgeStyle, styleEdges } from "@/canvas/edgeStyle";

const e = (sourceHandle: string) => ({
  id: "e",
  source: "a",
  target: "b",
  sourceHandle,
});

describe("getEdgeStyle", () => {
  it("uses solid grey for the default `next` handle", () => {
    const s = getEdgeStyle(e("next"));
    expect(s.style.stroke).toBe("#6b7280");
    expect(s.style.strokeDasharray).toBeUndefined();
  });

  it("assigns a per-digit color to menu:N handles", () => {
    expect(getEdgeStyle(e("menu:1")).style.stroke).not.toBe(
      getEdgeStyle(e("menu:2")).style.stroke,
    );
  });

  it("marks `inactive` as dashed warn", () => {
    const s = getEdgeStyle(e("inactive"));
    expect(s.style.stroke).toBe("#ffb454");
    expect(s.style.strokeDasharray).toBeTruthy();
  });

  it("marks `no_input` and menu:no_input as dotted yellow", () => {
    expect(getEdgeStyle(e("no_input")).style.stroke).toBe("#facc15");
    expect(getEdgeStyle(e("menu:no_input")).style.stroke).toBe("#facc15");
  });

  it("marks `fax` and menu:fax as dotted blue", () => {
    expect(getEdgeStyle(e("fax")).style.stroke).toBe("#60a5fa");
    expect(getEdgeStyle(e("menu:fax")).style.stroke).toBe("#60a5fa");
  });

  it("styleEdges preserves edge identity but adds style props", () => {
    const styled = styleEdges([e("menu:1"), e("inactive")]);
    expect(styled[0].id).toBe("e");
    expect(styled[0].source).toBe("a");
    expect(styled[1].style?.strokeDasharray).toBeTruthy();
  });

  it("styleEdges dashes edges originating from a cond_time node", () => {
    const edge = { id: "e1", source: "ct", target: "x", sourceHandle: "true" };
    const nodes = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "ct", type: "cond_time", position: { x: 0, y: 0 }, data: { period: "business_hours" } } as any,
    ];
    const styled = styleEdges([edge], nodes);
    expect(styled[0].style?.strokeDasharray).toBe("6 4");
  });

  it("styleEdges dashes edges from a menu with a non-always active_period", () => {
    const edge = { id: "e1", source: "m", target: "x", sourceHandle: "menu:1" };
    const nodes = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "m", type: "menu_custom", position: { x: 0, y: 0 }, data: { active_period: "business_hours" } } as any,
    ];
    const styled = styleEdges([edge], nodes);
    expect(styled[0].style?.strokeDasharray).toBe("6 4");
  });

  it("styleEdges leaves edges from a menu with active_period 'always' as solid", () => {
    const edge = { id: "e1", source: "m", target: "x", sourceHandle: "menu:1" };
    const nodes = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "m", type: "menu_custom", position: { x: 0, y: 0 }, data: { active_period: "always" } } as any,
    ];
    const styled = styleEdges([edge], nodes);
    expect(styled[0].style?.strokeDasharray).toBeUndefined();
  });
});
