import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAutoRecordItems } from "./auto-join.js";
import { classifyWebinarInvite, webinarIdentity, webinarSessionKey } from "./auto-record-policy.js";
import { createHttpCalendarLoader, createHttpCandidateLoader } from "./schedule-tick.js";
import { reconcileWebinarSources, type WebinarReconciliationState } from "./calendar-client.js";

const times = { startTime: "2026-09-30T10:00:00Z", endTime: "2026-09-30T11:00:00Z" };

test("watch retries only typed discovery failure after 60s and preserves fatal/preview gates", async () => {
  const {runPipelineWatch} = await import(new URL('../../../../scripts/webinar/run-pipeline.mjs', import.meta.url).href);
  let ticks = 0; const waits: number[] = [], logs: string[] = [];
  const stopped = new Error("fixture cancellation");
  await assert.rejects(runPipelineWatch({run: true, watch: true}, {
    tick: async () => {if (++ticks === 1) throw Object.assign(new Error("private provider details"), {code: "WEBINAR_DISCOVERY_UNAVAILABLE"}); return {status: "running"};},
    wait: async (ms: number) => {waits.push(ms); if (waits.length === 2) throw stopped;}, log: (text: string) => logs.push(text),
  }), error => error === stopped);
  assert.equal(ticks, 2); assert.deepEqual(waits, [60000, 60000]); assert.ok(!logs.join(" ").includes("private"));
  for (const failure of [new Error("Webinar discovery unavailable"), new Error("owner mismatch"), new Error("lock invalid"), new Error("proof missing")]) {
    let waited = false;
    await assert.rejects(runPipelineWatch({run: true, watch: true}, {tick: async () => {throw failure;}, wait: async () => {waited = true;}}), error => error === failure);
    assert.equal(waited, false);
  }
  let previewTicks = 0;
  await runPipelineWatch({}, {tick: async () => {previewTicks++; return {};}, wait: async () => {assert.fail("preview cannot wait");}, log: () => {}});
  assert.equal(previewTicks, 1);
  await assert.rejects(runPipelineWatch({watch: true}, {tick: async () => {assert.fail("unapproved watch cannot tick");}}), /requires --run/);
});
const candidate = { id: "invite", title: "Student visa webinar", senderEmail: "new@university.edu",
  senderDomain: "university.edu", status: "pending" as const, meetingUrl: "https://zoom.us/w/123?tk=first", ...times };
const selection = (candidates = [candidate], calendarEvents: any[] = []) => selectAutoRecordItems({
  calendarEvents, candidates, now: "2026-09-30T09:59:00Z", leadMinutes: 5,
  trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [], everyWebinar: true,
});

