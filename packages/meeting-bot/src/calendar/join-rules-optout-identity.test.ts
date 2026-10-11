/**
 * packages/meeting-bot/src/calendar/join-rules-optout-identity.test.ts — T-037 unit
 * `t037-veto-skip-reasons-and-optout-identity` (lane T037W1). D-015: ISS-T037VETO-001/-002 are replayed verbatim
 * from qa/issues.t037veto.jsonl, and the counts are printed by issue id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem, SkipReason } from "@lkb/core";
import { selectAutoRecordItems } from "./auto-join.js";
import { applyJoinRules } from "./join-rules-select.js";
import { EMPTY_JOIN_RULE_STATE, type JoinRule, type JoinRuleSet, type JoinRuleState } from "./join-rules.js";
import { describeSkip, SKIP_REASON_MEANING, VETO_SKIP_REASONS } from "./skip-describe.js";
import { projectWebinarSelection } from "./auto-record-policy.js";

const rs = (rules: JoinRule[] = []): JoinRuleSet => ({ version: 1, ownDomains: [], rules });
const st = (optedOutEventIds: string[]): JoinRuleState => ({ ...EMPTY_JOIN_RULE_STATE, optedOutEventIds });
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.values(v)) freeze(k); } return v; };
const sel = (toSchedule: AutoRecordItem[], skipped: SkippedItem[] = []): SelectAutoRecordItemsResult => ({ toSchedule, skipped });
const ZOOM = (n: number, q = "") => `https://zoom.us/j/${n}${q}`;
const it = (sourceId: string, over: Partial<AutoRecordItem> = {}): AutoRecordItem => ({ sessionKey: `cal:${sourceId}`, source: "calendar", sourceId,
  title: `T ${sourceId}`, startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z", meetingUrl: ZOOM(123456789), sender: "a@x.com", ...over });
const ids = (r: SelectAutoRecordItemsResult) => r.toSchedule.map((i) => i.sourceId);

// The verbatim reproduction recorded in ISS-T037VETO-002.
const REPRO2 = {
  everyWebinar: true, now: "2026-10-10T09:50:00Z", leadMinutes: 15,
  calendarEvents: [{ id: "calX", title: "Weekly sync", organizer: "o@x.com", meetingUrl: "https://zoom.us/j/123456789?pwd=a",
    startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z" }],
  candidates: [{ id: "g1", title: "Webinar: Intro to X", senderEmail: "o@x.com", status: "approved" as const, meetingUrl: "https://zoom.us/j/123456789?pwd=a",
    startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z" }],
  trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [] as string[],
};

test("the issue ledger rows are present, so the replay below is of the recorded cases", () => {
  const rows = readFileSync(new URL("../../../../qa/issues.t037veto.jsonl", import.meta.url), "utf8");
  assert.ok(rows.includes('"ISS-T037VETO-002"') && rows.includes("calX") && rows.includes('"ISS-T037VETO-001"'));
});

test("D-015 ISS-T037VETO-002 replay: opt-out on calX removes the meeting scheduled as g1", () => {
  let ok = 0; const total = 5;
  const base = selectAutoRecordItems(REPRO2 as never);
  if (base.toSchedule.length === 1 && base.toSchedule[0]!.sourceId === "g1" && /^webinar-/.test(base.toSchedule[0]!.sessionKey)) ok++;
  if (base.skipped.some((s) => s.sourceId === "calX" && s.reason === "needs-review")) ok++;
  const out = applyJoinRules(freeze(base), rs(), { state: st(["calX"]) });
  if (out.toSchedule.length === 0) ok++;
  const removed = out.skipped.find((s) => s.sourceId === "g1");
  if (removed?.reason === "opted-out") ok++;
  if (removed && /meeting-opt-out \(rule opt-out:calX\)/.test(removed.detail ?? "") && !(removed.detail ?? "").includes("zoom.us")) ok++;
  console.log(`ISS-T037VETO-002: ${ok}/${total}`);
  assert.equal(ok, total);
  // the other direction: an opt-out for g1 also removes it (own id); an unrelated opt-out keeps it (same reference)
  assert.equal(applyJoinRules(base, rs(), { state: st(["g1"]) }).toSchedule.length, 0);
  assert.equal(applyJoinRules(base, rs(), { state: st(["other"]) }), base);
});

test("D-015 ISS-T037VETO-001 replay: each removal carries a truthful reason", () => {
  let ok = 0; const total = 6;
  const MEET = (n: number) => `https://meet.google.com/abc-defg-hi${String.fromCharCode(97 + n)}`;
  const e = (n: number): AutoRecordItem => it(`e${n}`, { meetingUrl: MEET(n) });
  // recorded repro: opt-out of e2, trusted sender a@x.com, empty rule set
  const r = applyJoinRules(sel([e(1), e(2)]), rs(), { state: st(["e2"]) });
  if (r.skipped[0]?.reason === "opted-out") ok++;
  if (r.skipped[0]?.detail === "join-rules veto: meeting-opt-out (rule opt-out:e2)") ok++;
  if (ids(r).join() === "e1") ok++;
  const d = applyJoinRules(sel([e(1), e(2)]), rs([{ id: "d1", effect: "deny", match: { email: "a@x.com" } }]));
  if (d.skipped.length === 2 && d.skipped.every((s) => s.reason === "rule-denied")) ok++;
  const bad = applyJoinRules(sel([e(1)]), { version: 2 } as unknown as JoinRuleSet);
  if (bad.skipped[0]?.reason === "rules-unevaluable") ok++;
  const thrown = applyJoinRules(sel([e(1)]), rs(), {}, () => { throw new Error("x"); });
  if (thrown.skipped[0]?.reason === "rules-unevaluable") ok++;
  console.log(`ISS-T037VETO-001: ${ok}/${total}`);
  assert.equal(ok, total);
  for (const s of [...r.skipped, ...d.skipped, ...bad.skipped]) assert.notEqual(s.reason, "untrusted-sender");
});

test("opt-out by sourceId, by sessionKey, and by sibling identity across sources", () => {
  const cal = it("calX", { meetingUrl: ZOOM(555555555, "?pwd=a"), endTime: "2026-10-10T10:30:00Z" });
  const gm = it("g1", { source: "gmail", sessionKey: "gmail:g1", meetingUrl: "https://us02web.zoom.us/j/555555555?pwd=zz", startTime: "2026-10-10T11:00:00Z", endTime: "2026-10-10T12:00:00Z" });
  const s = freeze(sel([cal, gm]));
  assert.deepEqual(ids(applyJoinRules(s, rs(), { state: st(["calX"]) })), []);
  assert.deepEqual(ids(applyJoinRules(s, rs(), { state: st(["g1"]) })), []);
  assert.deepEqual(ids(applyJoinRules(s, rs(), { state: st(["gmail:g1"]) })), []);
  const r = applyJoinRules(s, rs(), { state: st(["calX"]) });
  assert.match(r.skipped.find((x) => x.sourceId === "g1")!.detail!, /same meeting, recorded under another source id/);
});

test("sibling found through a SKIPPED record that shares the sessionKey (calendar copy skipped as a duplicate)", () => {
  const surviving = it("g1", { source: "gmail", sessionKey: "webinar-abc", meetingUrl: "not a url" });
  const skippedCopy: SkippedItem = { sessionKey: "webinar-abc", source: "calendar", sourceId: "calX", title: "t", reason: "duplicate-session" };
  assert.deepEqual(ids(applyJoinRules(freeze(sel([surviving], [skippedCopy])), rs(), { state: st(["calX"]) })), []);
});

test("two different meetings on the same platform are not confused", () => {
  const a = it("a", { meetingUrl: ZOOM(111111111) }); const b = it("b", { meetingUrl: ZOOM(222222222) });
  assert.deepEqual(ids(applyJoinRules(sel([a, b]), rs(), { state: st(["a"]) })), ["b"]);
  const m1 = it("m1", { meetingUrl: "https://meet.google.com/abc-defg-hij" }); const t1 = it("t1", { meetingUrl: ZOOM(111111111) });
  assert.deepEqual(ids(applyJoinRules(sel([m1, t1]), rs(), { state: st(["m1"]) })), ["t1"]);
});

test("an item whose URL yields no identity is matched by ids only", () => {
  const a = it("a", { meetingUrl: "not a url" }); const b = it("b", { meetingUrl: "not a url" });
  const c = it("c", { meetingUrl: "https://example.com/watch" }); const d = it("d", { meetingUrl: "https://example.com/watch" });
  const r = applyJoinRules(sel([a, b, c, d]), rs(), { state: st(["a", "c"]) });
  assert.deepEqual(ids(r), ["b", "d"]);
});

test("CURRENT LIMITATION (ISS-T037W1-001): an opt-out whose record is absent from the selection misses its sibling", () => {
  // calX was opted out but is no longer in the selection (calendar fetch failed / event edited away); the
  // Gmail copy of the same meeting still joins. Storing the meeting identity with the opt-out (design ii) closes this.
  const g1 = it("g1", { source: "gmail", sessionKey: "gmail:g1" });
  const r = applyJoinRules(freeze(sel([g1])), rs(), { state: st(["calX"]) });
  assert.deepEqual(ids(r), ["g1"], "this is open: if it starts failing, the issue was fixed - update it");
  // the opt-out by id still matches a record that IS present
  assert.deepEqual(ids(applyJoinRules(sel([g1]), rs(), { state: st(["g1"]) })), []);
});

test("every new reason is handled by describeSkip and the meaning table; projection passes them through", () => {
  const newReasons: SkipReason[] = ["opted-out", "rule-denied", "rules-unevaluable"];
  assert.deepEqual([...VETO_SKIP_REASONS].sort(), [...newReasons].sort());
  for (const reason of newReasons) {
    const line = describeSkip({ sessionKey: "k", source: "calendar", sourceId: "e1", title: "T", reason, detail: "d" });
    assert.ok(line.includes(`[${reason}]`) && line.includes(SKIP_REASON_MEANING[reason]) && SKIP_REASON_MEANING[reason].length > 20, line);
    assert.ok(!line.includes("untrusted-sender") && !line.includes("sender is not trusted"));
    const p = projectWebinarSelection({ toSchedule: [], skipped: [{ sessionKey: "k", source: "calendar", sourceId: "e1", title: "T", reason }] }, false);
    assert.equal(p.skipped[0]!.reason, reason);
  }
  // an older reason keeps its exact old line
  assert.equal(describeSkip({ sessionKey: "k", source: "gmail", sourceId: "g", title: "T", reason: "past" }), '  skip [past] — gmail:g "T"');
  const tick = readFileSync(new URL("./schedule-tick.ts", import.meta.url), "utf8");
  assert.match(tick, /import \{ describeSkip \} from "\.\/skip-describe\.js"/);
  assert.ok(!/function describeSkip/.test(tick));
});

test("property: 4000 seeded cases with cross-source duplicates: subset + exact opt-out closure", () => {
  let seed = 20261011;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const rint = (n: number) => Math.floor(rnd() * n);
  let removedTotal = 0, siblingRemovals = 0;
  for (let n = 0; n < 4000; n++) {
    const sched: AutoRecordItem[] = []; const skipped: SkippedItem[] = [];
    const count = rint(7);
    for (let k = 0; k < count; k++) {
      const meeting = rint(4); const shared = rnd() < 0.5;
      const urlKind = rnd();
      const meetingUrl = urlKind < 0.7 ? ZOOM(300000000 + meeting, `?pwd=${rint(3)}`) : urlKind < 0.85 ? "nonsense" : `https://example.com/p${rint(3)}`;
      sched.push(it(`s${k}`, { sessionKey: shared ? `webinar-${meeting}` : `cal:s${k}`, meetingUrl, source: rnd() < 0.5 ? "calendar" : "gmail" }));
    }
    for (let k = 0, m = rint(4); k < m; k++) skipped.push({ sessionKey: rnd() < 0.7 ? `webinar-${rint(4)}` : `cal:x${k}`, source: "calendar", sourceId: `x${k}`, title: "x", reason: "needs-review" });
    const pool = [...sched.flatMap((i) => [i.sourceId, i.sessionKey]), ...skipped.flatMap((i) => [i.sourceId, i.sessionKey]), "ghost"];
    const opted = Array.from({ length: rint(3) }, () => pool[rint(pool.length)]!);
    // Independent oracle: connected components over (shared sessionKey) and (same zoom id, scheduled items only).
    const recs = [
      ...sched.map((i) => ({ ids: [i.sourceId, i.sessionKey], tags: [`k${i.sessionKey}`, ...(/zoom\.us\/j\/(\d+)/.exec(i.meetingUrl)?.[1] ? [`z${/zoom\.us\/j\/(\d+)/.exec(i.meetingUrl)![1]}`] : [])] })),
      ...skipped.map((i) => ({ ids: [i.sourceId, i.sessionKey], tags: [`k${i.sessionKey}`] })),
    ];
    const comp = recs.map((_, x) => x);
    for (let changed = true; changed;) {
      changed = false;
      for (let x = 0; x < recs.length; x++) for (let y = 0; y < recs.length; y++) {
        if (comp[x] !== comp[y] && recs[x]!.tags.some((t) => recs[y]!.tags.includes(t))) {
          const lo = Math.min(comp[x]!, comp[y]!); const hi = Math.max(comp[x]!, comp[y]!);
          for (let z = 0; z < comp.length; z++) if (comp[z] === hi) comp[z] = lo;
          changed = true;
        }
      }
    }
    const optedComps = new Set<number>();
    recs.forEach((r, x) => { if (r.ids.some((id) => opted.includes(id))) optedComps.add(comp[x]!); });
    const expectRemoved = sched.filter((_, x) => optedComps.has(comp[x]!));
    const input = freeze(sel(sched, skipped));
    const out = applyJoinRules(input, freeze(rs()), freeze({ state: st(opted) }));
    const removed = sched.filter((i) => !out.toSchedule.includes(i));
    assert.deepEqual(removed.map((i) => i.sourceId), expectRemoved.map((i) => i.sourceId), `case ${n}`);
    let j = 0;
    for (const i of out.toSchedule) { while (j < sched.length && sched[j] !== i) j++; assert.ok(j < sched.length, "not a subsequence"); j++; }
    assert.deepEqual(out.skipped.slice(0, skipped.length), skipped);
    assert.equal(out.skipped.length, skipped.length + removed.length);
    for (const s of out.skipped.slice(skipped.length)) assert.equal(s.reason, "opted-out");
    for (let q = 0; q < skipped.length; q++) assert.equal(out.skipped[q], skipped[q]);
    if (removed.length === 0) assert.equal(out, input);
    assert.equal(applyJoinRules(input, undefined, { state: st(opted) }), input);
    removedTotal += removed.length;
    siblingRemovals += removed.filter((i) => !opted.includes(i.sourceId) && !opted.includes(i.sessionKey)).length;
  }
  console.log(`property: 4000 cases, removed ${removedTotal}, of which sibling-only ${siblingRemovals}`);
  assert.ok(removedTotal > 500 && siblingRemovals > 100, `too weak: ${removedTotal}/${siblingRemovals}`);
});
