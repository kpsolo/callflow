import { useFlowStore } from "@/state/store";
import { ActivePeriodPicker } from "./ActivePeriodPicker";

export interface ForwardRule {
  id: string;
  target_node_id: string;
  time_check: string;
  timeout_s: number;
  enabled: boolean;
  sip_proxy?: string;
  percentage_weight?: number;
}

function genRuleId() {
  return `r_${Math.random().toString(36).slice(2, 8)}`;
}

export function ForwardRulesEditor({
  rules,
  onChange,
  ringMode,
}: {
  rules: Array<Record<string, unknown>>;
  onChange: (next: ForwardRule[]) => void;
  /** Drives whether per-rule weight inputs are shown. */
  ringMode?: string;
}) {
  const allNodes = useFlowStore((s) => s.nodes);
  const targets = allNodes
    .filter((n) =>
      [
        "target_extension",
        "target_external",
        "target_sip_uri",
        "target_hunt_group_ref",
      ].includes(n.type ?? ""),
    )
    .map((n) => ({ id: n.id, label: `${n.id} — ${n.type}` }));

  const typedRules = rules as unknown as ForwardRule[];

  const setRule = (idx: number, patch: Partial<ForwardRule>) => {
    onChange(typedRules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= typedRules.length) return;
    const next = [...typedRules];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    onChange(next);
  };

  return (
    <div className="rules-list">
      <div className="actions-map-header">
        <span>Forwarding rules ({typedRules.length})</span>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...typedRules,
              {
                id: genRuleId(),
                target_node_id: "",
                time_check: "always",
                timeout_s: 20,
                enabled: true,
              },
            ])
          }
        >
          + rule
        </button>
      </div>
      {typedRules.length === 0 ? (
        <p className="shell-placeholder">No rules. Add one above.</p>
      ) : (
        <ol className="rules-list-items">
          {typedRules.map((r, i) => (
            <li key={r.id ?? i} className="rules-list-row">
              <div className="rules-list-row-top">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === typedRules.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
                <label className="rules-list-enabled">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => setRule(i, { enabled: e.target.checked })}
                  />
                  enabled
                </label>
                <button
                  type="button"
                  onClick={() => onChange(typedRules.filter((_, j) => j !== i))}
                  title="Remove rule"
                >
                  ×
                </button>
              </div>
              <label className="inspector-field">
                <span className="inspector-field-label">Target</span>
                <select
                  value={r.target_node_id}
                  onChange={(e) => setRule(i, { target_node_id: e.target.value })}
                >
                  <option value="">—</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inspector-field">
                <span className="inspector-field-label">Time check</span>
                <ActivePeriodPicker
                  value={r.time_check ?? "always"}
                  onChange={(v) => setRule(i, { time_check: v })}
                />
              </label>
              <label className="inspector-field">
                <span className="inspector-field-label">Timeout (s)</span>
                <input
                  type="number"
                  value={r.timeout_s}
                  min={1}
                  max={120}
                  onChange={(e) => setRule(i, { timeout_s: Number(e.target.value) })}
                />
              </label>
              <label className="inspector-field">
                <span className="inspector-field-label">SIP proxy</span>
                <input
                  type="text"
                  value={r.sip_proxy ?? ""}
                  onChange={(e) => setRule(i, { sip_proxy: e.target.value || undefined })}
                />
              </label>
              {ringMode === "percentage" && (
                <label className="inspector-field">
                  <span className="inspector-field-label">Weight</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={r.percentage_weight ?? 1}
                    onChange={(e) =>
                      setRule(i, { percentage_weight: Number(e.target.value) })
                    }
                  />
                </label>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
