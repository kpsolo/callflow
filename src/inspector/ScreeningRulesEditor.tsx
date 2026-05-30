import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useFlowStore } from "@/state/store";
import { ActivePeriodPicker } from "./ActivePeriodPicker";
import type { NodeKind } from "@/schema";

export interface ScreeningRule {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  conditions: {
    time_period: string;
    caller: {
      kind: "any" | "number" | "prefix" | "regex" | "anonymous" | "caller_list";
      value?: string;
    };
    callee: {
      kind: "any" | "did" | "alias";
      value?: string;
    };
    mode?: string;
  };
  target_node_id?: string;
  play_before_action?: string;
}

function genRuleId() {
  return `r_${Math.random().toString(36).slice(2, 8)}`;
}

export function ScreeningRulesEditor({
  rules,
  onChange,
  fallbackNodeId,
  onFallbackChange,
  nodeKind,
}: {
  rules: Array<Record<string, unknown>>;
  onChange: (next: ScreeningRule[]) => void;
  fallbackNodeId?: string;
  onFallbackChange: (next: string | undefined) => void;
  nodeKind?: NodeKind;
}) {
  const allNodes = useFlowStore((s) => s.nodes);

  // List all nodes with inputs as eligible targets
  const targets = allNodes
    .filter((n) => {
      // We can simplify: anything with an input handle except screening itself (to avoid self loops)
      return n.id !== useFlowStore.getState().selectedNodeId;
    })
    .map((n) => {
      // Find friendly label
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

  const typedRules = rules as unknown as ScreeningRule[];

  const setRule = (idx: number, patch: Partial<ScreeningRule>) => {
    onChange(typedRules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const setRuleCondition = (idx: number, field: "caller" | "callee" | "time_period", subField?: string, value?: any) => {
    const nextRules = typedRules.map((r, i) => {
      if (i !== idx) return r;
      const conditions = { ...r.conditions };
      if (field === "time_period") {
        conditions.time_period = value;
      } else if (field === "caller") {
        conditions.caller = {
          ...conditions.caller,
          [subField!]: value,
        };
      } else if (field === "callee") {
        conditions.callee = {
          ...conditions.callee,
          [subField!]: value,
        };
      }
      return { ...r, conditions };
    });
    onChange(nextRules);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= typedRules.length) return;
    const next = [...typedRules];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    // update order
    const updated = next.map((rule, idx) => ({ ...rule, order: idx }));
    onChange(updated);
  };

  const addRule = () => {
    onChange([
      ...typedRules,
      {
        id: genRuleId(),
        name: `Rule ${typedRules.length + 1}`,
        order: typedRules.length,
        enabled: true,
        conditions: {
          time_period: "always",
          caller: { kind: "any" },
          callee: { kind: "any" },
        },
      },
    ]);
  };

  return (
    <div className="rules-list">
      <div className="actions-map-header">
        <span>Screening rules ({typedRules.length})</span>
        <button type="button" onClick={addRule}>
          + rule
        </button>
      </div>

      {typedRules.length === 0 ? (
        <p className="shell-placeholder">No screening rules configured. Add one above.</p>
      ) : (
        <ol className="rules-list-items">
          {typedRules.map((r, i) => {
            const hasCallerValue = r.conditions?.caller?.kind !== "any" && r.conditions?.caller?.kind !== "anonymous";
            const hasCalleeValue = r.conditions?.callee?.kind !== "any";

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
                    className="rules-list-row-remove"
                    onClick={() => onChange(typedRules.filter((_, j) => j !== i))}
                    title="Remove rule"
                    aria-label="Remove rule"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>

                {/* Rule Name */}
                <label className="inspector-field">
                  <span className="inspector-field-label">Rule Name</span>
                  <input
                    type="text"
                    value={r.name || ""}
                    onChange={(e) => setRule(i, { name: e.target.value })}
                    placeholder="Block Anonymous, VIPs, etc."
                  />
                </label>

                {/* Time Check */}
                <label className="inspector-field">
                  <span className="inspector-field-label">Time Period</span>
                  <ActivePeriodPicker
                    value={r.conditions?.time_period ?? "always"}
                    onChange={(v) => setRuleCondition(i, "time_period", undefined, v)}
                    nodeKind={nodeKind}
                  />
                </label>

                {/* Caller Check */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <label className="inspector-field" style={{ flex: 1 }}>
                    <span className="inspector-field-label">Caller Check</span>
                    <select
                      value={r.conditions?.caller?.kind ?? "any"}
                      onChange={(e) => {
                        const nextKind = e.target.value as any;
                        setRuleCondition(i, "caller", "kind", nextKind);
                      }}
                    >
                      <option value="any">Any Caller</option>
                      <option value="number">Specific Number</option>
                      <option value="prefix">Prefix Match</option>
                      <option value="regex">Regex Match</option>
                      <option value="anonymous">Anonymous</option>
                    </select>
                  </label>
                  {hasCallerValue && (
                    <label className="inspector-field" style={{ flex: 1.2 }}>
                      <span className="inspector-field-label">Caller Value</span>
                      <input
                        type="text"
                        value={r.conditions?.caller?.value || ""}
                        onChange={(e) => setRuleCondition(i, "caller", "value", e.target.value)}
                        placeholder="e.g. +15550001"
                      />
                    </label>
                  )}
                </div>

                {/* Callee Check */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <label className="inspector-field" style={{ flex: 1 }}>
                    <span className="inspector-field-label">Callee Check</span>
                    <select
                      value={r.conditions?.callee?.kind ?? "any"}
                      onChange={(e) => {
                        const nextKind = e.target.value as any;
                        setRuleCondition(i, "callee", "kind", nextKind);
                      }}
                    >
                      <option value="any">Any Callee</option>
                      <option value="did">Dialed DID</option>
                      <option value="alias">Alias Match</option>
                    </select>
                  </label>
                  {hasCalleeValue && (
                    <label className="inspector-field" style={{ flex: 1.2 }}>
                      <span className="inspector-field-label">Callee Value</span>
                      <input
                        type="text"
                        value={r.conditions?.callee?.value || ""}
                        onChange={(e) => setRuleCondition(i, "callee", "value", e.target.value)}
                        placeholder="e.g. +18005551234"
                      />
                    </label>
                  )}
                </div>

                {/* Exit Target connection selection */}
                <label className="inspector-field">
                  <span className="inspector-field-label">Canvas Exit Route (Target)</span>
                  <select
                    value={r.target_node_id || ""}
                    onChange={(e) => setRule(i, { target_node_id: e.target.value || undefined })}
                  >
                    <option value="">— (Disconnected, draw on canvas)</option>
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

      {/* Fallback Target selector */}
      <div className="inspector-field" style={{ marginTop: "16px", borderTop: "1px solid #ddd", paddingTop: "16px" }}>
        <span className="inspector-field-label" style={{ fontWeight: "bold", color: "#333" }}>Fallback Leg Target (No match)</span>
        <select
          value={fallbackNodeId || ""}
          onChange={(e) => onFallbackChange(e.target.value || undefined)}
        >
          <option value="">— (Disconnected, draw on canvas)</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="inspector-option-description">
          Where calls go if no screening rules match (typically your Answering Mode node).
        </span>
      </div>
    </div>
  );
}
