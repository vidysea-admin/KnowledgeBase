/**
 * T-036 fix cycle 3 (ISS-T036CAL-010): a row whose link came from free text contributes NO identity aliases and takes no part in
 * duplicate/ambiguity resolution, barriers or session-key collapse. An outsider's invite repeating a real meeting's link and start can never
 * change the fate of a conference row; it stays a separate, visible, unschedulable row (unverified-link-source).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileWebinarSources } from "../calendar-client.js";
import { prepareWebinarSourceState, type WebinarCalendarAcquisition } from "../schedule-state.js";
import { selectAutoRecordItems } from "../auto-join.js";
import { applyJoinRules } from "../join-rules-select.js";
import { EMPTY_JOIN_RULE_STATE } from "../join-rules.js";

type Row = Record<string, unknown>;
const T1 = "2026-10-11T10:00:00.000Z", T2 = "2026-10-11T10:05:00.000Z", REV = "2026-09-30T10:00:00.000Z";
const URL1 = "https://meet.google.com/abc-defg-hij", START = "2026-10-11T11:00:00.000Z", END = "2026-10-11T12:00:00.000Z";
const legit = (extra: Row = {}): Row => ({ id: "legit", title: "Webinar Real", startTime: START, endTime: END, organizer: "host@good.com", meetingUrl: URL1, meetingUrlSource: "conference", providerUpdated: REV, ...extra });
const evil = (i = 0, extra: Row = {}): Row => ({ id: `evil${i}`, title: "Webinar Real", startTime: START, endTime: END, organizer: "attacker@evil.com", meetingUrl: URL1, meetingUrlSource: "description", providerUpdated: REV, ...extra });
const recon = (events: Row[], scoped: boolean, checkedAt = T1, previous?: unknown, candidates: unknown[] = []) => reconcileWebinarSources({ tenantId: "lane", checkedAt, previous,
  acquisition: { complete: true, historyComplete: true, ...(scoped ? { scope: "available-connected-source-state" as const } : {}) }, calendarEvents: events as never, candidates: candidates as never });
const select = (events: unknown[], every = true, candidates: unknown[] = []) => selectAutoRecordItems({ calendarEvents: events as never, candidates: candidates as never, now: "2026-10-11T10:58:00.000Z",
  leadMinutes: 5, trustedSenders: { emails: ["host@good.com"], domains: [] }, alreadyScheduled: [], everyWebinar: every });
const idOf = (r: ReturnType<typeof recon>, key: string) => (r.state.occurrences[key]!.snapshot as Row).id as string;
const unresolvedAny = (r: ReturnType<typeof recon>) => Object.values(r.state.occurrences).filter((o) => o.unresolved).map((o) => [(o.snapshot as Row).id, o.unresolved]);
/** What the world sees for the rows whose id is in `ids`: events, transitions, inventory, unresolved. */
const view = (r: ReturnType<typeof recon>, ids: string[]) => ({
  events: r.calendarEvents.filter((e) => ids.includes(e.id)),
  transitions: r.transitions.filter((t) => ids.includes(idOf(r, t.occurrenceKey))).map((t) => ({ id: idOf(r, t.occurrenceKey), reason: t.reason, currentKey: t.currentKey, aliases: t.aliases })),
  inventory: r.inventory.filter((i) => ids.includes(idOf(r, i.occurrenceKey))).map((i) => ({ id: idOf(r, i.occurrenceKey), reason: i.reason, sessionKey: i.sessionKey })),
  unresolved: Object.values(r.state.occurrences).filter((o) => ids.includes((o.snapshot as Row).id as string)).map((o) => [(o.snapshot as Row).id, o.unresolved ?? null]),
  blocked: r.newStartsBlocked,
});

test("ISS-T036CAL-010 recorded reproduction: legit conference + outsider description row, both orders, both scopes - legit resolved exactly as if the outsider did not exist", () => {
  let ok = 0;
  for (const scoped of [true, false]) for (const order of [[0, 1], [1, 0]]) {
    const rows = [legit(), evil()], mixed = order.map((i) => rows[i]!);
    const alone = recon([legit()], scoped), both = recon(mixed, scoped);
    const label = `${scoped ? "scoped" : "legacy"} order ${order}`;
    assert.deepEqual(unresolvedAny(both), [], label);
    assert.equal(both.newStartsBlocked, false, label);
    assert.notEqual(both.calendarEvents.length, 0, label);
    assert.deepEqual(view(both, ["legit"]), view(alone, ["legit"]), `${label}: legit row identical to the run without the outsider`);
    for (const every of [true, false]) {
      const a = select(alone.calendarEvents, every), b = select(both.calendarEvents, every);
      assert.deepEqual(b.toSchedule, a.toSchedule, label); assert.equal(b.toSchedule.length, 1, label);
      assert.deepEqual(b.skipped.filter((s) => s.sourceId === "evil0").map((s) => s.reason), ["unverified-link-source"], label);
    }
    ok++;
  }
  console.log(`ISS-T036CAL-010: ${ok}/4 (2 orders x 2 scopes) legit scheduled as when alone, nothing unresolved, outsider skipped unverified-link-source`);
  assert.equal(ok, 4);
});

