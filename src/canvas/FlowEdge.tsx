import { BaseEdge, EdgeText, getBezierPath, type EdgeProps } from "reactflow";

/**
 * Custom edge type used by every edge on the canvas.
 *
 * Identical to React Flow's default bezier edge except for label positioning:
 * when an edge knows it shares a source with other edges (see
 * `data.siblingIndex` / `data.siblingCount`, stamped by `styleEdges`), the
 * label is staggered along the (source → target) segment so labels don't
 * collapse on top of each other. Each sibling lands at `(i+1)/(n+1)` along
 * the line, e.g. for 3 siblings the labels sit at t = 0.25, 0.5, 0.75.
 *
 * The label rendering itself still uses React Flow's <EdgeText/>, so the
 * existing pill background / padding / border-radius from styleEdges() carries
 * through unchanged.
 */
export interface FlowEdgeData {
  siblingIndex?: number;
  siblingCount?: number;
}

export function FlowEdge(props: EdgeProps<FlowEdgeData>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    data,
  } = props;

  const [path, defaultLabelX, defaultLabelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  let labelX = defaultLabelX;
  let labelY = defaultLabelY;
  const idx = data?.siblingIndex;
  const cnt = data?.siblingCount ?? 1;
  if (typeof idx === "number" && cnt > 1) {
    // Linear distribution along the source-to-target segment is a deliberate
    // simplification over walking the bezier — for the modest curvature React
    // Flow draws, the offset reads correctly, and the math stays trivial.
    const t = (idx + 1) / (cnt + 1);
    labelX = sourceX + (targetX - sourceX) * t;
    labelY = sourceY + (targetY - sourceY) * t;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      {label !== undefined && label !== null && label !== "" && (
        <EdgeText
          x={labelX}
          y={labelY}
          label={label}
          labelStyle={labelStyle}
          labelShowBg={labelShowBg}
          labelBgStyle={labelBgStyle}
          labelBgPadding={labelBgPadding}
          labelBgBorderRadius={labelBgBorderRadius}
        />
      )}
    </>
  );
}
