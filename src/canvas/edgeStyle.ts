import type { Edge } from "reactflow";

/**
 * Visual edge-style vocabulary.
 *
 *   sourceHandle / label  ->  style
 *   --------------------------- ---
 *   "next" (default)            solid grey
 *   menu:0..9, menu:#, menu:*   solid + a stable color per digit
 *   menu:no_input | "no_input"  dashed amber-ish (timeout fallback)
 *   menu:fax | "fax"            dotted blue (event-triggered)
 *   "inactive"                  dashed warn (menu-inactive fallback)
 *   anything else               solid grey
 */

const DIGIT_PALETTE: Record<string, string> = {
  "0": "#94a3b8",
  "1": "#60a5fa",
  "2": "#34d399",
  "3": "#facc15",
  "4": "#fb923c",
  "5": "#f87171",
  "6": "#c084fc",
  "7": "#22d3ee",
  "8": "#a3e635",
  "9": "#f472b6",
  "*": "#94a3b8",
  "#": "#94a3b8",
};

const DEFAULT_STROKE = "#6b7280"; // matches --text-dim-ish
const STROKE_WIDTH_DEFAULT = 2;
const STROKE_WIDTH_EMPHASIS = 2.5;

export interface EdgeStyleProps {
  style: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  labelBgStyle?: React.CSSProperties;
  animated?: boolean;
}

export function getEdgeStyle(edge: Edge): EdgeStyleProps {
  const handle = edge.sourceHandle ?? "";

  // Digit key from a menu (menu:1, menu:#, etc.)
  if (handle.startsWith("menu:")) {
    const key = handle.slice("menu:".length);
    if (key in DIGIT_PALETTE) {
      const color = DIGIT_PALETTE[key];
      return {
        style: { stroke: color, strokeWidth: STROKE_WIDTH_EMPHASIS },
        labelStyle: { fill: color, fontWeight: 600 },
      };
    }
    if (key === "no_input") return noInputStyle();
    if (key === "fax") return faxStyle();
  }

  if (handle === "no_input") return noInputStyle();
  if (handle === "fax") return faxStyle();
  if (handle === "inactive") return inactiveStyle();

  // Forwarding outcome / screening outcome / generic next — solid grey default.
  return {
    style: { stroke: DEFAULT_STROKE, strokeWidth: STROKE_WIDTH_DEFAULT },
  };
}

function inactiveStyle(): EdgeStyleProps {
  // Dashed warn-orange — fallback flow when a menu is closed (after-hours, etc.).
  return {
    style: {
      stroke: "#ffb454",
      strokeWidth: STROKE_WIDTH_EMPHASIS,
      strokeDasharray: "6 4",
    },
    labelStyle: { fill: "#ffb454", fontWeight: 600 },
    labelBgStyle: { fill: "rgba(255,180,84,0.12)" },
  };
}

function noInputStyle(): EdgeStyleProps {
  return {
    style: {
      stroke: "#facc15",
      strokeWidth: STROKE_WIDTH_DEFAULT,
      strokeDasharray: "2 4",
    },
    labelStyle: { fill: "#facc15" },
  };
}

function faxStyle(): EdgeStyleProps {
  return {
    style: {
      stroke: "#60a5fa",
      strokeWidth: STROKE_WIDTH_DEFAULT,
      strokeDasharray: "2 4",
    },
    labelStyle: { fill: "#60a5fa" },
  };
}

/**
 * Apply styles to every edge in an array. Cheap to call from React.useMemo;
 * preserves existing `id`, `source`, `target`, etc.
 */
export function styleEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => {
    const s = getEdgeStyle(e);
    return {
      ...e,
      style: { ...(e.style ?? {}), ...s.style },
      labelStyle: { ...(e.labelStyle ?? {}), ...(s.labelStyle ?? {}) },
      labelBgStyle: { ...(e.labelBgStyle ?? {}), ...(s.labelBgStyle ?? {}) },
      animated: s.animated ?? e.animated,
    };
  });
}
