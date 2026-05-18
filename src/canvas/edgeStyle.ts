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
 *
 * Every labelled edge also gets a solid pill background (canvas-bg fill,
 * 1px stroke in the edge colour) so labels stay legible where edges cross.
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

/** Canvas background colour — labelBgStyle.fill should match. Kept in sync
 *  with `--bg` in src/index.css so label pills "punch out" the dot grid. */
const LABEL_BG_FILL = "#0f1115";

export interface EdgeStyleProps {
  style: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  labelBgStyle?: React.CSSProperties;
  animated?: boolean;
}

interface EdgeStyleInternal extends EdgeStyleProps {
  /** Drives the label-pill border colour. */
  accentColor: string;
}

export function getEdgeStyle(edge: Edge): EdgeStyleProps {
  return getEdgeStyleInternal(edge);
}

function getEdgeStyleInternal(edge: Edge): EdgeStyleInternal {
  const handle = edge.sourceHandle ?? "";

  // Digit key from a menu (menu:1, menu:#, etc.)
  if (handle.startsWith("menu:")) {
    const key = handle.slice("menu:".length);
    if (key in DIGIT_PALETTE) {
      const color = DIGIT_PALETTE[key];
      return {
        style: { stroke: color, strokeWidth: STROKE_WIDTH_EMPHASIS },
        labelStyle: { fill: color, fontWeight: 600 },
        accentColor: color,
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
    accentColor: DEFAULT_STROKE,
  };
}

function inactiveStyle(): EdgeStyleInternal {
  // Dashed warn-orange — fallback flow when a menu is closed (after-hours, etc.).
  const color = "#ffb454";
  return {
    style: {
      stroke: color,
      strokeWidth: STROKE_WIDTH_EMPHASIS,
      strokeDasharray: "6 4",
    },
    labelStyle: { fill: color, fontWeight: 600 },
    accentColor: color,
  };
}

function noInputStyle(): EdgeStyleInternal {
  const color = "#facc15";
  return {
    style: {
      stroke: color,
      strokeWidth: STROKE_WIDTH_DEFAULT,
      strokeDasharray: "2 4",
    },
    labelStyle: { fill: color },
    accentColor: color,
  };
}

function faxStyle(): EdgeStyleInternal {
  const color = "#60a5fa";
  return {
    style: {
      stroke: color,
      strokeWidth: STROKE_WIDTH_DEFAULT,
      strokeDasharray: "2 4",
    },
    labelStyle: { fill: color },
    accentColor: color,
  };
}

/**
 * Apply styles to every edge in an array. Cheap to call from React.useMemo;
 * preserves existing `id`, `source`, `target`, etc. Also stamps every edge with
 * a label-pill (`labelBgStyle` + padding + radius + `labelShowBg`) so labels
 * are readable where edges overlap.
 */
export function styleEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => {
    const s = getEdgeStyleInternal(e);
    return {
      ...e,
      style: { ...(e.style ?? {}), ...s.style },
      labelStyle: { ...(e.labelStyle ?? {}), ...(s.labelStyle ?? {}) },
      // Solid pill: canvas-bg fill + 1px stroke in the edge colour. Renders
      // as an SVG <rect> by React Flow's <EdgeText>.
      labelBgStyle: {
        fill: LABEL_BG_FILL,
        stroke: s.accentColor,
        strokeWidth: 1,
        ...(e.labelBgStyle ?? {}),
      },
      labelBgPadding: e.labelBgPadding ?? [6, 3],
      labelBgBorderRadius: e.labelBgBorderRadius ?? 8,
      labelShowBg: e.labelShowBg ?? true,
      animated: s.animated ?? e.animated,
    };
  });
}
