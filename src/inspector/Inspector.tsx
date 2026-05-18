import { useMemo } from "react";
import { useFlowStore } from "@/state/store";
import { getNodeType } from "@/nodes/registry";
import type { NodeKind } from "@/schema";
import { FIELDS, type FieldDef } from "./fields";
import { getAtPath, setAtPath } from "./paths";
import { MenuActionsEditor } from "./MenuActionsEditor";
import { ForwardRulesEditor } from "./ForwardRulesEditor";
import { ActivePeriodPicker } from "./ActivePeriodPicker";
import "./Inspector.css";

export function Inspector() {
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === selectedId));
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const removeNode = useFlowStore((s) => s.removeNode);

  const kind = node?.type as NodeKind | undefined;
  const def = kind ? getNodeType(kind) : undefined;
  const fields = useMemo<FieldDef[]>(() => (kind && FIELDS[kind]) ?? [], [kind]);

  if (!node || !def || !kind) {
    return (
      <div className="inspector">
        <h2 className="shell-section-title">Inspector</h2>
        <p className="shell-placeholder">Select a node to edit its fields.</p>
      </div>
    );
  }

  const data = node.data as Record<string, unknown>;

  const onChange = (path: string, value: unknown) => {
    const next = setAtPath(data, path, value);
    updateNodeData(node.id, next);
  };

  // Surface a name field for nodes that carry their own data.name (menus, custom-
  // labelled actions). For everything else the instance id remains the only identity.
  const nodeName =
    typeof (data as Record<string, unknown>).name === "string"
      ? ((data as Record<string, unknown>).name as string)
      : undefined;

  return (
    <div className="inspector">
      <header className="inspector-header">
        <div className="inspector-title">
          <span
            className="inspector-type-chip"
            style={{ background: def.color }}
            title={def.label}
          >
            {def.label}
          </span>
          <strong className="inspector-name">{nodeName ?? def.label}</strong>
          <code className="inspector-id">{node.id}</code>
        </div>
        {!def.singletonPerEntity && (
          <button
            type="button"
            className="inspector-delete"
            onClick={() => removeNode(node.id)}
            title="Delete node (Del)"
          >
            Delete
          </button>
        )}
      </header>

      {def.description && <p className="inspector-description">{def.description}</p>}

      {fields.length === 0 && (
        <p className="shell-placeholder">No editable fields for this node type.</p>
      )}

      <div className="inspector-fields">
        {fields.map((f) => (
          <FieldRow
            key={f.key}
            def={f}
            value={getAtPath(data, f.path ?? f.key)}
            data={data}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRow({
  def,
  value,
  data,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  data: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const path = def.path ?? def.key;

  if (def.type === "actions-map") {
    return (
      <MenuActionsEditor
        actions={(data.actions as Record<string, { target_node_id: string; play_before_action?: string }> | undefined) ?? {}}
        onChange={(next) => onChange("actions", next)}
      />
    );
  }

  if (def.type === "rules-list") {
    return (
      <ForwardRulesEditor
        rules={(data.rules as Array<Record<string, unknown>> | undefined) ?? []}
        onChange={(next) => onChange("rules", next)}
        ringMode={data.ring_mode as string | undefined}
      />
    );
  }

  if (def.type === "active-period") {
    return (
      <label className="inspector-field">
        <span className="inspector-field-label">{def.label}</span>
        <ActivePeriodPicker
          value={(value as string | undefined) ?? "always"}
          onChange={(v) => onChange(path, v)}
        />
      </label>
    );
  }

  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{def.label}</span>
      {def.type === "text" || def.type === "email" ? (
        <input
          type={def.type === "email" ? "email" : "text"}
          value={(value as string | undefined) ?? ""}
          placeholder={def.placeholder}
          onChange={(e) => onChange(path, e.target.value)}
        />
      ) : def.type === "number" ? (
        <input
          type="number"
          value={(value as number | undefined) ?? ""}
          min={def.min}
          max={def.max}
          onChange={(e) =>
            onChange(path, e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      ) : def.type === "toggle" ? (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(path, e.target.checked)}
        />
      ) : def.type === "select" ? (
        <select
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(path, e.target.value || undefined)}
        >
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : def.type === "readonly" ? (
        <span className="inspector-readonly">{String(value ?? "—")}</span>
      ) : null}
    </label>
  );
}
