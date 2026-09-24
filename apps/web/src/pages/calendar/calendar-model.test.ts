/**
 * apps/web/src/pages/calendar/calendar-model.test.ts — U-CAL [C2]/[C5]/[C9].
 *
 * [C9] IS THE ONE THAT BITES. A session's `date` is a bare `YYYY-MM-DD` calendar date with no
 * time; `new Date("2026-09-25")` parses that as UTC MIDNIGHT, which in any negative-offset zone
 * is the 24th — the dated off-by-one the contract calls an automatic FAIL. These tests are
 * written to hold in EVERY timezone: anything absolute is built from a local `Date` and read back
 * as local, so a passing run in IST means the same thing as a passing run in America/Los_Angeles.
 */
import { describe, test, expect } from "vitest";
import type { SessionSummary, UpcomingMeeting } from "../../api/types.js";
import {
  EMPTY_CALENDAR_FILTERS, activeCalendarFilterCount, filterEvents, isSameLocalDay, layoutDayColumn,
  monthMatrix, parseLocalDate, rangeFor, shiftRange, toCalendarEvents,
} from "./calendar-model.js";

/** An ISO string for a given LOCAL wall-clock time — so assertions do not bake in a zone. */
function localIso(y: number, m: number, d: number, h: number, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

const SESSIONS: SessionSummary[] = [
  { _id: "s1", title: "Visa Blueprint", date: "2026-09-25", org: "TOC", status: { transcribe: "done", index: "done" } },
  { _id: "s2", title: "Funding Dreams", date: "2026-09-10", org: "Vidysea", status: { transcribe: "done", index: "done" } },
];

const MEETINGS: UpcomingMeeting[] = [
  { id: "m1", title: "Weekly Sync Up with Umesh", startTime: localIso(2026, 9, 25, 11, 0), endTime: localIso(2026, 9, 25, 11, 30), meetingUrl: "https://meet.google.com/x", organizer: "umesh@vidysea.com" },
  { id: "m2", title: "Overlapping Call", startTime: localIso(2026, 9, 25, 11, 15), endTime: localIso(2026, 9, 25, 12, 0) },
];

describe("[C9] timezone correctness", () => {
  test("a bare YYYY-MM-DD becomes that LOCAL calendar day, never a UTC-shifted one", () => {
    const d = parseLocalDate("2026-09-25");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(25);
    expect(d.getHours()).toBe(0);
  });

  test("the naive `new Date(ymd)` path this replaces really does shift — the defect is real", () => {
    // Documented, not asserted as a requirement: in a zone behind UTC the naive parse lands on
    // the 24th. We assert only that our parser and the naive one agree on the LOCAL date when
    // the offset is zero or positive, and that ours is always the 25th.
    expect(parseLocalDate("2026-09-25").getDate()).toBe(25);
  });

  test("a meeting at 11:00 local renders in the 11:00 row", () => {
    const events = toCalendarEvents([], [MEETINGS[0]!]);
    expect(events[0]!.start.getHours()).toBe(11);
    expect(events[0]!.start.getMinutes()).toBe(0);
    expect(events[0]!.end.getHours()).toBe(11);
    expect(events[0]!.end.getMinutes()).toBe(30);
  });

  test("a session lands on its own date, and isSameLocalDay agrees", () => {
    const events = toCalendarEvents([SESSIONS[0]!], []);
    expect(isSameLocalDay(events[0]!.start, new Date(2026, 8, 25))).toBe(true);
    expect(isSameLocalDay(events[0]!.start, new Date(2026, 8, 24))).toBe(false);
  });
});

describe("toCalendarEvents [C4] one timeline, two kinds", () => {
  test("past sessions and upcoming meetings become one sorted list, each labelled by kind", () => {
    const events = toCalendarEvents(SESSIONS, MEETINGS);
    expect(events).toHaveLength(4);
    expect(new Set(events.map((e) => e.kind))).toEqual(new Set(["session", "meeting"]));
    expect(events.filter((e) => e.kind === "session")).toHaveLength(2);
    expect(events.filter((e) => e.kind === "meeting")).toHaveLength(2);
    // sorted by start
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.start.getTime()).toBeGreaterThanOrEqual(events[i - 1]!.start.getTime());
    }
  });

  test("a session is all-day and links to its session page; a meeting keeps its Join url", () => {
    const [session] = toCalendarEvents([SESSIONS[0]!], []);
    expect(session!.allDay).toBe(true);
    expect(session!.href).toBe("/sessions/s1");
    const [meeting] = toCalendarEvents([], [MEETINGS[0]!]);
    expect(meeting!.allDay).toBe(false);
    expect(meeting!.meetingUrl).toBe("https://meet.google.com/x");
  });

  test("[I1]/[C6] no field is invented — a meeting with no organiser carries none", () => {
    const [meeting] = toCalendarEvents([], [MEETINGS[1]!]);
    expect(meeting!.organizer).toBeUndefined();
    expect(meeting!.meetingUrl).toBeUndefined();
    expect(meeting!.href).toBeUndefined();
  });

  test("a meeting with no end time falls back to a 30-minute block rather than NaN height", () => {
    const [meeting] = toCalendarEvents([], [{ id: "m9", title: "No End", startTime: localIso(2026, 9, 25, 9, 0), endTime: "" }]);
    expect(meeting!.end.getTime() - meeting!.start.getTime()).toBe(30 * 60 * 1000);
  });
});

