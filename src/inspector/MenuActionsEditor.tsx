import { useState } from "react";
import { Volume2, VolumeX, Trash2 } from "lucide-react";
import { useFlowStore } from "@/state/store";
import { getNodeType } from "@/nodes/registry";
import type { NodeKind } from "@/schema";
import { useUiStore } from "@/state/uiStore";

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

interface ActionRowProps {
  inputKey: string;
  action: MenuAction;
  targetOptions: { id: string; label: string; subLabel: string }[];
  onChange: (next: MenuAction) => void;
  onRemove: () => void;
}

function ActionRow({ inputKey, action, targetOptions, onChange, onRemove }: ActionRowProps) {
  const [editingPrompt, setEditingPrompt] = useState(false);
  const setHoveredMenuKey = useUiStore((s) => s.setHoveredMenuKey);
  const flashedMenuKey = useUiStore((s) => s.flashedMenuKey);
  const flashed = flashedMenuKey === inputKey;

  const selectedTarget = targetOptions.find((t) => t.id === action.target_node_id);
  const playOn = !!action.play_before_action;

  return (
    <li
      className={"actions-row" + (flashed ? " is-hovered-from-canvas" : "")}
      onMouseEnter={() => setHoveredMenuKey(inputKey)}
      onMouseLeave={() => setHoveredMenuKey(null)}
    >
      <span className="actions-row-key" aria-label={`input key ${inputKey}`}>
        {inputKey}
      </span>

      <div className="actions-row-body">
        <div className="actions-row-line1">
          <select
            value={action.target_node_id}
            onChange={(e) => onChange({ ...action, target_node_id: e.target.value })}
            aria-label="Action target"
          >
            <option value="">— select target —</option>
            {targetOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={"actions-row-speaker" + (playOn ? " is-on" : "")}
            onClick={() => setEditingPrompt((v) => !v)}
            aria-pressed={playOn}
            title={playOn ? `Play before action: ${action.play_before_action}` : "No prompt"}
          >
            {playOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          <button
            type="button"
            className="actions-row-remove"
            onClick={onRemove}
            aria-label={`Remove input ${inputKey}`}
            title="Remove"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>

        <div className="actions-row-line2">
          {selectedTarget ? (
            <span title={selectedTarget.subLabel}>{selectedTarget.subLabel}</span>
          ) : (
            <span className="actions-row-empty">no target selected</span>
          )}
        </div>

        {editingPrompt && (
          <div className="actions-row-prompt">
            <input
              type="text"
              autoFocus
              placeholder="prompt id (leave blank to clear)"
              value={action.play_before_action ?? ""}
              onChange={(e) => {
                const v = e.target.value || undefined;
                onChange({ ...action, play_before_action: v });
              }}
              onBlur={() => setEditingPrompt(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        )}
        {!editingPrompt && playOn && (
          <div className="actions-row-prompt-display">
            ▸ plays <code>{action.play_before_action}</code>
          </div>
        )}
      </div>
    </li>
  );
}

export function MenuActionsEditor({
  actions,
  onChange,
}: {
  actions: Record<string, MenuAction>;
  onChange: (next: Record<string, MenuAction>) => void;
}) {
  const allNodes = useFlowStore((s) => s.nodes);
  const [newKey, setNewKey] = useState<string>("");

  // Build a richer per-target descriptor: line-1 = user-given name / id,
  // line-2 = "<action kind label> → <resolved deep target>" when discoverable.
  const targetOptions = allNodes.map((n) => {
    const def = getNodeType(n.type as NodeKind);
    const data = n.data as Record<string, unknown>;
    const userName =
      (data.name as string | undefined) ?? (data.label as string | undefined) ?? n.id;

    // Resolve the deep target if this is a wrapper-style action (transfer, goto, voicemail).
    let resolved: string | undefined;
    if ("target_node_id" in data && typeof data.target_node_id === "string") {
      resolved = data.target_node_id;
    } else if ("target_menu_node_id" in data && typeof data.target_menu_node_id === "string") {
      resolved = data.target_menu_node_id;
    } else if ("mailbox_node_id" in data && typeof data.mailbox_node_id === "string") {
      resolved = data.mailbox_node_id;
    } else if ("number" in data && typeof data.number === "string") {
      resolved = data.number;
    } else if ("uri" in data && typeof data.uri === "string") {
      resolved = data.uri;
    } else if ("extension" in data && typeof data.extension === "string") {
      resolved = data.extension;
    }

    const subLabel = resolved
      ? `${def.label} → ${resolved}`
      : def.label;

    return { id: n.id, label: userName, subLabel };
  });

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
        <ul className="actions-rows">
          {Object.entries(actions).map(([key, action]) => (
            <ActionRow
              key={key}
              inputKey={key}
              action={action}
              targetOptions={targetOptions}
              onChange={(next) => onChange({ ...actions, [key]: next })}
              onRemove={() => {
                const next = { ...actions };
                delete next[key];
                onChange(next);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
