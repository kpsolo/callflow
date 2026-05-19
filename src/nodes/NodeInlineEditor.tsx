import { useFlowStore } from "@/state/store";
import { FIELDS, type FieldDef } from "@/inspector/fields";
import { getAtPath, setAtPath } from "@/inspector/paths";
import type { NodeKind } from "@/schema";
import "./NodeInlineEditor.css";

// Field types we can comfortably render inside a node card. The richer editors
// (action maps, forwarding-rule lists, active-period pickers) remain in the
// sidebar Inspector — surfacing them inline would balloon the node footprint.
const INLINE_TYPES = new Set<FieldDef["type"]>([
  "text",
  "email",
  "number",
  "toggle",
  "select",
  "readonly",
]);

const MAX_FIELDS = 6;

export function getInlineFields(kind: NodeKind, data: Record<string, unknown>): FieldDef[] {
  const all = FIELDS[kind] ?? [];
  // For tabbed nodes, prefer the "general" tab — that's the headline knobs.
  const tabbed = all.some((f) => !!f.tab);
  const pool = tabbed ? all.filter((f) => f.tab === "general") : all;
  return pool
    .filter((f) => !f.inlineHidden)
    .filter((f) => INLINE_TYPES.has(f.type))
    .filter((f) => !f.visibleWhen || f.visibleWhen(data))
    .slice(0, MAX_FIELDS);
}

export function NodeInlineEditor({
  nodeId,
  kind,
  data,
}: {
  nodeId: string;
  kind: NodeKind;
  data: Record<string, unknown>;
}) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const fields = getInlineFields(kind, data);
  if (fields.length === 0) return null;

  const onChange = (path: string, value: unknown) => {
    const next = setAtPath(data, path, value);
    updateNodeData(nodeId, next);
  };

  return (
    <div
      className="fn-inline-editor nodrag"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {fields.map((f) => (
        <InlineField
          key={f.key}
          def={f}
          value={getAtPath(data, f.path ?? f.key)}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function InlineField({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (path: string, value: unknown) => void;
}) {
  const path = def.path ?? def.key;

  return (
    <div className="fn-inline-row">
      <span className="fn-inline-label" title={def.label}>
        {def.label}
      </span>
      <span className="fn-inline-control">
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
          <span className="fn-inline-readonly">{String(value ?? "—")}</span>
        ) : null}
      </span>
    </div>
  );
}