test("ISS-T036CAL-010 through prepareWebinarSourceState (production path): legit still scheduled, outsider visible and separate", () => {
  const acq = (meetings: Row[]): WebinarCalendarAcquisition => ({ version: 1, tenantId: "A", scope: "available-connected-source-state", complete: true, mode: "baseline",
    checkedAt: T1, syncToken: "tok1", sourceEvents: [], meetings: meetings as never });
  for (const order of [[legit(), evil()], [evil(), legit()]]) {
    const alone = prepareWebinarSourceState({ version: 1, tenantId: "A", operations: {} }, acq([legit()]), [], T1);
    const t = prepareWebinarSourceState({ version: 1, tenantId: "A", operations: {} }, acq(order), [], T1);
    assert.deepEqual(t.transitions, []); assert.deepEqual(t.inventory.map((i) => i.reason).filter(Boolean), []);
    const sel = select(t.calendarEvents);
    assert.deepEqual(sel.toSchedule, select(alone.calendarEvents).toSchedule);
    assert.deepEqual(sel.skipped.map((s) => s.reason), ["unverified-link-source"]);
    const sk = t.inventory.find((i) => (i.snapshot as Row).id === "evil0")!;
    assert.equal(sk.sessionKey, undefined, "the outsider's inventory entry does not take the real meeting's session key");
    const real = t.inventory.find((i) => (i.snapshot as Row).id === "legit")!;
    assert.notEqual(real.sessionKey, undefined);
    const ops = Object.entries(t.state.operations);
    assert.ok(ops.filter(([, o]) => o.status === "queued").length === 1, "exactly one queued operation: the real meeting");
  }
});

test("ISS-T036CAL-010 invite spam: 1, 2 and 50 outsider rows (and 400 for scale) never block or change the legit meeting; work stays linear", () => {
  const timings: number[] = [];
  for (const n of [1, 2, 50, 400]) for (const scoped of [true, false]) {
    const rows = [legit(), ...Array.from({ length: n }, (_, i) => evil(i, { organizer: `a${i}@evil.com` }))];
    const t0 = Date.now(), r = recon(rows, scoped); if (scoped) timings.push(Date.now() - t0);
    assert.deepEqual(unresolvedAny(r), [], `${n} ${scoped}`); assert.equal(r.newStartsBlocked, false);
    const alone = recon([legit()], scoped);
    assert.deepEqual(view(r, ["legit"]), view(alone, ["legit"]), `${n} ${scoped}`);
    const s = select(r.calendarEvents);
    assert.deepEqual(s.toSchedule, select(alone.calendarEvents).toSchedule); assert.equal(s.toSchedule.length, 1);
    assert.equal(s.skipped.filter((x) => x.reason === "unverified-link-source").length, n);
  }
  assert.ok(timings[3]! < 10000, `400 outsider rows reconciled in ${timings[3]} ms (50 rows: ${timings[2]} ms)`);
});

test("(c) two or more free-text rows for the same link collide with nothing: no unresolved, no blocked starts, under both scopes", () => {
  for (const scoped of [true, false]) {
    const other = { id: "other", title: "Webinar Other", startTime: "2026-10-11T11:02:00.000Z", endTime: "2026-10-11T11:40:00.000Z", meetingUrl: "https://zoom.us/j/222222222", meetingUrlSource: "conference", providerUpdated: REV, organizer: "h@good.com" };
    const r = recon([evil(0), evil(1, { meetingUrlSource: "location" }), other], scoped);
    assert.deepEqual(unresolvedAny(r), []); assert.equal(r.newStartsBlocked, false);
    const s = select(r.calendarEvents);
    assert.deepEqual(s.toSchedule.map((i) => i.sourceId), ["other"]);
    assert.deepEqual(s.skipped.map((x) => x.reason).sort(), ["unverified-link-source", "unverified-link-source"]);
  }
});

