/**
 * T-036 fix cycle 2 (ISS-T036CAL-006): `meetingUrlSource` is provenance, not identity. A persisted event written before the field existed must
 * reconcile with the same event at the same revision without a contradiction, and every source transition must end with the FRESH source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileWebinarSources } from "../calendar-client.js";
import { prepareWebinarSourceState, type WebinarCalendarAcquisition } from "../schedule-state.js";
import { selectAutoRecordItems } from "../auto-join.js";

const T1 = "2026-10-11T10:00:00.000Z", T2 = "2026-10-11T10:05:00.000Z", REV = "2026-09-30T10:00:00.000Z";
const EMPTY = { emails: [], domains: [] };
type Row = Record<string, unknown>;
const meet = (i: number) => { const x = String.fromCharCode(97 + (i % 26)), y = String.fromCharCode(97 + Math.floor(i / 26)); return `https://meet.google.com/${x}${y}a-${x}${y}${x}${y}-${y}${x}a`; };
const ev = (i: number, extra: Row = {}): Row => ({ id: `w${i}`, title: `Webinar ${i}`, startTime: `2026-10-11T${String(11 + (i % 10)).padStart(2, "0")}:00:00.000Z`,
  endTime: `2026-10-11T${String(11 + (i % 10)).padStart(2, "0")}:30:00.000Z`, organizer: "host@example.org", meetingUrl: meet(i), providerUpdated: REV, ...extra });
const withSrc = (e: Row, s: unknown): Row => (s === undefined ? e : { ...e, meetingUrlSource: s });
const recon = (events: Row[], checkedAt: string, previous?: unknown, scoped = true) => reconcileWebinarSources({ tenantId: "lane", checkedAt, previous,
  acquisition: { complete: true, historyComplete: true, ...(scoped ? { scope: "available-connected-source-state" as const } : {}) }, calendarEvents: events as never, candidates: [] });
const select = (events: Row[]) => selectAutoRecordItems({ calendarEvents: events as never, candidates: [], now: "2026-10-11T10:59:00.000Z", leadMinutes: 120, trustedSenders: EMPTY, alreadyScheduled: [], everyWebinar: true });
const storedSource = (r: ReturnType<typeof recon>) => (Object.values(r.state.occurrences)[0]!.snapshot as Row).meetingUrlSource;
const SOURCES = [undefined, "conference", "location", "description", "Description"] as const;
const trusted = (s: unknown) => s === undefined || s === "conference";

test("ISS-T036CAL-006 recorded reproduction: a pre-unit conference event, unchanged, is NOT contradictory and is still scheduled (prepareWebinarSourceState)", () => {
  const acq = (mode: "baseline" | "sync", checkedAt: string, meetings: Row[], requested?: string, token = "tok1"): WebinarCalendarAcquisition => ({ version: 1, tenantId: "A",
    scope: "available-connected-source-state", complete: true, mode, checkedAt, ...(requested ? { requestedSyncToken: requested } : {}), syncToken: token, sourceEvents: [], meetings: meetings as never });
  const legacy = ev(1);                                  // the pre-unit mapper shape: no meetingUrlSource
  const t1 = prepareWebinarSourceState({ version: 1, tenantId: "A", operations: {} }, acq("baseline", T1, [legacy]), [], T1);
  assert.equal(t1.calendarEvents.length, 1);
  let state = t1.state;
  for (const [n, at] of [T2, "2026-10-11T10:10:00.000Z"].entries()) { // tick 2 and tick 3: same event, same revision, now carrying the field
    const t = prepareWebinarSourceState(state, acq("sync", at, [withSrc(legacy, "conference")], state.source!.coverage.calendarSyncToken, `tok${n + 2}`), [], at);
    assert.deepEqual(t.inventory.map((i) => i.reason).filter(Boolean), [], "no contradictory-revision / unresolved reason");
    assert.deepEqual(t.transitions, [], "no unresolved transition");
    assert.equal(t.calendarEvents.length, 1);
    assert.equal(t.calendarEvents[0]!.meetingUrlSource, "conference");
    assert.equal(select(t.calendarEvents as never).toSchedule.length, 1, "still scheduled exactly as before");
    state = t.state;
  }
  console.log("ISS-T036CAL-006: 1/1 recorded reproduction (3 ticks) not contradictory, not dropped, scheduled");
});

test("ISS-T036CAL-006: legacy scope (no scope) - the same reconciliation does not block all starts", () => {
  const first = recon([ev(1)], T1, undefined, false);
  const second = recon([withSrc(ev(1), "conference")], T2, first.state, false);
  assert.equal(second.newStartsBlocked, false);
  assert.equal(second.calendarEvents.length, 1);
  assert.deepEqual(second.transitions, []);
  assert.equal(Object.values(second.state.occurrences).some((r) => r.unresolved), false);
});

test("ISS-T036CAL-006: 50 persisted legacy events reconcile to 50 joinable events; only the field is added, everything else is deep-equal", () => {
  const legacy = Array.from({ length: 50 }, (_, i) => ev(i));
  assert.equal(new Set(legacy.map((e) => e.meetingUrl)).size, 50);
  for (const scoped of [true, false]) {
    const first = recon(legacy, T1, undefined, scoped);
    assert.equal(first.calendarEvents.length, 50);
    const second = recon(legacy.map((e) => withSrc(e, "conference")), T2, first.state, scoped);
    assert.equal(second.calendarEvents.length, 50); assert.equal(second.newStartsBlocked, false);
    assert.deepEqual(second.transitions, []); assert.deepEqual(second.inventory.map((i) => i.reason).filter(Boolean), []);
    const strip = (o: unknown) => { const c = JSON.parse(JSON.stringify(o)); for (const r of Object.values<Row>(c)) delete (r.snapshot as Row).meetingUrlSource; return c; };
    assert.deepEqual(strip(second.state.occurrences), strip(first.state.occurrences), "everything but the new field is unchanged");
    assert.equal(Object.values(second.state.occurrences).filter((r) => (r.snapshot as Row).meetingUrlSource === "conference").length, 50, "the field is added in place");
    assert.deepEqual(second.calendarEvents.map((e) => { const { meetingUrlSource, ...rest } = e as unknown as Row; assert.equal(meetingUrlSource, "conference"); return rest; }),
      first.calendarEvents as never, "events handed to selection differ only by the field");
    const before = select(first.calendarEvents as never).toSchedule.map((i) => i.sessionKey), after = select(second.calendarEvents as never).toSchedule.map((i) => i.sessionKey);
    assert.ok(after.length > 0); assert.deepEqual(after, before, "the same sessions are scheduled as before");
  }
});

test("transition table: persisted source x fresh source, same url and revision - never contradictory, stored = fresh, no free-text link is ever scheduled", () => {
  let cells = 0;
  for (const scoped of [true, false]) for (const p of SOURCES) for (const f of SOURCES) {
    const first = recon([withSrc(ev(1), p)], T1, undefined, scoped);
    const second = recon([withSrc(ev(1), f)], T2, first.state, scoped);
    const label = `${scoped ? "scoped" : "legacy"} ${String(p)} -> ${String(f)}`;
    assert.equal(Object.values(second.state.occurrences)[0]!.unresolved, undefined, label);
    assert.deepEqual(second.transitions, [], label); assert.equal(second.newStartsBlocked, false, label);
    const want = f === undefined && !trusted(p) ? p : f;   // a copy naming no source never relaxes a stored free-text source
    assert.equal(storedSource(second), want, label);
    const out = select(second.calendarEvents as never);
    assert.equal(out.toSchedule.length, trusted(want) ? 1 : 0, label);
    if (!trusted(want)) assert.deepEqual(out.skipped.map((s) => s.reason), ["unverified-link-source"], label);
    cells++;
  }
  console.log(`transition table: ${cells}/${cells} cells (5 x 5 x 2 scopes)`);
  assert.equal(cells, 50);
});

test("transition table: a stale (older revision) copy never changes the stored source; a newer copy always does; a changed url keeps the old revision logic", () => {
  const OLD = "2026-09-29T10:00:00.000Z", NEW = "2026-10-01T10:00:00.000Z";
  const stored = recon([withSrc(ev(1), "description")], T1);
  assert.equal(storedSource(recon([withSrc(ev(1, { providerUpdated: OLD }), "conference")], T2, stored.state)), "description", "stale conference never beats stored description");
  const conf = recon([withSrc(ev(1), "conference")], T1);
  assert.equal(storedSource(recon([withSrc(ev(1, { providerUpdated: OLD }), "description")], T2, conf.state)), "conference", "stale copies are ignored in both directions");
  const edited = recon([withSrc(ev(1, { providerUpdated: NEW }), "description")], T2, conf.state);
  assert.equal(storedSource(edited), "description"); assert.equal(select(edited.calendarEvents as never).toSchedule.length, 0);
  const other = recon([withSrc(ev(1, { meetingUrl: meet(9) }), "conference")], T2, conf.state);
  assert.equal(Object.values(other.state.occurrences)[0]!.unresolved, "contradictory-revision", "a different url at the same revision is still contradictory");
});

test("transition table: two same-revision copies in one fetch that differ only by source - the LESS trusted one wins", () => {
  for (const order of [["conference", "description"], ["description", "conference"]]) {
    const r = recon(order.map((s) => withSrc(ev(1), s)), T1);
    assert.equal(storedSource(r), "description", order.join(","));
    assert.equal(select(r.calendarEvents as never).toSchedule.length, 0, order.join(","));
  }
});

test("persistence round trip: the stored source survives JSON serialisation and a later tick in which the event is absent", () => {
  const first = recon([withSrc(ev(1), "location")], T1);
  const later = recon([], T2, JSON.parse(JSON.stringify(first.state)));
  assert.equal(storedSource(later), "location");
  assert.equal(select(later.calendarEvents as never).toSchedule.length, 0);
});
