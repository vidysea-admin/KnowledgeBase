/**
 * packages/ingest/src/sources/toc-calendar.test.ts — U2. Parses the REAL row shapes seen in
 * raw/TOC/TOC-Materials/_csv/calendar1.csv (multi-line quoted agenda text, day-range dates,
 * already-complete datetimes, the April-2026..March-2027 program year), and the 14-day upcoming
 * window the live dry-run check depends on (Ashoka 27 Sep is out of this CSV — it's Gmail-only —
 * but TOC's own 28 Sep "Scholarships 101" and 30 Sep "Advocacy..." rows are exactly this file).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCsv, parseTocCalendar, upcomingTocEvents, yearForMonth } from "./toc-calendar.js";

const REAL_SLICE = `,SEPTEMBER,,,,,,,,,,,,,,,,,,,,,,,
,DATE,AGENDA,PRIMARY RELEVANCE,TIME,MODE,LOCATION,OPEN TO,REGISTRATION LINK,,,,,,,,,,,,,,,,
,2.0,India Test Series- Part 2,Counsellors,18:00:00,Virtual,Zoom,Members,TBA,,,,,,,,,,,,,,,,
,9.0,Global Test Prep Pathways,Counsellors,18:00:00,Virtual,Zoom,Members,TBA,,,,,,,,,,,,,,,,
,16.0,Pathways in Psychology ,Counsellors,18:00:00,Virtual,Zoom,Members,TBA,,,,,,,,,,,,,,,,
,21.0,UniAccess : Japan,,18:00:00,Virtual,Zoom,Members,TBA,,,,,,,,,,,,,,,,
,24.0,In-Focus,"Service Providers, Counsellors, School & University Leadership",18:00:00,Virtual,Zoom,Members,TBA,,,,,,,,,,,,,,,,
,28.0,Scholarships 101: Show Me the Money,,18:00:00,,,,,,,,,,,,,,,,,,,,
,30.0,Advocacy strategies for Neurodivergent / learning disabilities for university admissions,Counsellors,18:00:00,Virtual,Zoom,Members,TBA,,,,,,,,,,,,,,,,
,OCTOBER,,,,,,,,,,,,,,,,,,,,,,,
,DATE,AGENDA,PRIMARY RELEVANCE,TIME,MODE,LOCATION,OPEN TO,REGISTRATION LINK,,,,,,,,,,,,,,,,
,6.0,Talent Management in Education (non-academic roles) in the age of AI,All,18:00:00,Virtual,Zoom,Members,TBA,,,,,,,,,,,,,,,,
,2026-10-07 00:00:00,Destination Gujarat: University Visits,Counsellors,-,In-Person,"Ahmedabad, Gandhinagar",Members & Non-Members,TBA,,,,,,,,,,,,,,,,
`;

const MULTILINE_AGENDA = `,MAY,,,,,,,,,,,,,,,,,,,,,,,
,DATE,AGENDA,PRIMARY RELEVANCE,TIME,MODE,LOCATION,OPEN TO,REGISTRATION LINK,,,,,,,,,,,,,,,,
,13.0,"How To Help A Student Craft An Outstanding
College Application: A Crash Course

The College Essay Guys",Counsellors,18:00:00,Virtual,Zoom,Members,https://example.com/reg,,,,,,,,,,,,,,,,
,22.0,"UniAccess Live: Meet Xavier University, Cincinnati, USA",Counsellors,17:00:00,Virtual,Zoom,Members,https://example.com/xavier,,,,,,,,,,,,,,,,
`;

test("parseCsv tokenizes a quoted field with an embedded comma without splitting it", () => {
  const rows = parseCsv(`a,"b, c",d\n`);
  assert.deepEqual(rows, [["a", "b, c", "d"]]);
});

test("parseCsv keeps an embedded newline inside a quoted field as ONE row, not two", () => {
  const rows = parseCsv(`a,"line1\nline2",c\n`);
  assert.deepEqual(rows, [["a", "line1\nline2", "c"]]);
});

test("parseCsv unescapes a doubled quote inside a quoted field", () => {
  const rows = parseCsv(`a,"say ""hi""",c\n`);
  assert.deepEqual(rows, [["a", 'say "hi"', "c"]]);
});

test("yearForMonth: April..December belongs to the first year, January..March to the next", () => {
  assert.equal(yearForMonth(3, 2026), 2026); // April
  assert.equal(yearForMonth(8, 2026), 2026); // September
  assert.equal(yearForMonth(11, 2026), 2026); // December
  assert.equal(yearForMonth(0, 2026), 2027); // January
  assert.equal(yearForMonth(2, 2026), 2027); // March
});

test("parseTocCalendar: real September/October slice — day floats, blank cells, and an already-complete datetime row", () => {
  const events = parseTocCalendar(REAL_SLICE, 2026);
  const bySlug = new Map(events.map((e) => [e.agenda, e]));

  const scholarships = bySlug.get("Scholarships 101: Show Me the Money");
  assert.ok(scholarships, "28 Sep Scholarships 101 row must parse despite blank mode/location/openTo cells");
  assert.equal(scholarships!.date, "2026-09-28");
  assert.equal(scholarships!.time, "18:00:00");

  const advocacy = bySlug.get("Advocacy strategies for Neurodivergent / learning disabilities for university admissions");
  assert.equal(advocacy?.date, "2026-09-30");

  const japan = bySlug.get("UniAccess : Japan");
  assert.equal(japan?.date, "2026-09-21");

  // Already-complete datetime row under the OCTOBER header — uses ITS OWN date, not "currentMonth".
  const gujarat = bySlug.get("Destination Gujarat: University Visits");
  assert.equal(gujarat?.date, "2026-10-07");
  assert.equal(gujarat?.location, "Ahmedabad, Gandhinagar");
});

test("parseTocCalendar: a multi-line quoted AGENDA field is one event, not several", () => {
  const events = parseTocCalendar(MULTILINE_AGENDA, 2026);
  assert.equal(events.length, 2);
  assert.match(events[0]!.agenda, /How To Help A Student Craft An Outstanding\nCollege Application/);
  assert.equal(events[0]!.date, "2026-05-13");
  assert.equal(events[1]!.agenda, "UniAccess Live: Meet Xavier University, Cincinnati, USA");
});

test("parseTocCalendar: startTime combines date+time as IST (UTC-converted)", () => {
  const events = parseTocCalendar(REAL_SLICE, 2026);
  const scholarships = events.find((e) => e.date === "2026-09-28")!;
  // 18:00 IST == 12:30 UTC
  assert.equal(scholarships.startTime, "2026-09-28T12:30:00.000Z");
});

test("upcomingTocEvents: 14-day window from a fixed 'now' includes 28/30 Sep and 6/7 Oct, excludes 21/24 Sep (past)", () => {
  const events = parseTocCalendar(REAL_SLICE, 2026);
  const now = new Date("2026-09-25T00:00:00Z");
  const upcoming = upcomingTocEvents(events, now, 14); // window end: 2026-10-09
  const dates = upcoming.map((e) => e.date);
  assert.ok(dates.includes("2026-09-28"), `expected 2026-09-28 in ${JSON.stringify(dates)}`);
  assert.ok(dates.includes("2026-09-30"), `expected 2026-09-30 in ${JSON.stringify(dates)}`);
  assert.ok(dates.includes("2026-10-06"), `6 Oct is within the 14-day window — expected in ${JSON.stringify(dates)}`);
  assert.ok(!dates.includes("2026-09-21"), "21 Sep is in the past relative to 25 Sep — must be excluded");
  assert.ok(!dates.includes("2026-09-24"), "24 Sep is in the past relative to 25 Sep — must be excluded");
  assert.deepEqual(dates, [...dates].sort(), "results must be sorted ascending by date");
});

test("upcomingTocEvents: a shorter window (5 days) excludes events past its own end", () => {
  const events = parseTocCalendar(REAL_SLICE, 2026);
  const now = new Date("2026-09-25T00:00:00Z");
  const upcoming = upcomingTocEvents(events, now, 5); // window end: 2026-09-30
  const dates = upcoming.map((e) => e.date);
  assert.ok(dates.includes("2026-09-28"));
  assert.ok(dates.includes("2026-09-30"), "30 Sep sits exactly on the 5-day boundary — inclusive");
  assert.ok(!dates.includes("2026-10-06"), "6 Oct is 11 days out — must be excluded by a 5-day window");
});
