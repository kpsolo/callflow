import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { MessageCircle, Trash2 } from "lucide-react";
import type { FlowNode, NodeKind } from "@/schema";
import { getNodeType } from "./registry";
import { getNodeIcon } from "./icons";
import { renderSummary, summaryRowCount } from "./summaries";
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
const PORT_ROW_H = 18;     // --fn-node-port-row-h
const BODY_PAD_Y = 12;     // 6px top + 6px bottom (--fn-node-pad-y * 2)
const DIVIDER_H = 1;
const PORTS_PAD_TOP = 4;

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

  // Dynamic action handles for menu nodes — one output handle per defined input key,
  // plus `inactive` (when not-active) and `no_input` (timeout) when those targets are set.
  const dynamicOutputs =
    kind === "menu_root" || kind === "menu_custom"
      ? menuHandles(data as {
          actions?: Record<string, unknown>;
          inactive_action_node_id?: string;
          no_input?: { action_node_id?: string };
        })
      : null;

  const bodyRows = summaryRowCount(kind, data);
  const bodyH = bodyRows > 0 ? bodyRows * ROW_H + BODY_PAD_Y : 0;
  const totalOutputs = def.outputs.length + (dynamicOutputs?.length ?? 0);
  const hasDivider = bodyH > 0 && totalOutputs > 0;

  // y-center of the i-th port row, measured from the top of the node.
  const portsTop = HEADER_H + bodyH + (hasDivider ? DIVIDER_H : 0) + PORTS_PAD_TOP;
  const portTopPx = (i: number) => portsTop + i * PORT_ROW_H + PORT_ROW_H / 2;

  return (
    <div
      className={
        "fn-node" +
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
        className="fn-node-header"
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
        <span className="fn-node-header-label">{def.shortLabel ?? def.label}</span>
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

      {bodyH > 0 && (
        <div className="fn-node-body">
          <div className="fn-node-fields">{renderSummary(kind, data)}</div>
        </div>
      )}

      {hasDivider && <div className="fn-node-divider" aria-hidden="true" />}

      {totalOutputs > 0 && (
        <div className="fn-node-ports">
          {def.outputs.map((p) => (
            <div className="fn-node-port-row fn-node-port-row--out" key={`out-${p.id}`}>
              <span className="fn-node-port-row__label">{p.label ?? p.id}</span>
            </div>
          ))}
          {dynamicOutputs?.map((entry) => (
            <div className="fn-node-port-row fn-node-port-row--out" key={`out-${entry.id}`}>
              <span className="fn-node-port-row__label fn-node-port-row__label--menu">
                {entry.label}
              </span>
            </div>
          ))}
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

      {def.outputs.map((p, i) => (
        <Handle
          key={`out-${p.id}`}
          id={p.id}
          type="source"
          position={Position.Right}
          style={{ top: portTopPx(i) }}
        />
      ))}

      {dynamicOutputs?.map((entry, i) => (
        <Handle
          key={`menu-${entry.id}`}
          id={entry.id}
          type="source"
          position={Position.Right}
          style={{ top: portTopPx(def.outputs.length + i) }}
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
