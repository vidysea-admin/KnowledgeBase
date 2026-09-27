// scripts/watch/lib/session-skeleton.test.mjs — U2. Pure builder, no I/O. Asserts schema-shape
// requirements this file's own doc comment claims: session_pages needs non-empty evidence[],
// sessions needs status.transcribe/status.index, sources needs kind/captureMode/hash/consent.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoSessionSkeleton, slugSessionId,
  parseDayMonthFromTitle, yearForProgramMonth, deriveSessionDateAndTitle,
} from "./session-skeleton.mjs";

const TURNS = [
  { _id: "t1", speakerRef: "spk:0" },
  { _id: "t2", speakerRef: "spk:1" },
  { _id: "t3", speakerRef: "spk:0" }, // repeat — must not produce a duplicate evidence row
];

test("buildAutoSessionSkeleton: produces a schema-shaped set from turns alone (no meta.json)", () => {
  const { source, session, sessionPage, claims } = buildAutoSessionSkeleton({
    sessionId: "2026-09-27-test-session",
    tenantId: "toc",
    title: "Test Session",
    date: "2026-09-27",
    driveFileId: "1abcDEF",
    audioPath: "raw/TOC/TOC-Materials/Audio/test-session.m4a",
    turns: TURNS,
  });

  assert.equal(source.kind, "recording");
  assert.equal(source.captureMode, "provided");
  assert.ok(source.hash);
  assert.equal(source.consent.given, true);

  assert.equal(session.sourceId, source._id);
  assert.equal(session.status.transcribe, "done");
  assert.equal(session.status.index, "pending");
  assert.equal(session.org, "toc");

  assert.equal(sessionPage.sessionId, "2026-09-27-test-session");
  assert.ok(sessionPage.summary.length > 0);
  assert.equal(sessionPage.evidence.length, 2, "one evidence row per DISTINCT speakerRef, not per turn");
  assert.deepEqual(
    sessionPage.evidence.map((e) => e.turnId).sort(),
    ["t1", "t2"],
    "evidence takes the FIRST turn for each distinct speaker",
  );
  assert.deepEqual(claims, []);
});

test("buildAutoSessionSkeleton: summary is honestly labeled as a mechanical placeholder", () => {
  const { sessionPage } = buildAutoSessionSkeleton({
    sessionId: "2026-09-27-test", tenantId: "toc", title: "T", date: "2026-09-27",
    driveFileId: "x", audioPath: "p", turns: TURNS,
  });
  assert.match(sessionPage.summary, /MECHANICAL placeholder/);
});

test("buildAutoSessionSkeleton: throws rather than seeding an empty-evidence session_page when no turns carry a speakerRef", () => {
  assert.throws(() =>
    buildAutoSessionSkeleton({
      sessionId: "s", tenantId: "toc", title: "T", date: "2026-09-27",
      driveFileId: "x", audioPath: "p", turns: [{ _id: "t1", speakerRef: "" }],
    }),
  );
});

test("buildAutoSessionSkeleton: throws on an empty turns array rather than silently seeding nothing", () => {
  assert.throws(() =>
    buildAutoSessionSkeleton({
      sessionId: "s", tenantId: "toc", title: "T", date: "2026-09-27",
      driveFileId: "x", audioPath: "p", turns: [],
    }),
  );
});

test("slugSessionId: real title -> the same <date>-<slug> shape as existing data/toc-migrated dirs", () => {
  assert.equal(slugSessionId("2026-09-21", "UniAccess: Japan"), "2026-09-21-uniaccess-japan");
});

test("slugSessionId: strips punctuation and collapses separators", () => {
  assert.equal(slugSessionId("2026-09-28", "Scholarships 101: Show Me the Money!"), "2026-09-28-scholarships-101-show-me-the-money");
});

// ---- ISS-306: date + title derivation, against REAL names -----------------------------------
// Real September 2026 Drive titles from raw/TOC/TOC-Materials/Recordings/September/
// _drive-manifest.json, plus "24th Sep : InFocus" — this unit's own live-ingest file (ISS-304/
// 305/306's subject) — and the real rows from raw/TOC/TOC-Materials/_csv/calendar1.csv's
// SEPTEMBER block.
const SEPTEMBER_CALENDAR = [
  { date: "2026-09-02", agenda: "India Test Series- Part 2" },
  { date: "2026-09-09", agenda: "Global Test Prep Pathways" },
  { date: "2026-09-16", agenda: "Pathways in Psychology " }, // real row has a trailing space
  { date: "2026-09-21", agenda: "UniAccess : Japan" },
  { date: "2026-09-24", agenda: "In-Focus" },
];

