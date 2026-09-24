/**
 * apps/web/src/pages/calendar/calendar-model.ts — pure, DOM-free model behind /calendar (U-CAL).
 * Normalising the two real sources into one event type, timezone-correct date handling ([C9]),
 * the overlap column layout ([C2]), filters ([C5]) and range navigation ([C1]/[C3]) all live here
 * so each rule is unit-testable without rendering a grid.
 *
 * [C9], THE ONE THAT BITES. A session's `date` is a bare `YYYY-MM-DD` — a calendar date with no
 * time and no zone. `new Date("2026-09-25")` parses that as UTC midnight, so in any zone behind
 * UTC it renders as the 24th. Every date-only value in this file goes through `parseLocalDate`,
 * and nothing here ever calls `new Date(<date-only string>)`. Meetings are the opposite case:
 * their ISO strings carry an offset and ARE absolute instants, so `new Date(iso)` is right for
 * them and the grid reads them back in the viewer's own zone — the one stated timezone.
 */
import type { SessionSummary, UpcomingMeeting } from "../../api/types.js";

export type CalendarView = "month" | "week" | "day" | "list";
export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "day", "list"];

export function isCalendarView(value: string | null): value is CalendarView {
  return value !== null && (CALENDAR_VIEWS as string[]).includes(value);
}

export interface CalendarEvent {
  /** `session:<id>` / `meeting:<id>` — unique across both sources. */
  id: string;
  kind: "session" | "meeting";
  title: string;
  start: Date;
  end: Date;
  /** Sessions carry a date and no time, so they sit in the all-day lane, never on the hour axis. */
  allDay: boolean;
  /** Present only when the API returned one — [I1]/[C6]: no field is invented here. */
  org?: string;
  organizer?: string;
  meetingUrl?: string;
  participants?: string[];
  /** Internal route for a past session; absent for a meeting. */
  href?: string;
}

const MS_PER_MINUTE = 60_000;
const DEFAULT_MEETING_MINUTES = 30;

/** `YYYY-MM-DD` -> local midnight of THAT calendar day. Never `new Date(string)`. */
export function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function toCalendarEvents(
  sessions: readonly SessionSummary[],
  meetings: readonly UpcomingMeeting[],
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const s of sessions) {
    const start = parseLocalDate(s.date);
    const event: CalendarEvent = {
      id: `session:${s._id}`,
      kind: "session",
      title: s.title,
      start,
      end: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999),
      allDay: true,
      href: `/sessions/${encodeURIComponent(s._id)}`,
    };
    if (s.org) event.org = s.org;
    if (s.participants && s.participants.length > 0) event.participants = s.participants;
    events.push(event);
  }

  for (const m of meetings) {
    const start = new Date(m.startTime);
    if (Number.isNaN(start.getTime())) continue; // an unparseable row is skipped, never drawn at 00:00
    const parsedEnd = m.endTime ? new Date(m.endTime) : null;
    const end = parsedEnd && !Number.isNaN(parsedEnd.getTime())
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_MEETING_MINUTES * MS_PER_MINUTE);
    const event: CalendarEvent = { id: `meeting:${m.id}`, kind: "meeting", title: m.title, start, end, allDay: false };
    if (m.organizer) event.organizer = m.organizer;
    if (m.meetingUrl) event.meetingUrl = m.meetingUrl;
    events.push(event);
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
}

export function eventsOnDay(events: readonly CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => isSameLocalDay(e.start, day));
}

export interface PositionedEvent {
  event: CalendarEvent;
  /** 0-based column within its overlap cluster. */
  column: number;
  /** How many columns the cluster needs — the width divisor. */
  columns: number;
  topPct: number;
  heightPct: number;
}

/** A zero-length or 5-minute event still needs to be clickable. */
const MIN_HEIGHT_PCT = (10 / (24 * 60)) * 100;

/**
 * [C2] — place one day's timed events on a 24-hour axis, giving overlapping events side-by-side
 * columns. Events are swept in start order; a cluster is a maximal run whose members overlap the
 * running cluster end. Within a cluster each event takes the lowest column whose last event has
 * already finished, so two events at 11:00 and 11:15 get columns 0 and 1 and NEITHER is hidden.
 */
