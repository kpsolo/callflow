import { memo } from "react";
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
const HEADER_H = 24;       // --fn-node-header-h
const ROW_H = 16;          // --fn-node-row-h (body summary rows)
const BODY_PAD_Y = 12;     // 6px top + 6px bottom (--fn-node-pad-y * 2)

function FlowNodeViewImpl({ id, type, data, selected }: FlowNodeViewProps) {
  const kind = type as NodeKind;
  const def = getNodeType(kind);
  const Icon = getNodeIcon(kind);
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
      style={{ borderColor: def.color }}
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
  no_input?: { action_node_id?: string };
}): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const actions = data.actions ?? {};
  const actionKeys = Object.keys(actions);
  for (const key of actionKeys) out.push({ id: `menu:${key}`, label: key });
  if (data.inactive_action_node_id) out.push({ id: "inactive", label: "inactive" });
  if (data.no_input?.action_node_id && !actionKeys.includes("no_input")) {
    out.push({ id: "no_input", label: "no_input" });
  }
  return out;
}

export const FlowNodeView = memo(FlowNodeViewImpl);
