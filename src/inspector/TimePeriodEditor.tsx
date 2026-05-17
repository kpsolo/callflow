import type { TimePeriod } from "@/schema";
import "./TimePeriodEditor.css";

const DOW = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 7, label: "Sun" },
];

const MONTHS = [
  { v: 1, label: "Jan" },
  { v: 2, label: "Feb" },
  { v: 3, label: "Mar" },
  { v: 4, label: "Apr" },
  { v: 5, label: "May" },
  { v: 6, label: "Jun" },
  { v: 7, label: "Jul" },
  { v: 8, label: "Aug" },
  { v: 9, label: "Sep" },
  { v: 10, label: "Oct" },
  { v: 11, label: "Nov" },
  { v: 12, label: "Dec" },
];

function toggle<T>(arr: T[] | undefined, value: T): T[] {
  const cur = arr ?? [];
  return cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
}

function parseNumberList(raw: string): number[] | undefined {
  const out: number[] = [];
  for (const tok of raw.split(/[,\s]+/)) {
    if (!tok) continue;
    if (tok.includes("-")) {
      const [a, b] = tok.split("-").map((s) => parseInt(s, 10));
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
        for (let i = a; i <= b; i++) out.push(i);
      }
    } else {
      const n = parseInt(tok, 10);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  if (out.length === 0) return undefined;
  // Deduplicate while preserving order.
  return Array.from(new Set(out));
}

function numberListString(arr: number[] | undefined): string {
  return arr && arr.length > 0 ? arr.join(", ") : "";
}

export function TimePeriodEditor({
  period,
  onChange,
}: {
  period: TimePeriod;
  onChange: (next: TimePeriod) => void;
}) {
  return (
    <div className="tpe">
      <div className="tpe-row">
        <span className="tpe-label">Time of day</span>
        <div className="tpe-time-row">
          <input
            type="time"
            value={period.time_from ?? ""}
            onChange={(e) => onChange({ ...period, time_from: e.target.value || undefined })}
          />
          <span>–</span>
          <input
            type="time"
            value={period.time_to ?? ""}
            onChange={(e) => onChange({ ...period, time_to: e.target.value || undefined })}
          />
          <button
            type="button"
            className="tpe-clear"
            onClick={() => onChange({ ...period, time_from: undefined, time_to: undefined })}
            disabled={!period.time_from && !period.time_to}
          >
            clear
          </button>
        </div>
      </div>

      <div className="tpe-row">
        <span className="tpe-label">Days of week</span>
        <div className="tpe-chips">
          {DOW.map((d) => {
            const on = period.days_of_week?.includes(d.v) ?? false;
            return (
              <button
                key={d.v}
                type="button"
                className={"tpe-chip" + (on ? " is-on" : "")}
                onClick={() => {
                  const next = toggle(period.days_of_week, d.v).sort((a, b) => a - b);
                  onChange({ ...period, days_of_week: next.length === 0 ? undefined : next });
                }}
                aria-pressed={on}
              >
                {d.label}
              </button>
            );
          })}
          <button
            type="button"
            className="tpe-link"
            onClick={() => onChange({ ...period, days_of_week: [1, 2, 3, 4, 5] })}
          >
            weekdays
          </button>
          <button
            type="button"
            className="tpe-link"
            onClick={() => onChange({ ...period, days_of_week: [6, 7] })}
          >
            weekends
          </button>
        </div>
      </div>

      <div className="tpe-row">
        <span className="tpe-label">Months</span>
        <div className="tpe-chips">
          {MONTHS.map((m) => {
            const on = period.months?.includes(m.v) ?? false;
            return (
              <button
                key={m.v}
                type="button"
                className={"tpe-chip" + (on ? " is-on" : "")}
                onClick={() => {
                  const next = toggle(period.months, m.v).sort((a, b) => a - b);
                  onChange({ ...period, months: next.length === 0 ? undefined : next });
                }}
                aria-pressed={on}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tpe-row">
        <span className="tpe-label">Days of month</span>
        <input
          type="text"
          placeholder="e.g. 1, 15, 25 or 1-7"
          value={numberListString(period.days_of_month)}
          onChange={(e) =>
            onChange({ ...period, days_of_month: parseNumberList(e.target.value) })
          }
        />
      </div>

      <div className="tpe-row">
        <span className="tpe-label">Years</span>
        <input
          type="text"
          placeholder="e.g. 2026 (leave blank for any)"
          value={numberListString(period.years)}
          onChange={(e) => onChange({ ...period, years: parseNumberList(e.target.value) })}
        />
      </div>
    </div>
  );
}
