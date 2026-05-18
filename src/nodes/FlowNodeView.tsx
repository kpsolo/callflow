import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { FlowNode, NodeKind } from "@/schema";
import { getNodeType } from "./registry";
import { renderSummary } from "./summaries";
import { useTraceStore } from "@/state/traceStore";
import { useValidation } from "@/validation/useValidation";
import { pickHeaderText } from "./contrast";
import "./FlowNodeView.css";

type FlowNodeViewProps = NodeProps<FlowNode["data"]>;

function FlowNodeViewImpl({ id, type, data, selected }: FlowNodeViewProps) {
  const kind = type as NodeKind;
  const def = getNodeType(kind);
  const traceActive = useTraceStore((s) => s.trace != null);
  const visited = useTraceStore((s) => s.visited_node_ids.has(id));
  const issues = useValidation();
  const myIssues = issues.filter((i) => i.node_id === id);
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

  return (
    <div
      className={
        "fn-node" +
        (selected ? " is-selected" : "") +
        (traceActive ? (visited ? " is-visited" : " is-dimmed") : "")
      }
      style={{ borderColor: def.color }}
      role="group"
      aria-label={`${def.label} node`}
    >
      <div
        className="fn-node-header"
        style={{ background: def.color, color: pickHeaderText(def.color) }}
      >
        {kind === "menu_root" && (
          <span className="fn-node-start-chip" aria-label="Start of the call flow">
            START
          </span>
        )}
        <span className="fn-node-header-label">{def.shortLabel ?? def.label}</span>
        {worst && (
          <span
            className={`fn-node-badge fn-node-badge-${worst}`}
            title={myIssues.map((i) => i.message).join("\n")}
            aria-label={`${myIssues.length} ${worst}${myIssues.length > 1 ? "s" : ""}`}
          >
            {worst === "error" ? "!" : "?"}
          </span>
        )}
      </div>
      <div className="fn-node-body">{renderSummary(kind, data)}</div>

      {def.inputs.map((p, i) => (
        <Handle
          key={`in-${p.id}`}
          id={p.id}
          type="target"
          position={Position.Left}
          style={{ top: 24 + i * 14 }}
        />
      ))}

      {def.outputs.map((p, i) => (
        <Handle
          key={`out-${p.id}`}
          id={p.id}
          type="source"
          position={Position.Right}
          style={{ top: 24 + i * 14 }}
        >
          <span className="fn-node-port-label">{p.label}</span>
        </Handle>
      ))}

      {dynamicOutputs?.map((entry, i) => (
        <Handle
          key={`menu-${entry.id}`}
          id={entry.id}
          type="source"
          position={Position.Right}
          style={{ top: 56 + i * 14 }}
        >
          <span className="fn-node-port-label fn-node-port-label-menu">{entry.label}</span>
        </Handle>
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