test("automatic webinars do not require a trusted sender; ordinary meetings stay excluded", () => {
  assert.equal(selection().toSchedule.length, 1);
  assert.equal(selection([{ ...candidate, title: "Team meeting" }]).skipped[0]?.reason, "not-webinar");
  assert.equal(selection([{ ...candidate, title: "Monthly update" }]).skipped[0]?.reason, "needs-review");
  assert.equal(classifyWebinarInvite("personal webinar catch-up"), "meeting");
});
test("explicit rejection and registration never get overridden", () => {
  assert.equal(selection([{ ...candidate, status: "rejected" as any }]).toSchedule.length, 0);
  assert.equal(selection([{ ...candidate, registrationOnly: true } as any]).skipped[0]?.reason, "needs-registration");
});
test("rejected Gmail occurrence also blocks its Calendar alias", () => {
  const calendar = [{id:'event',title:candidate.title,meetingUrl:'https://zoom.us/w/123?tk=other',...times}];
  assert.equal(selection([{...candidate,status:'rejected' as any}],calendar).toSchedule.length,0);
  assert.equal(selection([{...candidate,registrationOnly:true} as any],calendar).toSchedule.length,0);
});
test("canonical occurrence key prevents duplicate across polls and rotating tokens", () => {
  const key = selection().toSchedule[0]!.sessionKey;
  const next = selectAutoRecordItems({calendarEvents:[{id:'event',title:candidate.title,meetingUrl:'https://zoom.us/w/123?tk=other',...times}],candidates:[],now:'2026-09-30T09:59:00Z',leadMinutes:5,trustedSenders:{emails:[],domains:[]},alreadyScheduled:[key],everyWebinar:true});
  assert.equal(next.toSchedule.length,0);
  assert.equal(next.skipped[0]?.reason,'duplicate-session');
});
test("Gmail and Calendar aliases dedup rotating tokens; recurring dates remain distinct", () => {
  const result = selection([candidate], [{ id: "event", title: candidate.title,
    meetingUrl: "https://zoom.us/w/123?tk=second", ...times }]);
  assert.equal(result.toSchedule.length, 1);
  assert.equal(result.skipped[0]?.reason, "duplicate-session");
  assert.notEqual(webinarIdentity(candidate.meetingUrl, times.startTime), webinarIdentity(candidate.meetingUrl, "2026-10-01T10:00:00Z"));
});
test("invalid intervals and non-HTTPS joins are refused", () => {
  assert.equal(selection([{ ...candidate, endTime: times.startTime }]).skipped[0]?.reason, "invalid-time");
  assert.equal(selection([{ ...candidate, meetingUrl: "file:///private" }]).skipped[0]?.reason, "unsafe-join-link");
});
test("calendar uses real authenticated route and reports failures instead of healthy zero", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "http://local/calendar/upcoming?discovery=1");
      assert.equal((init?.headers as any).authorization, "Bearer test");
      assert.equal(init?.redirect, "error");
      return new Response(JSON.stringify({ meetings: [{ id: "event", title: "Webinar", ...times, cancelled: true }] }));
    };
    const rows = await createHttpCalendarLoader("http://local", "test")();
    assert.equal(rows.length, 1); assert.equal(rows[0]!.cancelled, true);
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(createHttpCalendarLoader("http://local", "test")(), /503/);
    await assert.rejects(createHttpCalendarLoader("http://local", undefined)(), /API_KEY/);
  } finally { globalThis.fetch = original; }
});
test("new webinar mode loads pending Gmail rows, legacy mode still filters", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [
      { ...candidate, _id: candidate.id, subject: candidate.title },
    ] }));
    assert.equal((await createHttpCandidateLoader("http://local", "test", () => {}, true)()).length, 1);
    assert.equal((await createHttpCandidateLoader("http://local", "test", () => {})()).length, 0);
  } finally { globalThis.fetch = original; }
});

const future = {startTime: "2026-10-02T10:00:00.000Z", endTime: "2026-10-02T11:00:00.000Z"};
const checkedAt = "2026-10-01T09:00:00.000Z", revision = "2026-10-01T08:00:00.000Z";
const calendarRow = (extra: any = {}) => ({id: "cal-a", title: "Visa webinar", meetingUrl: "https://zoom.us/w/111?tk=cal", ...future, providerUpdated: revision, ...extra});
const mailRow = (extra: any = {}) => ({...candidate, id: "mail-a", title: "Visa webinar", meetingUrl: "https://zoom.us/w/111?tk=mail", ...future, providerUpdated: revision, ...extra});
const reconcile = (previous?: unknown, calendarEvents: any[] = [calendarRow()], candidates: any[] = [mailRow()], extra: any = {}) =>
  reconcileWebinarSources({tenantId: "vidysea", checkedAt, acquisition: {complete: true, historyComplete: true}, previous, calendarEvents, candidates, ...extra});
