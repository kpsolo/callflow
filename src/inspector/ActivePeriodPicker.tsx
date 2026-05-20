import { useState } from "react";
import { useFlowStore } from "@/state/store";
import { summarizeList } from "@/schema";
import { TimePeriodsModal } from "./TimePeriodsModal";
import type { NodeKind } from "@/schema";

export function ActivePeriodPicker({
  value,
  onChange,
  nodeKind,
}: {
  value: string;
  onChange: (next: string) => void;
  nodeKind?: NodeKind;
}) {
  const periods = useFlowStore((s) => s.entity.time_periods ?? {});
  const names = Object.keys(periods).sort();
  const [open, setOpen] = useState(false);

  const known = value === "always" || value === "" || names.includes(value);
  const summary = value === "always" ? "always active" : summarizeList(periods[value]);

  // Find mismatch description based on nodeKind
  let mismatchText = "";
  if (nodeKind === "menu_root" || nodeKind === "menu_custom") {
    mismatchText = "If current time doesn't match this period, the call follows the 'inactive' port handle. If no node is connected to 'inactive', the call will disconnect.";
  } else if (nodeKind === "call_screening" || nodeKind === "screening_rule") {
    mismatchText = "If current time doesn't match, this screening rule is skipped and evaluation falls through to subsequent rules.";
  } else if (nodeKind === "call_forwarding" || nodeKind === "forward_follow_me" || nodeKind === "forward_advanced") {
    mismatchText = "If current time doesn't match, this forwarding rule is skipped.";
  } else {
    // Fallback description for time conditions (e.g. cond_time) or other nodes
    mismatchText = "If current time doesn't match, this conditional branch evaluates to negative.";
  }

  // Schedule details text
  const scheduleText = value === "always"
    ? "Always active (24/7)"
    : (periods[value] ? summarizeList(periods[value]) : "No time intervals defined");

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

        <div className="active-period-helper-card">
          <div className="active-period-helper-behavior">
            <strong>If time doesn't match:</strong> {mismatchText}
          </div>
          <div className="active-period-helper-schedule">
            <strong>Schedule:</strong> <code>{scheduleText}</code>
          </div>
          <div className="active-period-helper-tip">
            Tip: Click <em>Edit periods…</em> above to see all defined named schedules.
          </div>
        </div>
      </div>
      {open && <TimePeriodsModal onClose={() => setOpen(false)} />}
    </>
  );
}
