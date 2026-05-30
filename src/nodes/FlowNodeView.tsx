import { memo, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { MessageCircle, Trash2 } from "lucide-react";
import type { FlowNode, NodeKind } from "@/schema";
import { getNodeType } from "./registry";
import { getNodeIcon } from "./icons";
import { renderSummary, summaryRowCount } from "./summaries";
import { getNodeHeadline } from "./headline";
import { getHandleColor, handleShapeClass } from "./handleVisuals";
import { NodeInlineEditor, getInlineFields } from "./NodeInlineEditor";
import { useTraceStore } from "@/state/traceStore";
import { useValidation } from "@/validation/useValidation";
import { useFlowStore } from "@/state/store";
import { useUiStore } from "@/state/uiStore";
import { useFlowComments } from "@/api";
import { pickHeaderText } from "./contrast";
import "./FlowNodeView.css";

type FlowNodeViewProps = NodeProps<FlowNode["data"]>;

// Layout constants — must match the matching CSS custom properties in index.css.
// Handle positions are computed from these so dot-center === label-center.
const HEADER_H = 26;       // --fn-node-header-h
const ROW_H = 20;          // --fn-node-row-h (body summary rows)
const BODY_PAD_Y = 16;     // 8px top + 8px bottom (--fn-node-pad-y * 2)

function FlowNodeViewImpl({ id, type, data, selected }: FlowNodeViewProps) {
  const kind = type as NodeKind;
  let def = getNodeType(kind);
  let Icon = getNodeIcon(kind);

  if (kind === "call_terminal") {
    const outcome = (data as any).outcome ?? "answered";
    if (outcome === "rejected") {
      def = { ...def, color: "#ef476f", label: "Rejected", shortLabel: "Rejected" };
      Icon = getNodeIcon("term_rejected");
    } else if (outcome === "dropped") {
      def = { ...def, color: "#ef476f", label: "Dropped", shortLabel: "Dropped" };
      Icon = getNodeIcon("term_dropped");
    } else if (outcome === "voicemail_left") {
      def = { ...def, label: "Voicemail Left", shortLabel: "Voicemail Left" };
      Icon = getNodeIcon("term_voicemail_left");
    } else if (outcome === "forwarded_unanswered") {
      def = { ...def, label: "Forwarded — Unanswered", shortLabel: "Forwarded — Unanswered" };
      Icon = getNodeIcon("term_forwarded_unanswered");
    } else if (outcome === "forwarded_answered") {
      def = { ...def, label: "Forwarded — Answered", shortLabel: "Forwarded — Answered" };
      Icon = getNodeIcon("term_forwarded_answered");
    } else {
      def = { ...def, label: "Answered", shortLabel: "Answered" };
      Icon = getNodeIcon("term_answered");
    }
  }
  const traceActive = useTraceStore((s) => s.trace != null);
  const visited = useTraceStore((s) => s.visited_node_ids.has(id));
  const issues = useValidation();
  const myIssues = issues.filter((i) => i.node_id === id);
  const entityId = useFlowStore((s) => s.entity.id);
  const removeNode = useFlowStore((s) => s.removeNode);
  const isDropTarget = useUiStore((s) => s.dropTargetNodeId === id);
  const canDelete = !def.singletonPerEntity;
  const { unresolvedByAnchor } = useFlowComments(entityId);
  const commentCount = unresolvedByAnchor.get(`node:${id}`) ?? 0;
  const worst = myIssues.find((i) => i.severity === "error")
    ? "error"
    : myIssues.find((i) => i.severity === "warning")
      ? "warning"
      : null;

  const isMenu = kind === "menu_root" || kind === "menu_custom";
  const headline = getNodeHeadline(kind, data);
  const nodeVersion = useUiStore((s) => s.nodeVersion);
  const isV2 = nodeVersion === "v2";
  const inlineFields = isV2 ? getInlineFields(kind, data as Record<string, unknown>) : [];
  const hasInlineEditor = isV2 && inlineFields.length > 0;

  // Dynamic action handles for menu nodes — one output handle per defined input key,
  // plus `inactive` (when not-active) and `no_input` (timeout) when those targets are set.
  const dynamicOutputs =
    isMenu
      ? menuHandles(data as {
          actions?: Record<string, unknown>;
          inactive_action_node_id?: string;
          no_input?: { action_node_id?: string };
        })
      : kind === "call_screening"
        ? screeningHandles(data as { rules?: Array<{ id: string; name: string }> })
        : kind === "time_router"
          ? timeRouterHandles(data as { rules?: Array<{ id: string; name: string }> })
          : null;

  const bodyRows = summaryRowCount(kind, data);
  const bodyH = bodyRows > 0 ? bodyRows * ROW_H + BODY_PAD_Y : 0;
  const totalOutputs = def.outputs.length + (dynamicOutputs?.length ?? 0);
  const hasBody = hasInlineEditor || bodyH > 0;
  const hasDivider = hasBody && totalOutputs > 0;



  return (
    <div
      className={
        "fn-node" +
        (isMenu ? " fn-node--menu" : "") +
        (isV2 ? " fn-node--v2" : "") +
        (selected ? " is-selected" : "") +
        (isDropTarget ? " is-drop-target" : "") +
        (traceActive ? (visited ? " is-visited" : " is-dimmed") : "")
      }
      style={{ "--node-color": def.color } as CSSProperties}
      role="group"
      aria-label={`${def.label} node`}
    >
      {canDelete && (
        <button
          type="button"
          className="fn-node-trash nodrag"
          onClick={(e) => {
            e.stopPropagation();
            removeNode(id);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title="Delete node"
          aria-label={`Delete ${def.label} node`}
        >
          <Trash2 size={12} aria-hidden />
        </button>
      )}
      <div
        className={"fn-node-header" + (headline ? " fn-node-header--headlined" : "")}
        style={{ background: def.color, color: pickHeaderText(def.color) }}
      >
        {kind === "menu_root" && (
          <span
            className="fn-node-start-chip"
            style={{ background: pickHeaderText(def.color), color: def.color }}
            aria-label="Start of the call flow"
          >
            START
          </span>
        )}
        <Icon size={12} className="fn-node-header-icon" />
        {headline ? (
          <span className="fn-node-header-stack">
            <span
              className="fn-node-header-type"
              style={{ color: pickHeaderText(def.color) }}
            >
              {def.shortLabel ?? def.label}
            </span>
            <span className="fn-node-header-headline" title={headline}>
              {headline}
            </span>
          </span>
        ) : (
          <span className="fn-node-header-label">{def.shortLabel ?? def.label}</span>
        )}
        {(worst || commentCount > 0) && (
          <span className="fn-node-header-badges">
            {worst && (
              <span
                className={`fn-node-badge fn-node-badge-${worst}`}
                title={myIssues.map((i) => i.message).join("\n")}
                aria-label={`${myIssues.length} ${worst}${myIssues.length > 1 ? "s" : ""}`}
              >
                {worst === "error" ? "!" : "?"}
              </span>
            )}
            {commentCount > 0 && (
              <span
                className="fn-node-badge fn-node-badge-comment"
                title={`${commentCount} unresolved comment${commentCount > 1 ? "s" : ""}`}
                aria-label={`${commentCount} unresolved comments`}
              >
                <MessageCircle size={11} aria-hidden /> {commentCount}
              </span>
            )}
          </span>
        )}
      </div>

      {hasInlineEditor ? (
        <div className="fn-node-body">
          <NodeInlineEditor
            nodeId={id}
            kind={kind}
            data={data as Record<string, unknown>}
          />
        </div>
      ) : bodyH > 0 ? (
        <div className="fn-node-body">
          <div className="fn-node-fields">{renderSummary(kind, data)}</div>
        </div>
      ) : null}

      {hasDivider && <div className="fn-node-divider" aria-hidden="true" />}

      {totalOutputs > 0 && (
        <div className="fn-node-ports">
          {def.outputs.map((p) => {
            const label = p.label ?? p.id;
            return (
              <div className="fn-menu-option-pill" key={`out-${p.id}`}>
                <span className="fn-menu-option-label">{label}</span>
                <Handle
                  id={p.id}
                  type="source"
                  position={Position.Right}
                  className={`fn-menu-inner-handle ${handleShapeClass(p.id)}`}
                  style={{ backgroundColor: getHandleColor(p.id) }}
                />
              </div>
            );
          })}
          {dynamicOutputs?.map((entry) => {
            const label = entry.label;
            return (
              <div className="fn-menu-option-pill" key={`out-${entry.id}`}>
                <span className="fn-menu-option-label">{label}</span>
                <Handle
                  id={entry.id}
                  type="source"
                  position={Position.Right}
                  className={`fn-menu-inner-handle ${handleShapeClass(entry.id)}`}
                  style={{ backgroundColor: getHandleColor(entry.id) }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Inputs: today every node has at most one unlabelled input. Anchor it at the
          header center; if multi-input nodes are introduced later, expand this. */}
      {def.inputs.map((p) => (
        <Handle
          key={`in-${p.id}`}
          id={p.id}
          type="target"
          position={Position.Left}
          style={{ top: HEADER_H / 2 }}
        />
      ))}
    </div>
  );
}

function menuHandles(data: {
  actions?: Record<string, unknown>;
  inactive_action_node_id?: string;
  active_period?: string;
  no_input?: { action_node_id?: string };
}): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const actions = data.actions ?? {};
  const actionKeys = Object.keys(actions);
  for (const key of actionKeys) out.push({ id: `menu:${key}`, label: key });
  if (data.inactive_action_node_id || (data.active_period && data.active_period !== "always")) {
    out.push({ id: "inactive", label: "inactive" });
  }
  if (data.no_input?.action_node_id && !actionKeys.includes("no_input")) {
    out.push({ id: "no_input", label: "no_input" });
  }
  return out;
}

function screeningHandles(data: {
  rules?: Array<{ id: string; name: string }>;
}): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const rules = data.rules ?? [];
  for (const r of rules) {
    if (r.id) {
      out.push({ id: `rule:${r.id}`, label: r.name || "Rule" });
    }
  }
  out.push({ id: "fallback", label: "fallback (no match)" });
  return out;
}

function timeRouterHandles(data: {
  rules?: Array<{ id: string; name: string }>;
}): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const rules = data.rules ?? [];
  for (const r of rules) {
    if (r.id) {
      out.push({ id: `period:${r.id}`, label: r.name || "Schedule" });
    }
  }
  out.push({ id: "fallback", label: "fallback (no match)" });
  return out;
}

export const FlowNodeView = memo(FlowNodeViewImpl);
