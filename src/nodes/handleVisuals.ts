/**
 * Visual taxonomy for output handles. One small file so the rules live in
 * exactly one place — FlowNodeView reads from here, and any future code
 * (legend, validation icons) can do the same.
 *
 * Two axes:
 *  - colour: drives the dot fill (and matches the edge stroke from edgeStyle.ts)
 *  - shape:  drives the dot silhouette so colour-blind users can still tell
 *            digit / timeout / fax / inactive apart at a glance
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

export type HandleShape = "circle" | "square" | "diamond" | "ring";

export function getHandleColor(optionId: string): string {
  if (optionId.startsWith("menu:")) {
    const key = optionId.slice("menu:".length);
    if (key in DIGIT_PALETTE) return DIGIT_PALETTE[key];
    if (key === "no_input") return "#facc15";
    if (key === "fax") return "#60a5fa";
  }
  if (optionId === "no_input") return "#facc15";
  if (optionId === "fax") return "#60a5fa";
  if (optionId === "inactive") return "#ffb454";
  return "#6b7280"; // matches edgeStyle DEFAULT_STROKE
}

export function getHandleShape(optionId: string): HandleShape {
  // Digits + #/* — filled circle.
  if (optionId.startsWith("menu:")) {
    const key = optionId.slice("menu:".length);
    if (key in DIGIT_PALETTE) return "circle";
    if (key === "fax") return "square";
    if (key === "no_input") return "diamond";
  }
  if (optionId === "fax") return "square";
  if (optionId === "no_input") return "diamond";
  if (optionId === "inactive") return "ring";
  return "circle";
}

/** Convenience: CSS class for a shape, ready to append to a Handle's className. */
export function handleShapeClass(optionId: string): string {
  return `fn-handle-shape--${getHandleShape(optionId)}`;
}