test("parseDayMonthFromTitle: the broken file's own real title", () => {
  assert.deepEqual(parseDayMonthFromTitle("24th Sep : InFocus"), { day: 24, monthIndex: 8 });
});

test("parseDayMonthFromTitle: real drive-manifest titles", () => {
  assert.deepEqual(parseDayMonthFromTitle("16th Sep: Dear Psychology, What Can't You Do? "), { day: 16, monthIndex: 8 });
  assert.deepEqual(parseDayMonthFromTitle("9th Sep: Mastering Global Test Pathways: Navigating GRE, GMAT & UK Admission Tests "), { day: 9, monthIndex: 8 });
  assert.deepEqual(
    parseDayMonthFromTitle("2nd Sep: India Test Series – Part II: Navigating India’s Top Entrance Exams.mp4"),
    { day: 2, monthIndex: 8 },
  );
});

test("parseDayMonthFromTitle: a Drive-generated name with no day/month prefix returns null", () => {
  assert.equal(parseDayMonthFromTitle("video1968958572.mp4"), null);
});

test("yearForProgramMonth: TOC's Apr-Dec/Jan-Mar program-year split", () => {
  assert.equal(yearForProgramMonth(8, 2026), 2026); // September -> same year as the sheet's APRIL header
  assert.equal(yearForProgramMonth(3, 2026), 2026); // April itself -> firstYear
  assert.equal(yearForProgramMonth(1, 2026), 2027); // February -> firstYear + 1
  assert.equal(yearForProgramMonth(2, 2026), 2027); // March -> still firstYear + 1
});

test("deriveSessionDateAndTitle: ISS-304/305/306's own file — the exact bug reproduction", () => {
  // Before this fix: date came from file.createdTime (2026-09-25, one day late) and title from a
  // filesystem-mangled stem ("InFocu") -> sessionId "2026-09-25-infocu". After: the file's OWN
  // title supplies the date, and the TOC calendar's own agenda text ("In-Focus") supplies the
  // title -> "2026-09-24-in-focus", the exact id this unit's live repair expects.
  const { date, title } = deriveSessionDateAndTitle({
    rawName: "24th Sep : InFocus",
    createdTime: "2026-09-25T07:10:00.000Z", // the real, one-day-late Drive createdTime
    calendarEvents: SEPTEMBER_CALENDAR,
    programYearFirstYear: 2026,
  });
  assert.equal(date, "2026-09-24");
  assert.equal(title, "In-Focus");
  assert.equal(slugSessionId(date, title), "2026-09-24-in-focus");
});

test("deriveSessionDateAndTitle: real names land on the SAME slug as the existing hand-authored data/toc-migrated dirs", () => {
  const psych = deriveSessionDateAndTitle({
    rawName: "16th Sep: Dear Psychology, What Can't You Do? ",
    createdTime: "2026-09-17T06:00:00.000Z",
    calendarEvents: SEPTEMBER_CALENDAR,
    programYearFirstYear: 2026,
  });
  assert.equal(slugSessionId(psych.date, psych.title), "2026-09-16-pathways-in-psychology");

  const gtp = deriveSessionDateAndTitle({
    rawName: "9th Sep: Mastering Global Test Pathways: Navigating GRE, GMAT & UK Admission Tests ",
    createdTime: "2026-09-10T06:00:00.000Z",
    calendarEvents: SEPTEMBER_CALENDAR,
    programYearFirstYear: 2026,
  });
  assert.equal(slugSessionId(gtp.date, gtp.title), "2026-09-09-global-test-prep-pathways");
});

test("deriveSessionDateAndTitle: a day/month title with NO calendar match falls back to the file's own (stripped) title", () => {
  const { date, title } = deriveSessionDateAndTitle({
    rawName: "2nd Sep: India Test Series – Part II: Navigating India’s Top Entrance Exams.mp4",
    createdTime: "2026-09-03T06:00:00.000Z",
    calendarEvents: [], // no calendar rows at all
    programYearFirstYear: 2026,
  });
  assert.equal(date, "2026-09-02");
  assert.equal(title, "India Test Series – Part II: Navigating India’s Top Entrance Exams.mp4");
});

test("deriveSessionDateAndTitle: a Drive-generated name with no day/month prefix falls back to createdTime minus one day", () => {
  const { date, title } = deriveSessionDateAndTitle({
    rawName: "video1968958572.mp4",
    createdTime: "2026-09-11T10:00:00.000Z", // minus 1 day -> 2026-09-10, no calendar row that day
    calendarEvents: SEPTEMBER_CALENDAR,
    programYearFirstYear: 2026,
  });
  assert.equal(date, "2026-09-10");
  assert.equal(title, "video1968958572.mp4");
});
