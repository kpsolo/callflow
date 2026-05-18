import { Check } from "lucide-react";
import { useFlowStore } from "@/state/store";
import { useValidation } from "@/validation/useValidation";
import "./Inspector.css";

/**
 * Shown in the inspector pane when no node is selected.
 *
 * Surfaces entity-level facts the canvas can't show by itself — name, type,
 * DID/extension, counts, validation summary — so the right rail isn't dead
 * space until something is selected.
 */
export function EntityInspector({ onEditEntity }: { onEditEntity?: () => void }) {
  const entity = useFlowStore((s) => s.entity);
  const nodeCount = useFlowStore((s) => s.nodes.length);
  const edgeCount = useFlowStore((s) => s.edges.length);
  const scenarioCount = useFlowStore((s) => s.scenarios.length);
  const lastSavedAt = useFlowStore((s) => s.lastSavedAt);
  const dirty = useFlowStore((s) => s.dirty);
  const issues = useValidation();

  const errs = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warning").length;
  const clean = errs === 0 && warns === 0;

  const isAA = entity.type === "auto_attendant";
  const typeLabel = isAA ? "Auto Attendant" : "Extension";
  const typeColor = isAA ? "#9d4edd" : "#06d6a0";
  const identifier = isAA ? entity.did : entity.extension;
  const identifierLabel = isAA ? "DID" : "Extension";

  return (
    <div className="inspector">
      <header className="inspector-header">
        <div className="inspector-title">
          <span
            className="inspector-type-chip"
            style={{ ["--chip-color" as string]: typeColor }}
            title={typeLabel}
          >
            {typeLabel}
          </span>
          <strong className="inspector-name">{entity.name}</strong>
        </div>
        {onEditEntity && (
          <button
            type="button"
            className="entity-inspector-edit"
            onClick={onEditEntity}
            title="Edit entity settings"
          >
            Edit…
          </button>
        )}
      </header>

      <p className="inspector-description">
        Nothing selected. Click a node on the canvas to edit its fields.
      </p>

      <dl className="entity-inspector-facts">
        <dt>{identifierLabel}</dt>
        <dd>
          <code>{identifier}</code>
        </dd>

        <dt>ID</dt>
        <dd>
          <code className="entity-inspector-id">{entity.id}</code>
        </dd>

        <dt>Nodes</dt>
        <dd>
          {nodeCount} node{nodeCount === 1 ? "" : "s"} · {edgeCount} edge
          {edgeCount === 1 ? "" : "s"}
        </dd>

        <dt>Scenarios</dt>
        <dd>
          {scenarioCount === 0
            ? "none"
            : `${scenarioCount} scenario${scenarioCount === 1 ? "" : "s"}`}
        </dd>

        <dt>Validation</dt>
        <dd>
          {clean ? (
            <span className="entity-inspector-ok">
              <Check size={12} aria-hidden /> No issues
            </span>
          ) : (
            <span className={errs > 0 ? "entity-inspector-err" : "entity-inspector-warn"}>
              {errs > 0 && `${errs} error${errs === 1 ? "" : "s"}`}
              {errs > 0 && warns > 0 && ", "}
              {warns > 0 && `${warns} warning${warns === 1 ? "" : "s"}`}
            </span>
          )}
        </dd>

        <dt>Save</dt>
        <dd>{dirty ? "Unsaved changes" : lastSavedAt ? formatRelative(lastSavedAt) : "—"}</dd>
      </dl>
    </div>
  );
}

function formatRelative(ts: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 5) return "Saved just now";
  if (secs < 60) return `Saved ${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Saved ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Saved ${hrs}h ago`;
  return `Saved on ${new Date(ts).toLocaleDateString()}`;
}