export function layoutDayColumn(events: readonly CalendarEvent[], day: Date): PositionedEvent[] {
  const timed = eventsOnDay(events, day)
    .filter((e) => !e.allDay)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const dayStart = startOfLocalDay(day).getTime();
  const dayMs = 24 * 60 * MS_PER_MINUTE;
  const out: PositionedEvent[] = [];

  let cluster: PositionedEvent[] = [];
  let clusterEnd = -Infinity;
  const columnEnds: number[] = [];

  function flush(): void {
    for (const p of cluster) p.columns = columnEnds.length;
    out.push(...cluster);
    cluster = [];
    columnEnds.length = 0;
    clusterEnd = -Infinity;
  }

  for (const event of timed) {
    const start = event.start.getTime();
    const end = Math.max(event.end.getTime(), start);
    if (start >= clusterEnd && cluster.length > 0) flush();

    let column = columnEnds.findIndex((e) => e <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    clusterEnd = Math.max(clusterEnd, end);
    cluster.push({
      event,
      column,
      columns: 1,
      topPct: ((start - dayStart) / dayMs) * 100,
      heightPct: Math.max(MIN_HEIGHT_PCT, ((end - start) / dayMs) * 100),
    });
  }
  if (cluster.length > 0) flush();

  return out;
}

export interface CalendarFilters {
  /** "" = both kinds. */
  kind: "" | "session" | "meeting";
  /** Matched against a session's `org` or a meeting's `organizer`. */
  source: string;
  query: string;
}

export const EMPTY_CALENDAR_FILTERS: CalendarFilters = { kind: "", source: "", query: "" };

export function sourceOf(event: CalendarEvent): string | undefined {
  return event.kind === "session" ? event.org : event.organizer;
}

export function filterEvents(events: readonly CalendarEvent[], filters: CalendarFilters): CalendarEvent[] {
  const q = filters.query.trim().toLowerCase();
  return events.filter((e) => {
    if (filters.kind && e.kind !== filters.kind) return false;
    if (filters.source && sourceOf(e) !== filters.source) return false;
    if (q && !e.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function activeCalendarFilterCount(filters: CalendarFilters): number {
  return (filters.kind ? 1 : 0) + (filters.source ? 1 : 0) + (filters.query.trim() ? 1 : 0);
}

/** Every distinct org/organiser present in the data — the filter's options are derived, never a
 * hardcoded list that could name a source the tenant does not have. */
export function sourceOptions(events: readonly CalendarEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    const s = sourceOf(e);
    if (s) set.add(s);
  }
  return [...set].sort();
}

export interface CalendarRange {
  days: Date[];
  label: string;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function startOfWeek(d: Date): Date {
  const start = startOfLocalDay(d);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function rangeFor(view: CalendarView, anchor: Date): CalendarRange {
  if (view === "day") {
    return { days: [startOfLocalDay(anchor)], label: anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    return { days, label: `${days[0]!.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6]!.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` };
  }
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const count = new Date(y, m + 1, 0).getDate();
  return { days: Array.from({ length: count }, (_, i) => new Date(y, m, i + 1)), label: `${MONTH_NAMES[m]} ${y}` };
}

/** Prev/next by the view's own unit. Month arithmetic is done on day 1 so 31 Jan + 1 month is
 * February, not the 3rd of March. */
export function shiftRange(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === "day") return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + direction);
  if (view === "week") return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * direction);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

export interface MonthCell {
  date: Date;
  inMonth: boolean;
}

/** Whole weeks, Sunday-first, with the leading/trailing days of the neighbouring months so the
 * grid is rectangular — the shape Google Calendar's month view has. */
export function monthMatrix(anchor: Date): MonthCell[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const cells: MonthCell[] = [];
  const cursor = new Date(start);
  while (cursor <= last || cells.length % 7 !== 0) {
    cells.push({ date: new Date(cursor), inMonth: cursor.getMonth() === anchor.getMonth() });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

export function formatTimeRange(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${event.start.toLocaleTimeString(undefined, opts)}–${event.end.toLocaleTimeString(undefined, opts)}`;
}

/** The one stated timezone ([C9]) — the viewer's own, named on screen rather than implied. */
export function localTimeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

export function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