const choose = (result: ReturnType<typeof reconcile>, now = "2026-10-02T09:59:00.000Z") => selectAutoRecordItems({
  calendarEvents: result.calendarEvents, candidates: result.candidates, now, leadMinutes: 5, everyWebinar: true,
  alreadyScheduled: [], trustedSenders: {emails: [], domains: []},
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test("available-source coverage keeps independent captures eligible and filters uncertain dependants", () => {
  const acquisition = {complete: true, historyComplete: false, scope: "available-connected-source-state" as const};
  const fresh = reconcile(undefined, [calendarRow(), {id: "unknown-deletion", cancelled: true}], [mailRow(), mailRow({id: "orphan-mail", meetingUrl: "https://zoom.us/w/999"})], {acquisition});
  assert.equal(fresh.state.historyComplete, false); assert.equal(fresh.newStartsBlocked, false);
  assert.equal(choose(fresh).toSchedule.length, 1);
  assert.ok(fresh.inventory.some(row => row.snapshot.id === "orphan-mail" && row.reason === "unproven-calendar-history"));
  assert.equal(fresh.candidates.some(row => row.id === "orphan-mail"), false);
  const reset = reconcile(clone(fresh.state), [], [], {acquisition: {...acquisition, discontinuousCalendarIds: ["cal-a"]}});
  assert.equal(choose(reset).toSchedule.length, 0);
  assert.ok(reset.inventory.some(row => row.snapshot.id === "mail-a" && row.reason === "source-discontinuity"));
  const still = reconcile(clone(reset.state), [], [], {acquisition});
  assert.equal(choose(still).toSchedule.length, 0);
  const conflicting = reconcile(clone(still.state), [calendarRow({title: "Conflicting webinar"})], [], {acquisition});
  assert.equal(choose(conflicting).toSchedule.length, 0);
  const restored = reconcile(clone(still.state), [calendarRow()], [], {acquisition});
  assert.equal(choose(restored).toSchedule.length, 1, "identical current provider proof restores the exact occurrence");
  const legacy = reconcile(clone(restored.state), [], [], {acquisition: {complete: true, historyComplete: false}});
  assert.equal(legacy.newStartsBlocked, true); assert.equal(legacy.state.coverageScope, undefined);
  for (const ids of [["absent"], ["cal-a", "cal-a"], new Array(1), ["bad\nID"]]) assert.throws(() =>
    reconcile(fresh.state, [], [], {acquisition: {...acquisition, discontinuousCalendarIds: ids}}), /Invalid/);
});
const rows = (state: WebinarReconciliationState) => Object.values(state.occurrences);
function freeze(value: any): any {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test("pure reconciliation retains future inventory before lead, canonical full-time keys and restart", () => {
  const input = freeze({calendarEvents: [calendarRow()], candidates: [mailRow()]});
  const first = reconcile(undefined, input.calendarEvents, input.candidates);
  assert.equal(first.newStartsBlocked, false); assert.equal(first.inventory.length, 2);
  assert.equal(choose(first, checkedAt).toSchedule.length, 0); assert.equal(choose(first).toSchedule.length, 1);
  assert.equal(first.inventory[0]!.sessionKey, first.inventory[1]!.sessionKey);
  const next = reconcile(freeze(clone(first.state)), input.calendarEvents, input.candidates);
  assert.deepEqual(next.state, clone(first.state)); assert.deepEqual(next.transitions, []);
  const distinct = reconcile(undefined, [calendarRow(), calendarRow({id: "cal-b", startTime: "2026-10-02T12:00:00.000Z", endTime: "2026-10-02T13:00:00.000Z"})], []);
  assert.equal(distinct.newStartsBlocked, false); assert.notEqual(distinct.inventory[0]!.sessionKey, distinct.inventory[1]!.sessionKey);
  const absent = reconcile(first.state, [], []); assert.deepEqual(absent.state.occurrences, first.state.occurrences);
});
test("known actual-wire and id-only cancellations preserve metadata and block stale Gmail selector", () => {
  const first = reconcile();
  for (const tombstone of [{id: "cal-a", cancelled: true}, {id: "cal-a", cancelled: true, title: "(untitled)", startTime: "", endTime: ""}]) {
    const result = reconcile(freeze(clone(first.state)), [tombstone]);
    assert.equal(result.newStartsBlocked, false); assert.equal(choose(result).toSchedule.length, 0);
    const calendar = rows(result.state).find(row => row.source === "calendar")!;
    assert.equal(calendar.snapshot.cancelled, true); assert.equal(calendar.snapshot.title, "Visa webinar");
    assert.equal(calendar.snapshot.startTime, future.startTime); assert.equal(result.candidates[0]!.cancelled, true);
    const replay = reconcile(clone(result.state), [tombstone]); assert.deepEqual(replay.state, clone(result.state));
  }
  const stale = reconcile(first.state, [{id: "cal-a", cancelled: true, providerUpdated: "2026-10-01T07:00:00.000Z"}]);
  assert.equal(choose(stale).toSchedule.length, 1); assert.equal(stale.calendarEvents[0]!.cancelled, false);
  const unknown = reconcile(first.state, [{id: "unknown", cancelled: true}]);
  assert.equal(unknown.newStartsBlocked, true); assert.deepEqual(unknown.calendarEvents, []); assert.deepEqual(unknown.candidates, []);
  assert.ok(unknown.inventory.some(row => row.reason === "unknown-tombstone"));
  assert.equal(reconcile(unknown.state, [], []).newStartsBlocked, true);
});
test("accepted reschedule rewrites only proven Gmail lineage and retains sticky barriers", () => {
  const moved = calendarRow({startTime: "2026-10-02T12:00:00.000Z", endTime: "2026-10-02T13:00:00.000Z", meetingUrl: "https://zoom.us/w/333?tk=new", providerUpdated: "2026-10-01T08:30:00.000Z"});
  for (const barrier of [{}, {status: "rejected"}, {registrationOnly: true}]) {
    const first = reconcile(undefined, [calendarRow()], [mailRow(barrier)]);
    const result = reconcile(clone(first.state), [moved], [mailRow()]);
    assert.equal(result.newStartsBlocked, false); assert.equal(result.candidates[0]!.startTime, moved.startTime);
    assert.equal(result.candidates[0]!.meetingUrl, moved.meetingUrl);
    assert.equal(choose(result, "2026-10-02T11:59:00.000Z").toSchedule.length, Object.keys(barrier).length ? 0 : 1);
    assert.equal(rows(result.state).find(row => row.source === "calendar")!.aliases.length, 2);
    assert.deepEqual(reconcile(clone(result.state), [moved], [mailRow()]).transitions, []);
  }
});
test("disputed Calendar aliases and provider IDs never manufacture later Gmail linkage", () => {
  const first = reconcile(undefined, [calendarRow()], []);
  const bad = calendarRow({meetingUrl: "https://zoom.us/w/222"});
  const disputed = reconcile(first.state, [bad], []); assert.equal(disputed.newStartsBlocked, true);
  const result = reconcile(disputed.state, [calendarRow({meetingUrl: "https://zoom.us/w/333", providerUpdated: "2026-10-01T08:30:00.000Z"})], [mailRow({meetingUrl: bad.meetingUrl})]);
  assert.equal(result.newStartsBlocked, false);
  const mail = rows(result.state).find(row => row.source === "gmail")!;
  assert.equal(mail.linkedCalendar, undefined); assert.equal(result.candidates[0]!.meetingUrl, bad.meetingUrl);
  assert.equal(rows(result.state).find(row => row.source === "calendar")!.aliases.length, 2);
  for (const batch of [[calendarRow(), bad], [bad, calendarRow()]]) {
    const cold = reconcile(undefined, batch, []); assert.equal(cold.newStartsBlocked, true);
    assert.deepEqual(rows(cold.state)[0]!.aliases, []); assert.deepEqual(rows(cold.state)[0]!.providerIds, []);
    const accepted = reconcile(cold.state, [calendarRow({meetingUrl: "https://zoom.us/w/333", providerUpdated: "2026-10-01T08:30:00.000Z"})], [mailRow()]);
    assert.equal(accepted.newStartsBlocked, false); assert.equal(rows(accepted.state).find(row => row.source === "gmail")!.linkedCalendar, undefined);
    assert.equal(accepted.candidates[0]!.meetingUrl, mailRow().meetingUrl);
  }
  const recurring = calendarRow({recurringEventId: "series", originalStartTime: {dateTime: future.startTime}});
  const prior = reconcile(undefined, [recurring], []);
  const conflict = reconcile(prior.state, [{...recurring, id: "unaccepted-id", meetingUrl: bad.meetingUrl}], []);
  assert.equal(conflict.newStartsBlocked, true);
  assert.ok(!rows(conflict.state)[0]!.providerIds.includes("unaccepted-id"));
});
test("recurring siblings, immutable original date and parent cancellations remain independent", () => {
  const a = calendarRow({recurringEventId: "series", originalStartTime: {dateTime: future.startTime}});
  const b = calendarRow({id: "cal-b", recurringEventId: "series", originalStartTime: {date: "2026-10-03"}, startTime: "2026-10-03T10:00:00.000Z", endTime: "2026-10-03T11:00:00.000Z"});
  const first = reconcile(undefined, [a, b], []);
  const one = reconcile(first.state, [{id: "cal-a", recurringEventId: "series", originalStartTime: a.originalStartTime, cancelled: true}], []);
  assert.equal(one.calendarEvents.filter(row => row.cancelled).length, 1); assert.equal(one.calendarEvents.find(row => row.id === "cal-b")!.cancelled, false);
  const parent = reconcile(first.state, [{id: "series", cancelled: true}], []);
  assert.equal(parent.calendarEvents.filter(row => row.cancelled).length, 2);
  assert.deepEqual(reconcile(clone(parent.state), [{id: "series", cancelled: true}], []).state, clone(parent.state));
  const withMaster = reconcile(undefined, [calendarRow({id: "series", meetingUrl: "https://zoom.us/w/999"}), a], []);
  const all = reconcile(withMaster.state, [{id: "series", cancelled: true}], []);
  assert.equal(all.calendarEvents.filter(row => row.cancelled).length, 2);
  assert.equal(rows(first.state).find(row => row.snapshot.id === "cal-b")!.snapshot.originalStartTime!.date, "2026-10-03");
});
test("revision merges are permutation invariant and token rotations are equivalent", () => {
  const before = reconcile(undefined, [calendarRow()], []), newer = calendarRow({title: "New Visa webinar", providerUpdated: "2026-10-01T08:30:00.000Z"});
  const permutations = [[calendarRow(), newer], [newer, calendarRow()]];
  const outcomes = permutations.map(calendar => reconcile(before.state, calendar, []));
  assert.deepEqual(outcomes[0], outcomes[1]); assert.equal(outcomes[0]!.newStartsBlocked, false);
  const conflict = calendarRow({title: "Different webinar"});
  assert.deepEqual(reconcile(before.state, [calendarRow(), conflict], []), reconcile(before.state, [conflict, calendarRow()], []));
  assert.equal(reconcile(before.state, [conflict], []).newStartsBlocked, true);
  assert.equal(reconcile(before.state, [calendarRow({providerUpdated: undefined, title: "Different webinar"})], []).newStartsBlocked, true);
  const tokens = [calendarRow({meetingUrl: "https://zoom.us/w/111?tk=z"}), calendarRow({meetingUrl: "https://zoom.us/w/111?tk=a"})];
  const rotated = reconcile(before.state, tokens, []); assert.equal(rotated.newStartsBlocked, false);
  assert.deepEqual(rotated, reconcile(before.state, [...tokens].reverse(), [])); assert.equal(rows(rotated.state)[0]!.aliases.length, 1);
  const ambiguous = reconcile(undefined, [calendarRow(), calendarRow({id: "other-calendar-id"})], []);
  assert.equal(ambiguous.newStartsBlocked, true); assert.equal(choose(ambiguous).toSchedule.length, 0);
});
test("reconciliation refuses foreign or forged state and incomplete acquisition atomically", () => {
  const first = reconcile(), saved = clone(first.state);
  const attack = (mutate: (state: any) => void) => {const state = clone(saved); mutate(state); const bytes = JSON.stringify(state); assert.throws(() => reconcile(freeze(state))); assert.equal(JSON.stringify(state), bytes);};
  attack(state => {state.tenantId = "foreign";}); attack(state => {state.version = 2;});
  attack(state => {state.checkedAt = "2026-02-30T09:00:00.000Z";});
  attack(state => {state.checkedAt = "2026-10-01T09:00:00Z";});
  attack(state => {const key = Object.keys(state.occurrences)[0]!; state.occurrences[key].aliases[0].key = "webinar-" + "0".repeat(24);});
  attack(state => {const key = Object.keys(state.occurrences)[0]!; state.occurrences[key].aliases[0].identity += "|bad";});
  attack(state => {const key = Object.keys(state.occurrences)[0]!; state.occurrences["webinar-" + "0".repeat(24)] = state.occurrences[key]; delete state.occurrences[key];});
  attack(state => {const row = rows(state).find(row => row.source === "gmail")!; row.linkedCalendar = "webinar-" + "0".repeat(24);});
  attack(state => {const row = rows(state).find(row => row.source === "gmail")!; row.aliases = [];});
  attack(state => {const row = rows(state).find(row => row.source === "calendar")!; row.revision = "2026-10-01T08:45:00.000Z";});
  const forged = clone(saved); rows(forged).find(row => row.source === "calendar")!.revision = "2026-10-01T08:45:00.000Z";
  assert.throws(() => reconcile(freeze(forged), [{id: "cal-a", cancelled: true, providerUpdated: "2026-10-01T08:30:00.000Z"}], []));
  assert.throws(() => reconcile(saved, [calendarRow({providerUpdated: "2026-10-01T09:01:01.000Z"})], []));
  attack(state => {const row = rows(state).find(row => row.source === "calendar")!; row.revision = row.snapshot.providerUpdated = "2026-10-01T09:01:01.000Z";});
  attack(state => {Object.values<any>(state.occurrences)[0].reviewKey = "webinar-" + "0".repeat(24);});
  assert.throws(() => reconcile(freeze(saved), [], [], {acquisition: {complete: false, historyComplete: true}}));
  assert.deepEqual(saved, first.state);
  const unknownHistory = reconcile(undefined, [calendarRow()], [mailRow()], {acquisition: {complete: true, historyComplete: false}});
  assert.equal(unknownHistory.state.historyComplete, false); assert.equal(unknownHistory.newStartsBlocked, true); assert.equal(choose(unknownHistory).toSchedule.length, 0);
  for (const field of ["providerUpdated", "originalStartTime"]) assert.throws(() => reconcile(undefined, [calendarRow({[field]: field === "providerUpdated" ? "2026-02-30T08:00:00Z" : {date: "2026-02-30"}})], []));
});
test("reconciliation enforces bounds and invalid-time review without rolled timestamps", () => {
  const first = reconcile(), frozen = freeze(clone(first.state)), before = JSON.stringify(frozen);
  for (const payload of [calendarRow({id: "x".repeat(1025)}), calendarRow({title: "x".repeat(2001)}), calendarRow({meetingUrl: "x".repeat(8193)}), calendarRow({organizer: "x".repeat(321)}), calendarRow({id: "bad\n"})]) {
    assert.throws(() => reconcile(frozen, [payload], [])); assert.equal(JSON.stringify(frozen), before);
  }
  assert.throws(() => reconcile(frozen, Array(20001).fill(calendarRow()), []));
  for (const mutate of [
    (state: any) => {Object.values<any>(state.occurrences)[0].providerIds = Array.from({length: 65}, (_, i) => `p${i}`);},
    (state: any) => {Object.values<any>(state.occurrences)[0].aliases = Array(129).fill(Object.values<any>(state.occurrences)[0].aliases[0]);},
    (state: any) => {state.occurrences = Object.fromEntries(Array.from({length: 20001}, (_, i) => [`p${i}`, {}]));},
    (state: any) => {state.occurrences = {huge: {snapshot: {title: "x".repeat(8 * 1024 * 1024)}}};},
  ]) {const state = clone(first.state); mutate(state); assert.throws(() => reconcile(freeze(state)));}
  for (const startTime of ["2026-02-30T10:00:00Z", "2026-10-02", "2026-10-02T24:00:00Z", "2026-10-02T10:00:00+99:00"]) {
    const result = reconcile(undefined, [calendarRow({startTime})], []);
    assert.equal(rows(result.state)[0]!.snapshot.startTime, undefined); assert.equal(result.inventory[0]!.reason, "invalid-time");
    assert.equal(choose(result).toSchedule.length, 0);
  }
  for (const meetingUrl of [undefined, "", "file:///webinar", "http://zoom.us/j/123", "https://unknown.invalid/webinar"]) {
    const result = reconcile(undefined, [calendarRow({meetingUrl})], []), item = result.inventory[0]!;
    assert.equal(item.reason, meetingUrl ? "unsafe-join-link" : "no-join-link");
    assert.equal(item.reviewKey, webinarSessionKey(`source-review|${item.occurrenceKey}`));
    assert.equal(item.sessionKey, undefined); assert.equal(choose(result).toSchedule.length, 0);
    assert.deepEqual(reconcile(clone(result.state), [], []).inventory, result.inventory);
  }
  const interval = reconcile(undefined, [calendarRow({endTime: future.startTime})], []);
  assert.equal(interval.inventory[0]!.reason, "invalid-time"); assert.equal(choose(interval).toSchedule.length, 0);
  assert.throws(() => reconcile(undefined, [calendarRow({recurringEventId: "series"})], []));
  assert.throws(() => reconcile(undefined, [calendarRow({recurringEventId: "series", originalStartTime: {date: "2026-10-02", dateTime: future.startTime}})], []));
});
