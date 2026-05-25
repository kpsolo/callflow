import { useMemo, useState } from "react";
import { useFlowStore } from "@/state/store";
import { useUiStore } from "@/state/uiStore";
import { getNodeType } from "@/nodes/registry";
import type { NodeKind } from "@/schema";
import { FIELDS, type FieldDef } from "./fields";
import { getAtPath, setAtPath } from "./paths";
import { MenuActionsEditor } from "./MenuActionsEditor";
import { ForwardRulesEditor } from "./ForwardRulesEditor";
import { ActivePeriodPicker } from "./ActivePeriodPicker";
import { PromptPicker } from "./PromptPicker";
import { CommentsPanel } from "./CommentsPanel";
import { EntityInspector } from "./EntityInspector";
import { useFlowComments } from "@/api";
import "./Inspector.css";

export interface InspectorProps {
  /** Callback fired when the empty-state "Edit…" button is clicked. */
  onEditEntity?: () => void;
}

export function Inspector({ onEditEntity }: InspectorProps = {}) {
  // Subscribe to selectedNodeId and nodes independently, then derive the
  // matched node via useMemo. The earlier shape — `useFlowStore((s) =>
  // s.nodes.find((n) => n.id === selectedId))` — captured `selectedId` in
  // a closure stored by Zustand's subscription, so when `setSelected` fired
  // the cached selector still searched for the previous id and could yield
  // a stale node until another unrelated state change forced a refresh.
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const nodes = useFlowStore((s) => s.nodes);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const removeNode = useFlowStore((s) => s.removeNode);
  const showNodeIds = useUiStore((s) => s.showNodeIds);

  const node = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) : undefined),
    [nodes, selectedId],
  );

  const kind = node?.type as NodeKind | undefined;
  const def = kind ? getNodeType(kind) : undefined;
  const fields = useMemo<FieldDef[]>(() => (kind && FIELDS[kind]) ?? [], [kind]);

  if (!node || !def || !kind) {
    return <EntityInspector onEditEntity={onEditEntity} />;
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
            style={{ ["--chip-color" as string]: def.color }}
            title={def.label}
          >
            {def.label}
          </span>
          <strong className="inspector-name">{nodeName ?? def.label}</strong>
          {showNodeIds && <code className="inspector-id">{node.id}</code>}
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

      <InspectorFields fields={fields} data={data} onChange={onChange} nodeKind={kind} />

      <NodeCommentsSection nodeId={node.id} />
    </div>
  );
}

function NodeCommentsSection({ nodeId }: { nodeId: string }) {
  const entityId = useFlowStore((s) => s.entity.id);
  const { unresolvedByAnchor } = useFlowComments(entityId);
  const count = unresolvedByAnchor.get(`node:${nodeId}`) ?? 0;
  return (
    <section className="inspector-comments">
      <h3 className="shell-section-title">
        Comments{count > 0 ? ` (${count} unresolved)` : ""}
      </h3>
      <CommentsPanel
        flowId={entityId}
        anchor={{ kind: "node", nodeId }}
        emptyHint="No comments on this node yet."
      />
    </section>
  );
}

const TAB_ORDER: Array<{ key: NonNullable<FieldDef["tab"]>; label: string }> = [
  { key: "general", label: "General" },
  { key: "prompts", label: "Prompts" },
  { key: "actions", label: "Actions" },
  { key: "errors", label: "Errors" },
];

function InspectorFields({
  fields,
  data,
  onChange,
  nodeKind,
}: {
  fields: FieldDef[];
  data: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
  nodeKind?: NodeKind;
}) {
  // If no field declares a tab, render the flat layout (most node types).
  const tabbed = fields.some((f) => !!f.tab);
  const [activeTab, setActiveTab] = useState<NonNullable<FieldDef["tab"]>>("general");

  const isVisible = (f: FieldDef) => !f.visibleWhen || f.visibleWhen(data);

  if (!tabbed) {
    const normalFields = fields.filter((f) => !f.advanced && isVisible(f));
    const advancedFields = fields.filter((f) => !!f.advanced && isVisible(f));

    return (
      <div className="inspector-fields">
        {normalFields.map((f) => (
          <FieldRow
            key={f.key}
            def={f}
            value={getAtPath(data, f.path ?? f.key)}
            data={data}
            onChange={onChange}
            nodeKind={nodeKind}
          />
        ))}
        {advancedFields.length > 0 && (
          <details className="inspector-advanced-details">
            <summary className="inspector-advanced-summary">Advanced Telephony Settings</summary>
            <div className="inspector-advanced-content">
              {advancedFields.map((f) => (
                <FieldRow
                  key={f.key}
                  def={f}
                  value={getAtPath(data, f.path ?? f.key)}
                  data={data}
                  onChange={onChange}
                  nodeKind={nodeKind}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  const presentTabs = TAB_ORDER.filter((t) => fields.some((f) => f.tab === t.key));
  const visibleFields = fields.filter((f) => f.tab === activeTab && isVisible(f));
  const normalFields = visibleFields.filter((f) => !f.advanced);
  const advancedFields = visibleFields.filter((f) => !!f.advanced);

  return (
    <>
      <nav className="inspector-tabs" role="tablist" aria-label="Node settings">
        {presentTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === activeTab}
            className={"inspector-tab" + (t.key === activeTab ? " is-active" : "")}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="inspector-fields" role="tabpanel">
        {normalFields.map((f) => (
          <FieldRow
            key={f.key}
            def={f}
            value={getAtPath(data, f.path ?? f.key)}
            data={data}
            onChange={onChange}
            nodeKind={nodeKind}
          />
        ))}
        {advancedFields.length > 0 && (
          <details className="inspector-advanced-details">
            <summary className="inspector-advanced-summary">Advanced Telephony Settings</summary>
            <div className="inspector-advanced-content">
              {advancedFields.map((f) => (
                <FieldRow
                  key={f.key}
                  def={f}
                  value={getAtPath(data, f.path ?? f.key)}
                  data={data}
                  onChange={onChange}
                  nodeKind={nodeKind}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}

function FieldRow({
  def,
  value,
  data,
  onChange,
  nodeKind,
}: {
  def: FieldDef;
  value: unknown;
  data: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
  nodeKind?: NodeKind;
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
        nodeKind={nodeKind}
      />
    );
  }

  if (def.type === "active-period") {
    return (
      <div className="inspector-field">
        <span className="inspector-field-label">{def.label}</span>
        <ActivePeriodPicker
          value={(value as string | undefined) ?? "always"}
          onChange={(v) => onChange(path, v)}
          nodeKind={nodeKind}
        />
      </div>
    );
  }

  if (def.type === "prompt") {
    return (
      <div className="inspector-field">
        <span className="inspector-field-label">{def.label}</span>
        <PromptPicker
          value={(value as string | undefined) ?? ""}
          onChange={(v) => onChange(path, v)}
        />
      </div>
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
        <>
          <select
            value={(value as string | undefined) ?? ""}
            onChange={(e) => onChange(path, e.target.value || undefined)}
          >
            <option value="">—</option>
            {def.options?.map((o) => {
              const val = typeof o === "string" ? o : o.value;
              const lbl = typeof o === "string" ? o : o.label;
              return (
                <option key={val} value={val}>
                  {lbl}
                </option>
              );
            })}
          </select>
          {def.optionDescriptions && typeof value === "string" && def.optionDescriptions[value] && (
            <span className="inspector-option-description">{def.optionDescriptions[value]}</span>
          )}
        </>
      ) : def.type === "readonly" ? (
        <span className="inspector-readonly">{String(value ?? "—")}</span>
      ) : null}
    </label>
  );
}
