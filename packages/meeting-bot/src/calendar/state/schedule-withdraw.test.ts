/** ISS-WEBINARRELEASE-013/-014: a Calendar cancellation stops a pending, scheduled or launching capture; occurrence and series stay independent. */
import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import type {CalendarEvent} from "../calendar-client.js";
import {runScheduleTickOnce, type ScheduleTickDeps} from "../schedule-tick.js";
import {readScheduledKeys} from "./schedule-state.js";
import {scheduledJobFilePath} from "./schedule-dedup-state.js";
import {runScheduledDispatch, type ScheduledDispatchDeps} from "../scheduled-dispatch.js";
import {withdrawCancelledLaunches} from "./schedule-withdraw.js";
import {deriveJobKey, type TaskScheduler} from "../task-scheduler.js";
import {projectWebinarInventory, webinarIdentity, webinarSessionKey} from "../auto-record-policy.js";
import {emptyStoredJoinRules, saveJoinRules} from "../join-rules/join-rules-store.js";
import {evaluateJoinRules} from "../join-rules/join-rules.js";

const TEN = "ten-t", url = "https://zoom.us/j/123456789";
const at = (h: number, m = 0) => `2026-10-18T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
const startH = (n: number) => 10 + 2 * n; // occurrence n starts at 12:00, 14:00, 16:00 and runs one hour
const occ = (n: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({id: `series_${n}`, title: "Career webinar", startTime: at(startH(n)),
  endTime: at(startH(n) + 1), meetingUrl: url, meetingUrlSource: "conference", organizer: "host@example.com", recurringEventId: "series", ...extra} as CalendarEvent);
const master = () => ({id: "series", title: "Career webinar", startTime: "", endTime: "", cancelled: true}) as CalendarEvent;
const sessionOf = (n: number) => webinarSessionKey(webinarIdentity(url, at(startH(n)))!);

function rig() {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-withdraw-")), cancelled: string[] = [];
  const scheduler: TaskScheduler = {scheduleOnce: async () => {}, cancelOnce: async k => {cancelled.push(k);}};
  saveJoinRules(dir, TEN, emptyStoredJoinRules());
  const tick = (now: string, events: CalendarEvent[]) => runScheduleTickOnce({loadCalendarEvents: async () => events, loadCandidates: async () => [], now: () => now,
    stateDir: dir, stateTenantId: TEN, scheduler, log: () => {}, everyWebinar: true} as ScheduleTickDeps, false);
  const key = (n: number) => deriveJobKey(sessionOf(n))!;
  const jobs = () => [1, 2, 3].filter(n => existsSync(scheduledJobFilePath(dir, key(n))));
  const calls: string[][] = [];
  const dispatchDeps = (now: string): ScheduledDispatchDeps => ({stateDir: dir, tenantId: TEN, mode: "last-valid", loadKeyTenant: async () => TEN, now: () => now, log: () => {},
    record: async a => {calls.push(a);}});
  const scheduleAll = async () => { for (const n of [1, 2, 3]) await tick(at(startH(n) - 1, 57), [occ(1), occ(2), occ(3)]); }; // each tick falls in one occurrence's lead window
  return {dir, cancelled, tick, key, jobs, calls, dispatchDeps, scheduleAll, done: () => rmSync(dir, {recursive: true, force: true})};
}

test("cancel before launch: the scheduled job, task and dedup entry are withdrawn and dispatch refuses", async () => {
  const r = rig();
  try {
    await r.scheduleAll(); assert.deepEqual(r.jobs(), [1, 2, 3]);
    await r.tick(at(9), [occ(1, {cancelled: true}), occ(2), occ(3)]);
    assert.deepEqual(r.jobs(), [2, 3]); assert.deepEqual(r.cancelled, [r.key(1)]);
    assert.deepEqual([...readScheduledKeys(r.dir, TEN)].sort(), [sessionOf(2), sessionOf(3)].sort());
    await assert.rejects(runScheduledDispatch([r.key(1)], r.dispatchDeps(at(12))), /Scheduled dispatch refused/); assert.equal(r.calls.length, 0);
    // An id-only tombstone (no link, no start) withdraws the same way, by event id.
    await r.tick(at(9), [{id: "series_2", title: "", startTime: "", endTime: "", cancelled: true} as CalendarEvent, occ(3)]);
    assert.deepEqual(r.jobs(), [3]);
  } finally { r.done(); }
});

test("an outsider's tombstone copying the link and start (or start and title, or only a foreign id) never withdraws a scheduled job", async () => {
  const r = rig();
  try {
    await r.scheduleAll();
    const mine = occ(2);
    for (const forged of [
      {id: "outsider-1", title: "x", startTime: mine.startTime, endTime: mine.endTime, meetingUrl: url, cancelled: true},          // link + start
      {id: "outsider-2", title: mine.title, startTime: mine.startTime, endTime: mine.endTime, cancelled: true},                    // start + title
      {id: "outsider-3", title: "", startTime: "", endTime: "", cancelled: true},                                                    // id only
      {id: "outsider-4", title: mine.title, startTime: mine.startTime, endTime: mine.endTime, meetingUrl: url, organizer: "evil@example.com", cancelled: true, recurringEventId: "other"},
    ] as CalendarEvent[]) {
      await r.tick(at(9), [forged, occ(1), occ(2), occ(3)]);
      assert.deepEqual(r.jobs(), [1, 2, 3], `survives ${forged.id}`); assert.equal(r.cancelled.length, 0);
    }
    await r.tick(at(9), [occ(2, {cancelled: true}), occ(1), occ(3)]); // the job's own event, genuinely cancelled
    assert.deepEqual(r.jobs(), [1, 3]);
  } finally { r.done(); }
});

test("cancel during launch: withdrawal between the checks and capture start refuses cleanly, siblings untouched", async () => {
  const r = rig();
  try {
    await r.scheduleAll();
    await runScheduledDispatch([r.key(1)], r.dispatchDeps(at(12))); assert.equal(r.calls.length, 1, "control: an uncancelled occurrence launches");
    const d = r.dispatchDeps(at(14));
    d.io = {evaluate: (event, rules, state) => { // the cancellation lands after the job was read, while current rules are evaluated
      void withdrawCancelledLaunches({stateDir: r.dir, tenantId: TEN, scheduler: {}, log: () => {}, cancelledEventIds: ["series_2"], cancelledSeriesIds: []});
      return evaluateJoinRules(event, rules, state);
    }};
    await assert.rejects(runScheduledDispatch([r.key(2)], d), /Scheduled dispatch refused/);
    assert.equal(r.calls.length, 1, "no second capture was started"); assert.deepEqual(r.jobs(), [1, 3]);
  } finally { r.done(); }
});

test("one occurrence cancelled: it never launches and the other occurrences still do", async () => {
  const r = rig();
  try {
    for (const n of [1, 2, 3]) await r.tick(at(startH(n) - 1, 57), [occ(1, {cancelled: true}), occ(2), occ(3)]);
    assert.deepEqual(r.jobs(), [2, 3]); assert.equal(r.cancelled.length, 0, "nothing else was withdrawn");
    await runScheduledDispatch([r.key(3)], r.dispatchDeps(at(16))); assert.equal(r.calls.length, 1);
  } finally { r.done(); }
});

test("a cancelled instance (carries recurringEventId) never withdraws its siblings", async () => {
  const r = rig();
  try { await r.scheduleAll(); await r.tick(at(9), [occ(2, {cancelled: true}), occ(1), occ(3)]); assert.deepEqual(r.jobs(), [1, 3]); } finally { r.done(); }
});

test("series cancelled: every scheduled and still-listed occurrence is withdrawn and not rescheduled", async () => {
  const r = rig();
  try {
    await r.scheduleAll();
    await r.tick(at(9), [master(), occ(1), occ(2), occ(3)]); // master tombstone while the feed still lists live instances
    assert.deepEqual(r.jobs(), []); assert.deepEqual(r.cancelled.sort(), [1, 2, 3].map(r.key).sort());
    await r.tick(at(11, 57), [master(), occ(1), occ(2), occ(3)]);
    assert.deepEqual(r.jobs(), [], "still cancelled, so the occurrence in its lead window is not scheduled again");
  } finally { r.done(); }
});

test("ISS-WEBINARRELEASE-014: a later parent cancellation replaces the live-series review; an unchanged series is left alone", () => {
  const result = {transitions: [], inventory: []} as never, live = {id: "series", title: "Career webinar", startTime: "", endTime: "", recurrence: ["RRULE:FREQ=WEEKLY"]};
  const id = webinarSessionKey(`source-series|${TEN}|series`);
  const first = projectWebinarInventory({}, result, TEN, "2026-10-01T00:00:00.000Z", [live as never]);
  assert.equal(first[id]!.reason, "recurring-series");
  const again = projectWebinarInventory(first, result, TEN, "2026-10-02T00:00:00.000Z", [live as never]);
  assert.equal(again[id]!.updatedAt, "2026-10-01T00:00:00.000Z", "no churn while nothing changed");
  const cancelled = projectWebinarInventory(again, result, TEN, "2026-10-03T00:00:00.000Z", [{...live, cancelled: true} as never]);
  assert.equal(cancelled[id]!.reason, "cancelled"); assert.equal(cancelled[id]!.status, "action_required");
});
