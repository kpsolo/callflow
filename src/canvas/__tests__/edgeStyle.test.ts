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
});
