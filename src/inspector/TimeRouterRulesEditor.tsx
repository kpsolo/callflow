import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useFlowStore } from "@/state/store";
import { ActivePeriodPicker } from "./ActivePeriodPicker";

export interface TimeRouterRule {
  id: string;
  name: string;
  period: string;
  target_node_id?: string;
}

function genRuleId() {
  return `tr_${Math.random().toString(36).slice(2, 8)}`;
}

export function TimeRouterRulesEditor({
  rules,
  onChange,
  fallbackNodeId,
  onFallbackChange,
}: {
  rules: Array<Record<string, unknown>>;
  onChange: (next: TimeRouterRule[]) => void;
  fallbackNodeId?: string;
  onFallbackChange: (next: string | undefined) => void;
}) {
  const allNodes = useFlowStore((s) => s.nodes);

  // List all nodes with inputs as eligible targets
  const targets = allNodes
    .filter((n) => {
      // Anything with an input handle except the current node (to avoid self loops)
      return n.id !== useFlowStore.getState().selectedNodeId;
    })
    .map((n) => {
      let label = n.id;
      if (n.type === "answering_mode_ext") label = `${n.id} (Answering Mode)`;
      else if (n.type === "voicemail") label = `${n.id} (Voicemail)`;
      else if (n.type === "call_terminal") {
        const outcome = (n.data as any).outcome ?? "answered";
        label = `${n.id} (Terminal: ${outcome})`;
      } else if (n.type === "action_disconnect") label = `${n.id} (Disconnect)`;
      else if (n.type === "call_forwarding") label = `${n.id} (Forwarding)`;
      else if (n.type === "announcement") label = `${n.id} (Announcement)`;
      return { id: n.id, label };
    });

  const typedRules = rules as unknown as TimeRouterRule[];

  const setRule = (idx: number, patch: Partial<TimeRouterRule>) => {
    onChange(typedRules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= typedRules.length) return;
    const next = [...typedRules];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    onChange(next);
  };

  const addRule = () => {
    onChange([
      ...typedRules,
      {
        id: genRuleId(),
        name: `Schedule ${typedRules.length + 1}`,
        period: "always",
      },
    ]);
  };

  return (
    <div className="rules-list">
      <div className="actions-map-header">
        <span>Schedule Exits ({typedRules.length})</span>
        <button type="button" onClick={addRule}>
          + exit
        </button>
      </div>

      {typedRules.length === 0 ? (
        <p className="shell-placeholder">No schedule exits configured. Add one above.</p>
      ) : (
        <ol className="rules-list-items">
          {typedRules.map((r, i) => {
            return (
              <li key={r.id ?? i} className="rules-list-row">
                <div className="rules-list-row-top">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    title="Move up"
                    aria-label="Move up"
                  >
                    <ChevronUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === typedRules.length - 1}
                    title="Move down"
                    aria-label="Move down"
                  >
                    <ChevronDown size={14} aria-hidden />
                  </button>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="rules-list-row-remove"
                    onClick={() => onChange(typedRules.filter((_, j) => j !== i))}
                    title="Remove route"
                    aria-label="Remove route"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>

                {/* Exit Name */}
                <label className="inspector-field">
                  <span className="inspector-field-label">Exit Label</span>
                  <input
                    type="text"
                    className="inspector-text-input"
                    value={r.name}
                    onChange={(e) => setRule(i, { name: e.target.value })}
                  />
                </label>

                {/* Period Picker */}
                <label className="inspector-field">
                  <span className="inspector-field-label">Active Period</span>
                  <ActivePeriodPicker
                    value={r.period}
                    onChange={(p) => setRule(i, { period: p })}
                  />
                </label>

                {/* Target Node dropdown */}
                <label className="inspector-field">
                  <span className="inspector-field-label">
                    Route Destination (Visual Edge)
                  </span>
                  <select
                    className="inspector-select"
                    value={r.target_node_id ?? ""}
                    onChange={(e) => setRule(i, { target_node_id: e.target.value || undefined })}
                  >
                    <option value="">(drag edge on canvas)</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ol>
      )}

      {/* Fallback Exit Section */}
      <div className="rules-list-fallback-section">
        <label className="inspector-field">
          <span className="inspector-field-label font-bold">Fallback Destination (No schedule matches)</span>
          <select
            className="inspector-select"
            value={fallbackNodeId ?? ""}
            onChange={(e) => onFallbackChange(e.target.value || undefined)}
          >
            <option value="">(drag fallback edge on canvas)</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
