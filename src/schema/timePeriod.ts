import { z } from "zod";

/**
 * A single composite time-of-day / day / month constraint.
 * All declared fields must match (AND). Undefined/empty fields mean "any".
 *
 * Day-of-week uses ISO numbering: 1=Mon, 2=Tue, … 7=Sun.
 * `time_from` > `time_to` means an overnight window (e.g. 22:00 → 06:00).
 */
export const TimePeriodSchema = z.object({
  time_from: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM")
    .optional(),
  time_to: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM")
    .optional(),
  days_of_week: z.array(z.number().int().min(1).max(7)).optional(),
  days_of_month: z.array(z.number().int().min(1).max(31)).optional(),
  months: z.array(z.number().int().min(1).max(12)).optional(),
  years: z.array(z.number().int().min(1970).max(3000)).optional(),
});
export type TimePeriod = z.infer<typeof TimePeriodSchema>;

/** A named period is an OR over a list of composite periods. */
export const TimePeriodListSchema = z.array(TimePeriodSchema);
export type TimePeriodList = z.infer<typeof TimePeriodListSchema>;

/** Entities carry a dictionary of named periods. */
export const TimePeriodMapSchema = z.record(z.string().min(1), TimePeriodListSchema);
export type TimePeriodMap = z.infer<typeof TimePeriodMapSchema>;

// ---- Pure evaluation helpers --------------------------------------------

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isoDow(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export function matchesPeriod(p: TimePeriod, date: Date): boolean {
  if (p.years && p.years.length > 0 && !p.years.includes(date.getFullYear())) return false;
  if (p.months && p.months.length > 0 && !p.months.includes(date.getMonth() + 1)) return false;
  if (p.days_of_month && p.days_of_month.length > 0 && !p.days_of_month.includes(date.getDate()))
    return false;
  if (p.days_of_week && p.days_of_week.length > 0 && !p.days_of_week.includes(isoDow(date)))
    return false;
  if (p.time_from || p.time_to) {
    const mins = date.getHours() * 60 + date.getMinutes();
    const fromM = p.time_from ? toMin(p.time_from) : 0;
    const toM = p.time_to ? toMin(p.time_to) : 24 * 60 - 1;
    if (fromM <= toM) {
      if (mins < fromM || mins > toM) return false;
    } else {
      // overnight window
      if (mins < fromM && mins > toM) return false;
    }
  }
  return true;
}

export function isAnyPeriodActive(periods: TimePeriodList | undefined, date: Date): boolean {
  if (!periods || periods.length === 0) return false;
  return periods.some((p) => matchesPeriod(p, date));
}

// ---- Human-readable summary (used by the picker chip) ------------------

const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function rangeOrList(items: number[], labels: string[]): string {
  // Compact contiguous runs to "Mon-Fri", non-contiguous stays as "Mon, Wed, Fri".
  if (items.length === 0) return "";
  const sorted = [...items].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === runEnd + 1) {
      runEnd = sorted[i];
    } else {
      parts.push(formatRun(runStart, runEnd, labels));
      runStart = sorted[i];
      runEnd = sorted[i];
    }
  }
  parts.push(formatRun(runStart, runEnd, labels));
  return parts.join(", ");
}

function formatRun(start: number, end: number, labels: string[]): string {
  if (start === end) return labels[start - 1];
  if (end - start === 1) return `${labels[start - 1]}, ${labels[end - 1]}`;
  return `${labels[start - 1]}-${labels[end - 1]}`;
}

export function summarizePeriod(p: TimePeriod): string {
  const bits: string[] = [];
  if (p.time_from || p.time_to) {
    bits.push(`${p.time_from ?? "00:00"} – ${p.time_to ?? "23:59"}`);
  }
  if (p.days_of_week && p.days_of_week.length > 0) {
    bits.push(rangeOrList(p.days_of_week, DOW_SHORT));
  }
  if (p.days_of_month && p.days_of_month.length > 0) {
    bits.push(`day ${p.days_of_month.join(",")}`);
  }
  if (p.months && p.months.length > 0) {
    bits.push(`in ${rangeOrList(p.months, MONTH_SHORT)}`);
  }
  if (p.years && p.years.length > 0) {
    bits.push(`year ${p.years.join(",")}`);
  }
  return bits.length === 0 ? "(any)" : bits.join(" · ");
}

export function summarizeList(list: TimePeriodList | undefined): string {
  if (!list || list.length === 0) return "(undefined)";
  if (list.length === 1) return summarizePeriod(list[0]);
  return `${list.length} sub-periods`;
}

// ---- Auto-naming -------------------------------------------------------

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function snake(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function autoNameOne(p: TimePeriod): string {
  const bits: string[] = [];
  if (p.days_of_week && p.days_of_week.length > 0) {
    if (sameSet(p.days_of_week, [1, 2, 3, 4, 5])) bits.push("weekdays");
    else if (sameSet(p.days_of_week, [6, 7])) bits.push("weekends");
    else bits.push(rangeOrList(p.days_of_week, DOW_SHORT));
  }
  if (p.time_from || p.time_to) {
    const from = (p.time_from ?? "00:00").replace(":", "");
    const to = (p.time_to ?? "2359").replace(":", "");
    bits.push(`${from}-${to}`);
  }
  if (p.months && p.months.length > 0 && p.months.length < 12) {
    bits.push(rangeOrList(p.months, MONTH_SHORT));
  }
  if (p.days_of_month && p.days_of_month.length > 0) {
    bits.push(`day_${p.days_of_month.join("_")}`);
  }
  if (p.years && p.years.length > 0) {
    bits.push(p.years.join("_"));
  }
  return bits.length === 0 ? "any_time" : snake(bits.join(" "));
}

export function autoNamePeriod(list: TimePeriodList): string {
  if (!list || list.length === 0) return "untitled";
  const first = autoNameOne(list[0]);
  if (list.length === 1) return first;
  return `${first}_plus_${list.length - 1}`;
}

export function uniqueName(desired: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(desired)) return desired;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${desired}_${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${desired}_${Date.now()}`;
}
