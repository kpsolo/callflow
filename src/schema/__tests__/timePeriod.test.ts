import { describe, expect, it } from "vitest";
import {
  autoNamePeriod,
  isAnyPeriodActive,
  matchesPeriod,
  summarizePeriod,
  uniqueName,
  type TimePeriod,
} from "@/schema/timePeriod";

describe("TimePeriod evaluator", () => {
  it("matches a weekday business-hours window", () => {
    const p: TimePeriod = {
      time_from: "08:00",
      time_to: "18:00",
      days_of_week: [1, 2, 3, 4, 5],
    };
    // Monday 10:00 local — JS Date months are 0-indexed.
    expect(matchesPeriod(p, new Date(2026, 4, 18, 10, 0))).toBe(true); // Mon
    expect(matchesPeriod(p, new Date(2026, 4, 18, 7, 59))).toBe(false); // too early
    expect(matchesPeriod(p, new Date(2026, 4, 18, 18, 1))).toBe(false); // too late
    expect(matchesPeriod(p, new Date(2026, 4, 23, 10, 0))).toBe(false); // Saturday
  });

  it("handles overnight windows (time_from > time_to)", () => {
    const p: TimePeriod = { time_from: "22:00", time_to: "06:00" };
    expect(matchesPeriod(p, new Date(2026, 4, 18, 23, 0))).toBe(true);
    expect(matchesPeriod(p, new Date(2026, 4, 18, 4, 0))).toBe(true);
    expect(matchesPeriod(p, new Date(2026, 4, 18, 12, 0))).toBe(false);
  });

  it("OR-combines multiple sub-periods", () => {
    const list: TimePeriod[] = [
      { days_of_week: [6, 7] },
      { months: [12], days_of_month: [25] },
    ];
    expect(isAnyPeriodActive(list, new Date(2026, 4, 23, 12, 0))).toBe(true); // Sat
    expect(isAnyPeriodActive(list, new Date(2026, 11, 25, 12, 0))).toBe(true); // Christmas
    expect(isAnyPeriodActive(list, new Date(2026, 4, 18, 12, 0))).toBe(false); // Mon non-holiday
  });

  it("undefined components mean 'any'", () => {
    expect(matchesPeriod({}, new Date())).toBe(true);
  });

  it("auto-names typical periods", () => {
    expect(
      autoNamePeriod([{ time_from: "09:00", time_to: "17:00", days_of_week: [1, 2, 3, 4, 5] }]),
    ).toBe("weekdays_0900_1700");
    expect(autoNamePeriod([{ days_of_week: [6, 7] }])).toBe("weekends");
    expect(autoNamePeriod([{ months: [12], days_of_month: [25] }])).toBe("dec_day_25");
    expect(autoNamePeriod([{}])).toBe("any_time");
    expect(
      autoNamePeriod([
        { days_of_week: [1, 2, 3, 4, 5] },
        { days_of_week: [6, 7] },
        { months: [12], days_of_month: [25] },
      ]),
    ).toBe("weekdays_plus_2");
  });

  it("uniqueName appends a suffix when desired is taken", () => {
    expect(uniqueName("weekdays", [])).toBe("weekdays");
    expect(uniqueName("weekdays", ["weekdays"])).toBe("weekdays_2");
    expect(uniqueName("weekdays", ["weekdays", "weekdays_2"])).toBe("weekdays_3");
  });

  it("summary produces readable text", () => {
    expect(
      summarizePeriod({
        time_from: "08:00",
        time_to: "18:00",
        days_of_week: [1, 2, 3, 4, 5],
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      }),
    ).toMatch(/08:00 – 18:00.*Mon-Fri.*Jan-Dec/);
  });
});
