import { useRef, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useFlowStore } from "@/state/store";
import {
  autoNamePeriod,
  summarizePeriod,
  uniqueName,
  type TimePeriod,
  type TimePeriodList,
  type TimePeriodMap,
} from "@/schema";
import { TimePeriodEditor } from "./TimePeriodEditor";
import "./TimePeriodsModal.css";

const BUSINESS_HOURS_STARTER: TimePeriod = {
  time_from: "09:00",
  time_to: "17:00",
  days_of_week: [1, 2, 3, 4, 5],
};

export function TimePeriodsModal({ onClose }: { onClose: () => void }) {
  const entity = useFlowStore((s) => s.entity);
  const setEntity = useFlowStore((s) => s.setEntity);
  const periods: TimePeriodMap = entity.time_periods ?? {};
  const names = Object.keys(periods).sort();
  const [selected, setSelected] = useState<string | null>(names[0] ?? null);

  // Periods whose name is still auto-derived from their definition.
  // Once the user manually renames, the period is removed from this set
  // so further composition changes won't keep retitling it.
  const autoNamed = useRef<Set<string>>(new Set());

  const update = (next: TimePeriodMap) => setEntity({ ...entity, time_periods: next });

  const current = selected ? periods[selected] : undefined;

  const addPeriod = (starter: TimePeriod) => {
    const list: TimePeriodList = [starter];
    const desired = autoNamePeriod(list);
    const name = uniqueName(desired, Object.keys(periods));
    update({ ...periods, [name]: list });
    autoNamed.current.add(name);
    setSelected(name);
  };

  // Rename the currently selected period. Treated as a user-driven rename:
  // we drop it from the auto-named set so subsequent edits don't overwrite the choice.
  const rename = (oldName: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (trimmed in periods) return;
    const { [oldName]: list, ...rest } = periods;
    update({ ...rest, [trimmed]: list });
    autoNamed.current.delete(oldName);
    setSelected(trimmed);
  };

  const remove = (name: string) => {
    if (!window.confirm(`Delete time period "${name}"?`)) return;
    const { [name]: _, ...rest } = periods;
    void _;
    update(rest);
    autoNamed.current.delete(name);
    setSelected(Object.keys(rest)[0] ?? null);
  };

  // Update the list of sub-periods AND re-derive the name if it's still auto.
  const setList = (list: TimePeriodList) => {
    if (!selected) return;
    if (autoNamed.current.has(selected)) {
      const desired = autoNamePeriod(list);
      if (desired !== selected) {
        const taken = Object.keys(periods).filter((n) => n !== selected);
        const unique = uniqueName(desired, taken);
        const { [selected]: _, ...rest } = periods;
        void _;
        update({ ...rest, [unique]: list });
        autoNamed.current.delete(selected);
        autoNamed.current.add(unique);
        setSelected(unique);
        return;
      }
    }
    update({ ...periods, [selected]: list });
  };

  const isAuto = selected ? autoNamed.current.has(selected) : false;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Time periods"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="modal tpm">
        <header>
          <strong>Time periods — {entity.name}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="tpm-body">
          <aside className="tpm-list">
            <div className="tpm-add-row">
              <button type="button" onClick={() => addPeriod(BUSINESS_HOURS_STARTER)}>
                + Business hours
              </button>
              <button type="button" onClick={() => addPeriod({ days_of_week: [6, 7] })}>
                + Weekends
              </button>
              <button type="button" onClick={() => addPeriod({})}>
                + Empty
              </button>
            </div>
            {names.length === 0 ? (
              <p className="shell-placeholder">
                No periods defined yet. Click one of the buttons above to start.
              </p>
            ) : (
              <ul>
                {names.map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      className={selected === n ? "is-selected" : ""}
                      onClick={() => setSelected(n)}
                    >
                      <span className="tpm-name">
                        {n}
                        {autoNamed.current.has(n) && (
                          <small className="tpm-auto-flag" title="Name is auto-generated">
                            auto
                          </small>
                        )}
                      </span>
                      <small>{summarizeFirst(periods[n])}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="tpm-detail">
            {!selected || !current ? (
              <p className="shell-placeholder">
                Pick a period on the left, or add one above.
              </p>
            ) : (
              <>
                <div className="tpm-detail-header">
                  <label className="tpm-rename">
                    <span>
                      Name {isAuto && <em className="tpm-auto-hint">(auto — type to lock)</em>}
                    </span>
                    <input
                      key={selected}
                      defaultValue={selected}
                      onBlur={(e) => rename(selected, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="inspector-delete"
                    onClick={() => remove(selected)}
                  >
                    Delete
                  </button>
                </div>

                <p className="tpm-explain">
                  This period is active when <strong>any</strong> sub-period below matches. Within
                  one sub-period, every set component must match (AND).
                </p>

                {current.map((p, i) => (
                  <div key={i} className="tpm-subperiod">
                    <div className="tpm-subperiod-header">
                      <span>Sub-period {i + 1}</span>
                      <small>{summarizePeriod(p)}</small>
                      <button
                        type="button"
                        className="tpm-subperiod-remove"
                        onClick={() => setList(current.filter((_, j) => j !== i))}
                        disabled={current.length === 1}
                        title={
                          current.length === 1
                            ? "A period needs at least one sub-period"
                            : "Remove"
                        }
                        aria-label="Remove"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                    <TimePeriodEditor
                      period={p}
                      onChange={(next) =>
                        setList(current.map((x, j) => (j === i ? next : x)))
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="tpm-add-sub"
                  onClick={() => setList([...current, {}])}
                >
                  + Add sub-period (OR)
                </button>
              </>
            )}
          </section>
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function summarizeFirst(list: TimePeriodList | undefined): string {
  if (!list || list.length === 0) return "(empty)";
  const first = summarizePeriod(list[0]);
  if (list.length === 1) return first;
  return `${first} +${list.length - 1}`;
}