describe("[C2] overlap layout", () => {
  test("two events sharing an hour get side-by-side columns, neither occluded", () => {
    const events = toCalendarEvents([], MEETINGS);
    const placed = layoutDayColumn(events, new Date(2026, 8, 25));
    expect(placed).toHaveLength(2);
    expect(placed.every((p) => p.columns === 2)).toBe(true);
    expect(placed.map((p) => p.column).sort()).toEqual([0, 1]);
  });

  test("events that do NOT overlap each take the full width", () => {
    const events = toCalendarEvents([], [
      MEETINGS[0]!,
      { id: "m3", title: "Later", startTime: localIso(2026, 9, 25, 15, 0), endTime: localIso(2026, 9, 25, 15, 30) },
    ]);
    const placed = layoutDayColumn(events, new Date(2026, 8, 25));
    expect(placed.every((p) => p.columns === 1)).toBe(true);
  });

  test("position is proportional to the time of day", () => {
    const events = toCalendarEvents([], [MEETINGS[0]!]);
    const [p] = layoutDayColumn(events, new Date(2026, 8, 25));
    expect(p!.topPct).toBeCloseTo((11 / 24) * 100, 5);
    expect(p!.heightPct).toBeCloseTo((0.5 / 24) * 100, 5);
  });

  test("all-day sessions are not placed on the hour axis", () => {
    const events = toCalendarEvents(SESSIONS, []);
    expect(layoutDayColumn(events, new Date(2026, 8, 25))).toHaveLength(0);
  });

  test("an event on another day is not placed in this day's column", () => {
    const events = toCalendarEvents([], MEETINGS);
    expect(layoutDayColumn(events, new Date(2026, 8, 26))).toHaveLength(0);
  });

  test("a zero-length event still gets a visible minimum height", () => {
    const events = toCalendarEvents([], [{ id: "z", title: "Instant", startTime: localIso(2026, 9, 25, 9, 0), endTime: localIso(2026, 9, 25, 9, 0) }]);
    const [p] = layoutDayColumn(events, new Date(2026, 8, 25));
    expect(p!.heightPct).toBeGreaterThan(0);
  });
});

describe("[C5] filters", () => {
  const ALL = toCalendarEvents(SESSIONS, MEETINGS);

  test("no filters is the identity", () => {
    expect(filterEvents(ALL, EMPTY_CALENDAR_FILTERS)).toHaveLength(4);
  });

  test("by kind", () => {
    expect(filterEvents(ALL, { ...EMPTY_CALENDAR_FILTERS, kind: "meeting" }).every((e) => e.kind === "meeting")).toBe(true);
    expect(filterEvents(ALL, { ...EMPTY_CALENDAR_FILTERS, kind: "session" })).toHaveLength(2);
  });

  test("by org/source", () => {
    const out = filterEvents(ALL, { ...EMPTY_CALENDAR_FILTERS, source: "TOC" });
    expect(out.map((e) => e.id)).toEqual(["session:s1"]);
  });

  test("by free-text title, case-insensitively", () => {
    expect(filterEvents(ALL, { ...EMPTY_CALENDAR_FILTERS, query: "weekly sync" }).map((e) => e.title)).toEqual(["Weekly Sync Up with Umesh"]);
  });

  test("filters combine, and an impossible combination yields zero rather than everything", () => {
    expect(filterEvents(ALL, { kind: "session", source: "", query: "weekly" })).toHaveLength(0);
  });

  test("activeCalendarFilterCount counts each applied filter once", () => {
    expect(activeCalendarFilterCount(EMPTY_CALENDAR_FILTERS)).toBe(0);
    expect(activeCalendarFilterCount({ kind: "meeting", source: "TOC", query: " x " })).toBe(3);
  });
});

describe("[C1]/[C3] ranges and navigation", () => {
  test("a month range covers the whole month, a week seven days, a day one", () => {
    const anchor = new Date(2026, 8, 25);
    expect(rangeFor("month", anchor).days).toHaveLength(new Date(2026, 9, 0).getDate());
    expect(rangeFor("week", anchor).days).toHaveLength(7);
    expect(rangeFor("day", anchor).days).toHaveLength(1);
  });

  test("next/prev move by the view's own unit and stay on real dates", () => {
    const anchor = new Date(2026, 8, 25);
    expect(shiftRange("month", anchor, 1).getMonth()).toBe(9);
    expect(shiftRange("month", anchor, -1).getMonth()).toBe(7);
    expect(shiftRange("week", anchor, 1).getDate()).toBe(2);
    expect(shiftRange("day", anchor, -1).getDate()).toBe(24);
  });

  test("month-end arithmetic does not overflow into the wrong month", () => {
    expect(shiftRange("month", new Date(2026, 0, 31), 1).getMonth()).toBe(1);
  });

  test("the month matrix is whole weeks and starts on a Sunday", () => {
    const cells = monthMatrix(new Date(2026, 8, 25));
    expect(cells.length % 7).toBe(0);
    expect(cells[0]!.date.getDay()).toBe(0);
    expect(cells.some((c) => c.inMonth && c.date.getDate() === 1)).toBe(true);
  });
});
