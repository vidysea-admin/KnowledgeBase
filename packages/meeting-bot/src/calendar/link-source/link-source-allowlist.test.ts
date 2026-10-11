/**
 * T-036 fix cycle 2 (ISS-T036CAL-008 / -009): the calendar client's allow-list for `meetingUrlSource`. A value the allow-list cannot read must be
 * KEPT and judged untrusted, or rejected closed. It must never be dropped: a dropped value reads as "missing = conference", i.e. trusted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileWebinarSources } from "../calendar-client.js";
import { selectAutoRecordItems, selectEventsToAutoJoin } from "../auto-join.js";

const URL1 = "https://zoom.us/j/123456789?pwd=abc";
const base = { tenantId: "lane", checkedAt: "2026-10-11T10:00:00.000Z", acquisition: { complete: true, historyComplete: true }, candidates: [] };
const cal = (src: unknown): never => ({ id: "c1", title: "Webinar", startTime: "2026-10-11T12:00:00.000Z", endTime: "2026-10-11T13:00:00.000Z", organizer: "o@x.org",
  meetingUrl: URL1, meetingUrlSource: src }) as never;
const pick = (events: unknown[], everyWebinar: boolean) => selectAutoRecordItems({ calendarEvents: events as never, candidates: [], now: "2026-10-11T11:58:00.000Z", leadMinutes: 5,
  trustedSenders: { emails: ["o@x.org"], domains: [] }, alreadyScheduled: [], everyWebinar });

test("ISS-T036CAL-008: valid values pass through the allow-list unchanged", () => {
  for (const v of ["conference", "location", "description"]) assert.equal(reconcileWebinarSources({ ...base, calendarEvents: [cal(v)] }).calendarEvents[0]!.meetingUrlSource, v);
  const none = reconcileWebinarSources({ ...base, calendarEvents: [cal(undefined)] }).calendarEvents[0]!;
  assert.equal("meetingUrlSource" in none, false, "an absent value stays absent (legacy rows)");
});

test("ISS-T036CAL-008: an invalid STRING is kept as-is, never dropped, and the event ends NOT scheduled (direct and after a persisted round trip)", () => {
  const variants = ["Description", "desc", "", "location ", " conference", "conference ", "Conference", "CONFERENCE", "calendar", "x".repeat(32), "conférence", "con​ference"];
  let held = 0;
  for (const v of variants) {
    const out = reconcileWebinarSources({ ...base, calendarEvents: [cal(v)] });
    assert.equal(out.calendarEvents.length, 1, JSON.stringify(v));
    assert.equal(out.calendarEvents[0]!.meetingUrlSource, v, `kept verbatim, not dropped: ${JSON.stringify(v)}`);
    const again = reconcileWebinarSources({ ...base, checkedAt: "2026-10-11T10:05:00.000Z", previous: JSON.parse(JSON.stringify(out.state)), calendarEvents: [] });
    for (const list of [out.calendarEvents, again.calendarEvents]) for (const everyWebinar of [true, false]) {
      const r = pick(list, everyWebinar);
      assert.equal(r.toSchedule.length, 0, `${JSON.stringify(v)} everyWebinar=${everyWebinar}`);
      assert.deepEqual(r.skipped.map((s) => s.reason), ["unverified-link-source"], JSON.stringify(v));
      held++;
    }
  }
  console.log(`ISS-T036CAL-008: ${held}/${variants.length * 4} (${variants.length} invalid strings x direct+persisted x 2 modes) kept and not scheduled`);
  assert.equal(held, variants.length * 4);
  assert.equal(pick([cal("conference")], true).toSchedule.length, 1, "control: the real value is scheduled");
});

test("ISS-T036CAL-008: non-strings, control characters and over-long values are rejected closed (the whole reconciliation throws)", () => {
  const bad: unknown[] = [1, 0, null, true, false, {}, [], ["description"], { a: 1 }, "x".repeat(33), "x".repeat(5000), "a\nb", "a\tb", "a\u0000b", "a\u007fb", "\u001b[0m"];
  let rejected = 0;
  for (const v of bad) { assert.throws(() => reconcileWebinarSources({ ...base, calendarEvents: [cal(v)] }), Error, JSON.stringify(v)); rejected++; }
  assert.equal(rejected, bad.length);
  assert.throws(() => reconcileWebinarSources({ ...base, calendarEvents: [{ ...(cal("description") as object), unknownKey: 1 } as never] }), Error, "unknown keys still refused");
});

test("ISS-T036CAL-009: selectEventsToAutoJoin never selects an event whose link source is not conference data", () => {
  const e = (src?: unknown) => ({ id: "e", title: "t", startTime: "2026-10-11T12:00:00.000Z", endTime: "2026-10-11T13:00:00.000Z", meetingUrl: URL1, ...(src === undefined ? {} : { meetingUrlSource: src }) }) as never;
  const sel = (src?: unknown) => selectEventsToAutoJoin([e(src)], "2026-10-11T12:01:00.000Z", 5).length;
  assert.equal(sel(), 1); assert.equal(sel("conference"), 1);
  for (const s of ["description", "location", "Conference", "", "x", null, 0]) assert.equal(sel(s), 0, JSON.stringify(s));
});