test("(d) every-webinar collapse: a free-text calendar row never joins the group of a conference row or an authenticated Gmail row", () => {
  const gm = { id: "g1", title: "Webinar Real", senderEmail: "host@good.com", senderDomain: "good.com", senderAuthenticated: true, status: "approved" as const, meetingUrl: URL1,
    startTime: START, endTime: END, kind: "upcoming" as const };
  // conference + gmail + outsider
  const r = recon([legit(), evil()], true, T1, undefined, [gm]);
  assert.deepEqual(unresolvedAny(r), []);
  const withEvil = select(r.calendarEvents, true, r.candidates), without = select(recon([legit()], true, T1, undefined, [gm]).calendarEvents, true, recon([legit()], true, T1, undefined, [gm]).candidates);
  assert.deepEqual(withEvil.toSchedule, without.toSchedule);
  assert.deepEqual(withEvil.skipped.filter((s) => s.sourceId !== "evil0"), without.skipped);
  const e = withEvil.skipped.find((s) => s.sourceId === "evil0")!;
  assert.equal(e.reason, "unverified-link-source"); assert.equal(e.sessionKey, "cal:evil0", "keeps its own key: not the webinar- key of the real group");
  // gmail alone + outsider (no calendar conference row): the Gmail row is scheduled, the outsider neither links nor vetoes
  const g = recon([evil()], true, T1, undefined, [gm]);
  assert.equal(Object.values(g.state.occurrences).filter((o) => o.linkedCalendar).length, 0, "no link between the Gmail row and the free-text row");
  const sg = select(g.calendarEvents, true, g.candidates);
  assert.deepEqual(sg.toSchedule.map((i) => i.sourceId), ["g1"]);
  // a CANCELLED or registration-only outsider cannot veto the group through the shared identity
  const barrier = select([{ ...(evil() as object), cancelled: true }, legit()], true);
  assert.deepEqual(barrier.toSchedule.map((i) => i.sourceId), ["legit"]);
});

test("(e) opt-out: an outsider row sharing a meeting's URL removes nothing, and an opt-out of the real meeting still vetoes every real row", () => {
  const gm = { id: "g1", title: "Webinar Real", senderEmail: "host@good.com", senderDomain: "good.com", senderAuthenticated: true, status: "approved" as const, meetingUrl: URL1,
    startTime: START, endTime: END, kind: "upcoming" as const };
  const sel = select([legit(), evil()], true, [gm]);
  const rules = { version: 1 as const, ownDomains: [], rules: [] };
  const identity = "url:meet:abc-defg-hij";
  const notOpted = applyJoinRules(sel, rules, { state: { ...EMPTY_JOIN_RULE_STATE, optedOutEventIds: ["somethingElse"], optedOutMeetings: ["url:zoom:999999999"] } });
  assert.deepEqual(notOpted.toSchedule.map((i) => i.sourceId), sel.toSchedule.map((i) => i.sourceId)); assert.equal(sel.toSchedule.length, 1);
  const opted = applyJoinRules(sel, rules, { state: { ...EMPTY_JOIN_RULE_STATE, optedOutMeetings: [identity] } });
  assert.equal(opted.toSchedule.length, 0, "real meeting still vetoed: the real rows keep their own aliases/identity");
  assert.ok(opted.skipped.some((s) => s.reason === "opted-out"));
  assert.ok(!opted.toSchedule.some((i) => i.sourceId.startsWith("evil")), "the outsider row was never schedulable, so never a sibling");
  const bySessionKey = applyJoinRules(sel, rules, { state: { ...EMPTY_JOIN_RULE_STATE, optedOutEventIds: ["legit"] } });
  assert.equal(bySessionKey.toSchedule.length, 0);
});

test("(f) a row changing source between ticks: free-text rows hold no aliases; they start holding them once conference, and drop them again when it goes back", () => {
  const aliasCount = (r: ReturnType<typeof recon>) => Object.values(r.state.occurrences).map((o) => o.aliases.length);
  const t1 = recon([evil(0)], true); assert.deepEqual(aliasCount(t1), [0]);
  const t2 = recon([evil(0, { meetingUrlSource: "conference" })], true, T2, t1.state); assert.deepEqual(aliasCount(t2), [1]);
  assert.equal(select(t2.calendarEvents).toSchedule.length, 1, "now conference: schedulable");
  const t3 = recon([evil(0)], true, "2026-10-11T10:10:00.000Z", t2.state); assert.deepEqual(aliasCount(t3), [0], "back to free text: aliases dropped");
  assert.equal(select(t3.calendarEvents).toSchedule.length, 0);
  // while free-text, it does not collide with a real conference row; once it becomes conference at the same url it does (real ambiguity)
  const real = recon([legit(), evil(0)], true), up = recon([legit(), evil(0, { meetingUrlSource: "conference" })], true, T2, real.state);
  assert.deepEqual(unresolvedAny(real), []); assert.ok(unresolvedAny(up).length === 2, "two conference rows for one meeting are still ambiguous");
  // an absent (legacy) source still counts as conference: aliases kept
  assert.deepEqual(aliasCount(recon([{ ...legit(), meetingUrlSource: undefined }], true)), [1]);
});

