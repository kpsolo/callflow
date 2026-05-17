import { useState } from "react";
import { useFlowStore } from "@/state/store";
import { summarizeList } from "@/schema";
import { TimePeriodsModal } from "./TimePeriodsModal";

export function ActivePeriodPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const periods = useFlowStore((s) => s.entity.time_periods ?? {});
  const names = Object.keys(periods).sort();
  const [open, setOpen] = useState(false);

  const known = value === "always" || value === "" || names.includes(value);
  const summary = value === "always" ? "always active" : summarizeList(periods[value]);

  return (
    <>
      <div className="active-period-picker">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="active-period-select"
        >
          <option value="always">always</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {!known && <option value={value}>{value} (not defined)</option>}
        </select>
        <button
          type="button"
          className="active-period-edit"
          onClick={() => setOpen(true)}
          title="Manage time periods"
        >
          Edit periods…
        </button>
        <small className="active-period-summary" title={summary}>
          {summary}
        </small>
      </div>
      {open && <TimePeriodsModal onClose={() => setOpen(false)} />}
    </>
  );
}
