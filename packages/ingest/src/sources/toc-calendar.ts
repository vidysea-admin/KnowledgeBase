/**
 * packages/ingest/src/sources/toc-calendar.ts — U2 source-watcher. Pure parser for TOC's own
 * events calendar (`raw/TOC/TOC-Materials/_csv/calendar1.csv`, a Google-Sheets export): a month
 * header row (",APRIL,,,..."), a column-header row (",DATE,AGENDA,...") repeated under each
 * month, then data rows. No I/O in this module — run-watch.mjs reads the file and hands the raw
 * text in, so this is directly unit-testable against the real row shapes.
 *
 * Real quirks this parser has to survive (seen in the actual file, not hypothesized):
 *  - some AGENDA cells contain embedded newlines inside a quoted field ("How To Help A
 *    Student...\nCollege Application...\n\nThe College Essay Guys") — a per-line split breaks
 *    these, so this module tokenizes the WHOLE text with a small quote-aware state machine, not
 *    `text.split("\n")`.
 *  - DATE cells appear in three shapes: a bare day-of-month float ("28.0"), a day range
 *    ("25-26" — the event's start day is used), and an already-complete datetime
 *    ("2026-11-10 00:00:00" — used as-is, no month-header combination needed).
 *  - The sheet's year is implicit from the month header: April 2026 through March 2027 (a
 *    membership/program year, not a calendar year) — `yearForMonth` encodes that mapping.
 */

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

export interface TocCalendarEvent {
  /** Stable id for dedup: "<isoDate>:<agenda-slug>". */
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // raw HH:MM:SS as the sheet states it
  agenda: string;
  relevance?: string;
  mode?: string;
  location?: string;
  openTo?: string;
  registrationLink?: string;
  /** ISO datetime combining date+time, IST assumed (TOC's own audience) — absent when the sheet
   * gives no parseable time for this row. */
  startTime?: string;
}

/** Quote-aware CSV tokenizer (handles embedded newlines and commas inside quoted fields, and a
 * doubled `""` as an escaped quote) — a plain `split(",")`/`split("\n")` cannot parse this file. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // skip — normalized by the \n branch
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** TOC's sheet year: April(month index 3) through December is the FIRST calendar year of the
 * program year; January–March is the second. E.g. April 2026 .. March 2027. */
export function yearForMonth(monthIndex: number, firstYear: number): number {
  return monthIndex >= 3 ? firstYear : firstYear + 1;
}

function parseDayField(raw: string, monthIndex: number, firstYear: number): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Already a complete datetime ("2026-11-10 00:00:00") — use its own date, ignore the header
  // month entirely (it can span past this month's rows in the real sheet, e.g. a Nov row still
  // under APRIL's block because it was added out of order).
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // A day range ("25-26") — start day.
  const range = /^(\d{1,2})\s*-\s*\d{1,2}$/.exec(trimmed);
  const dayStr = range ? (range[1] ?? trimmed) : trimmed;

  const day = Number.parseFloat(dayStr);
  if (!Number.isFinite(day) || day < 1 || day > 31) return undefined;

  const year = yearForMonth(monthIndex, firstYear);
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(Math.trunc(day)).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function combineDateTime(dateIso: string, timeStr: string | undefined): string | undefined {
  if (!timeStr) return undefined;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
  if (!m) return undefined;
  const parts = dateIso.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60_000;
  return new Date(utcMillis).toISOString();
}

function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

/**
 * Parses the whole calendar CSV text into a flat list of events. `firstYear` is the calendar
 * year the sheet's FIRST month header (April) belongs to — 2026 for the real file as of this
 * unit (raw/TOC/TOC-Materials/_csv/calendar1.csv starts at APRIL 2026).
 */
export function parseTocCalendar(csvText: string, firstYear: number): TocCalendarEvent[] {
  const rows = parseCsv(csvText);
  const events: TocCalendarEvent[] = [];
  let currentMonth: number | undefined;

  for (const row of rows) {
    const col1 = (row[1] ?? "").trim();
    const monthIndex = MONTH_NAMES.indexOf(col1.toLowerCase() as (typeof MONTH_NAMES)[number]);
    if (monthIndex !== -1) {
      currentMonth = monthIndex;
      continue;
    }
    if (col1.toUpperCase() === "DATE") continue; // the repeated column-header row
    if (currentMonth === undefined) continue; // rows before the first month header
    if (!col1) continue; // blank row

    const date = parseDayField(col1, currentMonth, firstYear);
    if (!date) continue; // not a data row this parser recognizes (e.g. a stray note)

    const agenda = (row[2] ?? "").trim();
    if (!agenda) continue;

    const time = (row[4] ?? "").trim() || undefined;
    const event: TocCalendarEvent = {
      id: `${date}:${slug(agenda)}`,
      date,
      agenda,
      relevance: (row[3] ?? "").trim() || undefined,
      time,
      mode: (row[5] ?? "").trim() || undefined,
      location: (row[6] ?? "").trim() || undefined,
      openTo: (row[7] ?? "").trim() || undefined,
      registrationLink: (row[8] ?? "").trim() || undefined,
      startTime: combineDateTime(date, time),
    };
    events.push(event);
  }
  return events;
}

/** Events whose date falls within `[now, now + windowDays]`, ascending by date. `now` is
 * injected (never `new Date()` directly) so this stays testable against a fixed clock. */
export function upcomingTocEvents(events: TocCalendarEvent[], now: Date, windowDays = 14): TocCalendarEvent[] {
  // Lower bound is the START of "now"'s own UTC day (not `now.getTime()` itself) — otherwise a
  // run any time after 00:00 UTC would exclude today's own events, which is wrong for a daily
  // watch cadence. Yesterday's events are still correctly excluded (their date is before this
  // start-of-day boundary).
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = now.getTime() + windowDays * 24 * 60 * 60 * 1000;
  return events
    .filter((e) => {
      const t = new Date(`${e.date}T00:00:00Z`).getTime();
      return t >= start && t <= end;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