// ---- seeded property: the fate of every trusted row is identical with and without any added free-text rows ----
function rng(seed: number) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
test("property (seed 20261011, 300 cases x 2 scopes): the result for every trusted row equals the result on the trusted rows alone; no free-text row is ever scheduled", () => {
  const rand = rng(20261011), pick = <X,>(a: readonly X[]): X => a[Math.floor(rand() * a.length)]!;
  const URLS = [URL1, "https://zoom.us/j/111111111?pwd=a", "https://zoom.us/j/222222222", "https://meet.google.com/xyz-abcd-efg"];
  const STARTS = ["11:00", "11:30", "13:00"], TITLES = ["Webinar A", "Webinar B", "Team meeting", "Workshop on X"];
  const at = (hm: string, plus = 0) => `2026-10-11T${String(Number(hm.slice(0, 2)) + plus).padStart(2, "0")}${hm.slice(2)}:00.000Z`;
  let cases = 0, freeScheduled = 0, freeRows = 0;
  for (let n = 0; n < 300; n++) {
    const T: Row[] = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => { const s = pick(STARTS); return { id: `t${i}`, title: pick(TITLES), startTime: at(s), endTime: at(s, 1), organizer: pick(["host@good.com", "x@y.org"]),
      meetingUrl: pick(URLS), ...(rand() < 0.5 ? { meetingUrlSource: "conference" } : {}), providerUpdated: REV }; });
    const F: Row[] = Array.from({ length: Math.floor(rand() * 9) }, (_, i) => { const base = pick(T); return { id: pick([`f${i}`, `${base.title} ${i}`, `${base.meetingUrl}#${i}`]), title: pick([base.title as string, pick(TITLES)]),
      startTime: pick([base.startTime as string, at(pick(STARTS))]), endTime: pick([base.endTime as string, at(pick(STARTS), 1)]), organizer: "attacker@evil.com",
      meetingUrl: pick([base.meetingUrl as string, pick(URLS)]), meetingUrlSource: pick(["location", "description", "bogus"]), providerUpdated: REV }; });
    const shuffled = [...T, ...F].sort(() => rand() - 0.5), tIds = T.map((t) => t.id as string);
    for (const scoped of [true, false]) {
      const alone = recon(T, scoped), both = recon(shuffled, scoped);
      assert.deepEqual(view(both, tIds), view(alone, tIds), `case ${n} ${scoped}`);
      for (const every of [true, false]) {
        const a = select(alone.calendarEvents, every), b = select(both.calendarEvents, every);
        const fate = (s: ReturnType<typeof select>) => [...s.toSchedule.map((i) => `S ${i.sourceId} ${i.sessionKey}`), ...s.skipped.filter((x) => tIds.includes(x.sourceId)).map((x) => `K ${x.sourceId} ${x.reason} ${x.sessionKey}`)].sort();
        assert.deepEqual(fate(b), fate(a), `case ${n} ${scoped} every=${every}`);
        const fIds = F.map((f) => f.id as string);
        freeScheduled += b.toSchedule.filter((i) => fIds.includes(i.sourceId) && !tIds.includes(i.sourceId)).length;
      }
      cases++;
    }
    freeRows += F.length;
  }
  console.log(`property: ${cases}/${cases} cases (300 seeds x 2 scopes, ${freeRows} free-text rows added), trusted rows identical to the run on T alone, free-text rows scheduled: ${freeScheduled}`);
  assert.equal(freeScheduled, 0);
});

test("(f) a Gmail row linked to a conference event survives the calendar row later turning free-text: no throw, no block; the Gmail row keeps its own trust", () => {
  const gm = { id: "g1", title: "Webinar Real", senderEmail: "host@good.com", senderDomain: "good.com", senderAuthenticated: true, status: "approved" as const, meetingUrl: URL1,
    startTime: START, endTime: END, kind: "upcoming" as const };
  for (const scoped of [true, false]) {
    const first = recon([legit()], scoped, T1, undefined, [gm]);
    assert.ok(Object.values(first.state.occurrences).some((o) => o.linkedCalendar), "linked while the calendar row is conference");
    const later = recon([legit({ meetingUrlSource: "description", providerUpdated: "2026-10-01T10:00:00.000Z" })], scoped, T2, first.state, [gm]);
    assert.deepEqual(unresolvedAny(later), []); assert.equal(later.newStartsBlocked, false);
  }
});
