import { useState } from "react";
import { useFlowStore } from "@/state/store";

const INPUT_KEYS = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "#",
  "fax",
  "no_input",
];

export interface MenuAction {
  target_node_id: string;
  play_before_action?: string;
}

export function MenuActionsEditor({
  actions,
  onChange,
}: {
  actions: Record<string, MenuAction>;
  onChange: (next: Record<string, MenuAction>) => void;
}) {
  const allNodes = useFlowStore((s) => s.nodes);
  const targets = allNodes.map((n) => ({ id: n.id, label: `${n.id} — ${n.type}` }));
  const [newKey, setNewKey] = useState<string>("");

  const remaining = INPUT_KEYS.filter((k) => !(k in actions));

  return (
    <div className="actions-map">
      <div className="actions-map-header">
        <span>Menu actions</span>
        {remaining.length > 0 && (
          <div className="actions-map-add">
            <select value={newKey} onChange={(e) => setNewKey(e.target.value)}>
              <option value="">add…</option>
              {remaining.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!newKey}
              onClick={() => {
                onChange({ ...actions, [newKey]: { target_node_id: "" } });
                setNewKey("");
              }}
            >
              +
            </button>
          </div>
        )}
      </div>
      {Object.keys(actions).length === 0 ? (
        <p className="shell-placeholder">No actions configured.</p>
      ) : (
        <ul className="actions-map-list">
          {Object.entries(actions).map(([key, action]) => (
            <li key={key} className="actions-map-row">
              <span className="actions-map-key">{key}</span>
              <select
                value={action.target_node_id}
                onChange={(e) =>
                  onChange({ ...actions, [key]: { ...action, target_node_id: e.target.value } })
                }
              >
                <option value="">target…</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="play before…"
                value={action.play_before_action ?? ""}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  onChange({ ...actions, [key]: { ...action, play_before_action: v } });
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const next = { ...actions };
                  delete next[key];
                  onChange(next);
                }}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
