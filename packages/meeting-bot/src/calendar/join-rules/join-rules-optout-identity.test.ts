/**
 * packages/meeting-bot/src/calendar/join-rules/join-rules-optout-identity.test.ts — T-037 unit
 * `t037-veto-skip-reasons-and-optout-identity` (lane T037W1). D-015: ISS-T037VETO-001/-002 are replayed verbatim
 * from qa/issues.t037veto.jsonl, and the counts are printed by issue id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem, SkipReason } from "@lkb/core";
import { selectAutoRecordItems } from "../auto-join.js";
import { applyJoinRules } from "./join-rules-select.js";
import {
  EMPTY_JOIN_RULE_STATE, evaluateJoinRules, recordOptOut, recordRuleApproval, validateJoinRuleState,
  type JoinRule, type JoinRuleSet, type JoinRuleState,
} from "./join-rules.js";
import { MAX_OPTED_OUT_MEETINGS, isMeetingEntry } from "./join-rules-optout.js";
import { loadJoinRules, saveJoinRules, recordTenantOptOut, joinRulesFilePath, JoinRulesStoreError } from "./join-rules-store.js";
import { meetingIdentity } from "../../send-now.js";
import { describeSkip, SKIP_REASON_MEANING, VETO_SKIP_REASONS } from "../state/skip-describe.js";
import { projectWebinarSelection } from "../auto-record-policy.js";

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
  const rows = readFileSync(new URL("../../../../../qa/issues.t037veto.jsonl", import.meta.url), "utf8");
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

test("ISS-T037W1-001 (fixed in t037-optout-meeting-identity-store): an id-only opt-out of an ABSENT record still misses; the stored identity closes it", () => {
  // Old/id-only state (no meeting identity recorded): the absent calX cannot be linked to g1 - unchanged, documented behaviour.
  const g1 = it("g1", { source: "gmail", sessionKey: "gmail:g1" });
  const r = applyJoinRules(freeze(sel([g1])), rs(), { state: st(["calX"]) });
  assert.deepEqual(ids(r), ["g1"], "id-only opt-out of an absent record: nothing links it (old documents keep this behaviour)");
  // With the identity stored alongside the opt-out (the fix), the absent-record repro is vetoed: see the t037-optout-meeting-identity-store tests at the end of this file.
  const fixed = applyJoinRules(freeze(sel([g1])), rs(), { state: { ...st(["calX"]), optedOutMeetings: ["url:zoom:123456789"] } });
  assert.deepEqual(ids(fixed), [], "stored identity vetoes g1 although calX is absent");
  assert.equal(fixed.skipped[0]!.reason, "opted-out");
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
  const tick = readFileSync(new URL("../schedule-tick.ts", import.meta.url), "utf8");
  assert.match(tick, /import \{ describeSkip \} from "\.\/state\/skip-describe\.js"/);
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

// ---- unit t037-optout-meeting-identity-store (ISS-T037W1-001; folded here from join-rules-optout-meeting.test.ts to hold the calendar dir at 30 files) ----
const RS: JoinRuleSet = { version: 1, ownDomains: [], rules: [] };
const g1 = (): AutoRecordItem => it("g1", { source: "gmail", sessionKey: "gmail:g1", meetingUrl: ZOOM(123456789, "?pwd=zz") });
const optOutX = (url: string | undefined = ZOOM(123456789, "?pwd=a"), key?: string): JoinRuleState =>
  recordOptOut(EMPTY_JOIN_RULE_STATE, "calX", { meetingUrl: url, sessionKey: key });
const withDir = (fn: (dir: string) => void) => { const d = mkdtempSync(path.join(tmpdir(), "optout-meeting-")); try { fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };

test("D-015 ISS-T037W1-001 replay: recorded scenario, opt-out of calX stores the meeting, g1 alone is vetoed", () => {
  const row = readFileSync(new URL("../../../../../qa/issues.t037w1.jsonl", import.meta.url), "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; evidence: string }).find((r) => r.id === "ISS-T037W1-001");
  let ok = 0; const total = 7;
  if (row && row.evidence.includes("optedOutEventIds") && row.evidence.includes("calX") && row.evidence.includes("123456789")) ok++;
  // 1. the recorded call, with the opt-out recorded the way the fix records it (id + meeting from calX's URL)
  const state = optOutX();
  const out = applyJoinRules(sel([g1()]), RS, { state });
  if (ids(out).length === 0) ok++;
  if (out.skipped[0]?.reason === "opted-out" && out.skipped[0].sourceId === "g1") ok++;
  if (/meeting-opt-out \(rule opt-out:url:zoom:123456789\)/.test(out.skipped[0]?.detail ?? "") && !(out.skipped[0]?.detail ?? "").includes("zoom.us")) ok++;
  // 2. recorded variants: calX not due / feed failed -> real selector sees only the Gmail candidate
  const only = selectAutoRecordItems({ everyWebinar: true, now: "2026-10-10T09:50:00Z", leadMinutes: 15, calendarEvents: [],
    candidates: [{ id: "g1", title: "Webinar: Intro to X", senderEmail: "o@x.com", status: "approved", meetingUrl: ZOOM(123456789, "?pwd=a"),
      startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z" }] as never, trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [] } as never);
  if (only.toSchedule.length === 1 && applyJoinRules(only, RS, { state }).toSchedule.length === 0) ok++;
  // 3. calX was skipped and g1 has another start (different webinar key): only the URL identity links them
  const g1b = it("g1", { source: "gmail", sessionKey: "webinar-other", startTime: "2026-10-10T12:00:00Z", meetingUrl: ZOOM(123456789) });
  if (applyJoinRules(sel([g1b], [{ sessionKey: "cal:calX", source: "calendar", sourceId: "calX", title: "t", reason: "needs-review" }]), RS, { state }).toSchedule.length === 0) ok++;
  // 4. the old id-only state still behaves as before (g1 joins): named, by design, covered by the old documents test
  if (ids(applyJoinRules(sel([g1()]), RS, { state: { ...EMPTY_JOIN_RULE_STATE, optedOutEventIds: ["calX"] } })).join() === "g1") ok++;
  console.log(`ISS-T037W1-001: ${ok}/${total}`);
  assert.equal(ok, total);
});

test("recordOptOut: stores id + url identity + sessionKey, deduplicated, immutable, order stable", () => {
  const s0 = Object.freeze({ ...EMPTY_JOIN_RULE_STATE });
  const s1 = recordOptOut(s0, "calX", { meetingUrl: ZOOM(123456789, "?pwd=a"), sessionKey: "webinar-abc" });
  assert.deepEqual(s1.optedOutMeetings, ["url:zoom:123456789", "key:webinar-abc"]);
  assert.deepEqual(s1.optedOutEventIds, ["calX"]);
  const s2 = recordOptOut(s1, "g1", { meetingUrl: "https://us02web.zoom.us/j/123456789?pwd=zz", sessionKey: "webinar-abc" });
  assert.deepEqual(s2.optedOutMeetings, ["url:zoom:123456789", "key:webinar-abc"], "same meeting seen from a second source: no duplicate");
  assert.equal(s0.optedOutMeetings, undefined);
  assert.deepEqual(validateJoinRuleState(s2), s2);
  assert.equal(meetingIdentity(ZOOM(123456789, "?pwd=a")), "zoom:123456789");
});

test("old documents: no optedOutMeetings key loads, evaluates and round-trips with the shape unchanged, never rewritten on read", () => withDir((dir) => {
  const old = { version: 1, tenantId: "acme", ruleSet: RS, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: ["e1"] } };
  const file = joinRulesFilePath(dir, "acme"); mkdirSync(path.dirname(file), { recursive: true });
  const bytes = JSON.stringify(old, null, 2) + "\n"; writeFileSync(file, bytes);
  const l = loadJoinRules(dir, "acme");
  assert.ok(!("optedOutMeetings" in l.state), "no key invented on load");
  assert.equal(readFileSync(file, "utf8"), bytes, "file untouched by a read");
  assert.deepEqual(readdirSync(path.dirname(file)).filter((f) => f.endsWith(".lock") || f.endsWith(".tmp")), []);
  assert.equal(evaluateJoinRules({ id: "e1", meetingUrl: ZOOM(1234567) }, l.ruleSet, l.state).reason, "meeting-opt-out");
  assert.notEqual(evaluateJoinRules({ id: "e2", meetingUrl: ZOOM(1234567), organizer: "o@x.com" }, l.ruleSet, l.state).action, "join");
  // an id-only opt-out on an old document keeps the key absent (no empty array appears)
  const after = recordTenantOptOut(dir, "acme", "e3");
  assert.ok(!("optedOutMeetings" in after));
  assert.ok(!("optedOutMeetings" in JSON.parse(readFileSync(file, "utf8")).state));
}));

test("strict validation: malformed optedOutMeetings is rejected; an invalid set still honours the opt-out and never joins", () => {
  const base = { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] };
  const bad: unknown[] = ["url:zoom:1", [1], [null], ["zoom:123"], ["url:"], ["key:"], ["url:zoom:"], ["key: x"], ["key:a b"], ["key:null"], ["url:null"],
    ["key:" + "x".repeat(200)], Array.from({ length: MAX_OPTED_OUT_MEETINGS + 1 }, (_, i) => `key:k${i}`), [["key:a"]], { 0: "key:a" }];
  for (const b of bad) assert.throws(() => validateJoinRuleState({ ...base, optedOutMeetings: b }), /optedOutMeetings/, JSON.stringify(b).slice(0, 60));
  assert.throws(() => validateJoinRuleState({ ...base, optedOutMeetings: [] , extra: 1 }));
  assert.deepEqual(validateJoinRuleState({ ...base, optedOutMeetings: ["key:a", "key:a", "url:zoom:5"] }).optedOutMeetings, ["key:a", "url:zoom:5"]);
  // unvalidated bad rule set + a stored identity: skip (narrowing), never join
  const d = evaluateJoinRules({ id: "g1", meetingUrl: ZOOM(555555555) }, { version: 2 } as never, { ...base, optedOutMeetings: ["url:zoom:555555555"] });
  assert.equal(d.reason, "meeting-opt-out");
  assert.equal(evaluateJoinRules({ id: "g1", meetingUrl: ZOOM(666666666) }, { version: 2 } as never, { ...base, optedOutMeetings: ["url:zoom:555555555"] }).action, "needs-approval");
});

test("degenerate identities are never stored and never match", () => {
  for (const hint of [{}, { meetingUrl: "" }, { meetingUrl: "   " }, { meetingUrl: "not a url" }, { meetingUrl: "https://example.com/x" },
    { meetingUrl: null }, { meetingUrl: 5 }, { meetingUrl: ZOOM(1).padEnd(3000, "a") }, { sessionKey: "" }, { sessionKey: "  " }, { sessionKey: "null" },
    { sessionKey: "a b" }, { sessionKey: 7 }, { sessionKey: "x".repeat(300) }]) {
    const s = recordOptOut(EMPTY_JOIN_RULE_STATE, "calX", hint as never);
    assert.equal(s.optedOutMeetings, undefined, JSON.stringify(hint).slice(0, 50));
    assert.deepEqual(s.optedOutEventIds, ["calX"], "the opt-out still stores by id");
  }
  assert.equal(recordOptOut(EMPTY_JOIN_RULE_STATE, "e", undefined).optedOutMeetings, undefined);
  // a hostile/hand-edited raw state with degenerate entries cannot match an item that has no identity / empty id
  const raw = { ...EMPTY_JOIN_RULE_STATE, optedOutMeetings: ["url:", "key:", "", "url:zoom:", "key:null"] };
  const g = it("", { sessionKey: "", meetingUrl: "nope" });
  assert.equal(evaluateJoinRules({ id: "", meetingUrl: "nope" }, RS, raw as never).reason !== "meeting-opt-out", true);
  assert.equal(applyJoinRules(sel([g]), RS, { state: raw as never }).skipped[0]?.reason, "rules-unevaluable", "malformed stored entries fail closed, never as a match");
  for (const e of ["url:", "key:", "url:zoom:", "key:null", "zoom:1", "key:a b", 5, null]) assert.equal(isMeetingEntry(e), false);
  // ISS-T037W1-002: an empty sessionKey must not group or match unrelated meetings
  const s = recordOptOut(EMPTY_JOIN_RULE_STATE, "calX", { sessionKey: "" });
  assert.equal(applyJoinRules(sel([it("a", { sessionKey: "" }), it("b", { sessionKey: "", meetingUrl: ZOOM(2) })]), RS, { state: s }).toSchedule.length, 2);
});

test("cap: at the limit further entries are not stored but the id opt-out still is", () => {
  let s: JoinRuleState = EMPTY_JOIN_RULE_STATE;
  for (let i = 0; i < MAX_OPTED_OUT_MEETINGS + 5; i++) s = recordOptOut(s, `e${i}`, { sessionKey: `k${i}` });
  assert.equal(s.optedOutMeetings!.length, MAX_OPTED_OUT_MEETINGS);
  assert.ok(s.optedOutEventIds.includes(`e${MAX_OPTED_OUT_MEETINGS + 4}`));
  assert.doesNotThrow(() => validateJoinRuleState(s));
});

test("un-opt: only the POST /opt-outs/remove route removes entries (no delete/patch); replacing rules keeps both ids and identities", () => withDir((dir) => {
  const state = recordTenantOptOut(dir, "acme", "calX", {}, { meetingUrl: ZOOM(123456789) });
  saveJoinRules(dir, "acme", { ruleSet: { version: 1, ownDomains: ["x.com"], rules: [] }, state: loadJoinRules(dir, "acme").state });
  assert.deepEqual(loadJoinRules(dir, "acme").state, state);
  const router = readFileSync(new URL("../../../../../apps/api/src/join-rules/router.ts", import.meta.url), "utf8");
  assert.ok(!/router\.(delete|patch)\(/.test(router), "no delete/patch route exists; removal is the one POST route (t037-join-rules-un-opt)");
  assert.equal(recordRuleApproval(state, { kind: "domain", value: "x.com" }).optedOutMeetings?.[0], "url:zoom:123456789", "other state changes keep identities");
}));

test("cross-tenant: tenant B's opt-out identity never affects tenant A", () => withDir((dir) => {
  recordTenantOptOut(dir, "tenant-b", "calX", {}, { meetingUrl: ZOOM(123456789), sessionKey: "webinar-abc" });
  const a = loadJoinRules(dir, "tenant-a"), b = loadJoinRules(dir, "tenant-b");
  assert.equal(applyJoinRules(sel([g1()]), RS, { state: a.state }).toSchedule.length, 1);
  assert.equal(applyJoinRules(sel([g1()]), RS, { state: b.state }).toSchedule.length, 0);
  recordTenantOptOut(dir, "tenant-a", "other", {}, { meetingUrl: ZOOM(999999999) });
  assert.equal(applyJoinRules(sel([g1()]), RS, { state: loadJoinRules(dir, "tenant-a").state }).toSchedule.length, 1);
  assert.deepEqual(loadJoinRules(dir, "tenant-b").state.optedOutMeetings, ["url:zoom:123456789", "key:webinar-abc"]);
  assert.throws(() => loadJoinRules(dir, "../x"), (e: unknown) => e instanceof JoinRulesStoreError && e.code === "bad-tenant");
}));

test("store round-trip under the lock: sequential writes keep every identity, no lock/temp left, a held lock refuses and writes nothing", () => withDir((dir) => {
  for (let i = 0; i < 10; i++) recordTenantOptOut(dir, "acme", `e${i}`, {}, { meetingUrl: ZOOM(100000000 + i), sessionKey: i % 2 ? `webinar-${i}` : undefined });
  const st = loadJoinRules(dir, "acme").state;
  assert.equal(st.optedOutEventIds.length, 10);
  assert.equal(st.optedOutMeetings!.length, 15);
  const dirOf = path.dirname(joinRulesFilePath(dir, "acme"));
  assert.deepEqual(readdirSync(dirOf).filter((f) => f !== "acme.json"), []);
  const before = readFileSync(joinRulesFilePath(dir, "acme"), "utf8");
  writeFileSync(path.join(dirOf, "acme.lock"), JSON.stringify({ token: "x", pid: process.pid, at: Date.now() }));
  assert.throws(() => recordTenantOptOut(dir, "acme", "late", { lockWaitMs: 50 }, { meetingUrl: ZOOM(555555555) }), (e: unknown) => e instanceof JoinRulesStoreError && e.code === "locked");
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), before);
}));

test("property: 3000 seeded cases - result is a subsequence of the input and equals an independent oracle (stored identities, absent records)", () => {
  let seed = 20261012;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const rint = (n: number) => Math.floor(rnd() * n);
  let removed = 0, viaIdentityOnly = 0;
  for (let n = 0; n < 3000; n++) {
    const items: AutoRecordItem[] = [];
    for (let k = 0, c = rint(6); k < c; k++) {
      const kind = rnd();
      const url = kind < 0.7 ? ZOOM(400000000 + rint(4), `?pwd=${rint(3)}`) : kind < 0.85 ? "nonsense" : `https://example.com/p${rint(3)}`;
      items.push(it(`s${k}`, { meetingUrl: url, sessionKey: rnd() < 0.4 ? `webinar-${rint(4)}` : rnd() < 0.1 ? "" : `cal:s${k}` }));
    }
    const idsOpted = Array.from({ length: rint(3) }, () => (rnd() < 0.5 ? `ghost${rint(3)}` : `s${rint(6)}`));
    const meetings: string[] = [];
    for (let k = 0, c = rint(3); k < c; k++) meetings.push(rnd() < 0.5 ? `url:zoom:${400000000 + rint(5)}` : rnd() < 0.5 ? `key:webinar-${rint(5)}` : ["", "key:", "url:", "key:null"][rint(4)]!);
    const state = { ...EMPTY_JOIN_RULE_STATE, optedOutEventIds: idsOpted, ...(meetings.length || rnd() < 0.5 ? { optedOutMeetings: meetings } : {}) } as JoinRuleState;
    // Oracle: written from the spec, not from the implementation. Siblings by shared non-empty sessionKey or zoom id (all items scheduled here).
    const zid = (u: string) => /^https:\/\/zoom\.us\/j\/(\d+)/.exec(u)?.[1];
    // url entries match the item's OWN url only; ids and key entries act as ids and so spread to siblings of the same meeting.
    const idHit = (i: AutoRecordItem) => [i.sourceId, i.sessionKey].some((v) => v !== "" && (idsOpted.includes(v) || meetings.includes(`key:${v}`)));
    const urlHit = (i: AutoRecordItem) => zid(i.meetingUrl) !== undefined && meetings.includes(`url:zoom:${zid(i.meetingUrl)}`);
    const comp = items.map((_, x) => x);
    for (let ch = true; ch;) { ch = false; for (let x = 0; x < items.length; x++) for (let y = 0; y < items.length; y++) {
      const a = items[x]!, b = items[y]!;
      const linked = (a.sessionKey !== "" && a.sessionKey === b.sessionKey) || (zid(a.meetingUrl) !== undefined && zid(a.meetingUrl) === zid(b.meetingUrl));
      if (linked && comp[x] !== comp[y]) { const hi = Math.max(comp[x]!, comp[y]!), lo = Math.min(comp[x]!, comp[y]!); for (let z = 0; z < comp.length; z++) if (comp[z] === hi) comp[z] = lo; ch = true; }
    } }
    const hot = new Set(items.flatMap((i, x) => (idHit(i) ? [comp[x]!] : [])));
    const malformed = meetings.some((m) => !/^(url|key):[^\s]+$/.test(m) || m.endsWith(":null")); // oracle: a malformed stored entry makes the state invalid -> fail closed, all vetoed
    const expected = items.filter((_, x) => malformed || hot.has(comp[x]!) || urlHit(items[x]!)).map((i) => i.sourceId);
    const input = sel(items);
    const out = applyJoinRules(input, RS, { state });
    const gone = items.filter((i) => !out.toSchedule.includes(i)).map((i) => i.sourceId);
    assert.deepEqual(gone, expected, `case ${n} ${JSON.stringify({ state, items: items.map((i) => [i.sourceId, i.sessionKey, i.meetingUrl]) })}`);
    let j = 0; for (const i of out.toSchedule) { while (j < items.length && items[j] !== i) j++; assert.ok(j < items.length, "not a subsequence"); j++; }
    assert.equal(out.skipped.length, gone.length);
    if (gone.length === 0) assert.equal(out, input);
    removed += gone.length;
    viaIdentityOnly += items.filter((i) => gone.includes(i.sourceId) && !idsOpted.includes(i.sourceId) && !idsOpted.includes(i.sessionKey)).length;
  }
  console.log(`property: 3000 cases, removed ${removed}, of which via stored identity/sibling only ${viaIdentityOnly}`);
  assert.ok(removed > 500 && viaIdentityOnly > 150, `too weak: ${removed}/${viaIdentityOnly}`);
});

// ISS-T037OPT-005 pins. Each kills one surviving mutant of the cycle-0 checker run: M2 (prefix match) and M6 (key:/url: interchangeable).
const stateWith = (...optedOutMeetings: string[]): JoinRuleState => ({ ...EMPTY_JOIN_RULE_STATE, optedOutMeetings });
const kept = (state: JoinRuleState, ...items: AutoRecordItem[]) => ids(applyJoinRules(sel(items), RS, { state }));

test("pin ISS-T037OPT-005 (M2, exact match): a stored url:/key: entry never vetoes an identity that merely starts with, contains or is contained in it", () => {
  // stored url:zoom:12345678 vs longer / shorter / embedded ids
  assert.deepEqual(kept(stateWith("url:zoom:12345678"), it("a", { meetingUrl: ZOOM(123456789) }), it("b", { meetingUrl: ZOOM(912345678) })), ["a", "b"], "url prefix / contained");
  assert.deepEqual(kept(stateWith("url:zoom:123456789"), it("a", { meetingUrl: ZOOM(12345678) }), it("b", { meetingUrl: ZOOM(1234567890) })), ["a", "b"], "url longer stored");
  assert.deepEqual(kept(stateWith("url:zoom:123456789"), it("a", { meetingUrl: ZOOM(123456789) })), [], "control: the exact identity IS vetoed");
  // stored key:webinar vs sessionKey / id that start with it or contain it, and the reverse
  assert.deepEqual(kept(stateWith("key:webinar"), it("a", { sessionKey: "webinar-2" }), it("b", { sessionKey: "my-webinar" }), it("webinar2", { meetingUrl: ZOOM(2) })), ["a", "b", "webinar2"], "key prefix / contained");
  assert.deepEqual(kept(stateWith("key:webinar-2"), it("a", { sessionKey: "webinar" })), ["a"], "key shorter item");
  assert.deepEqual(kept(stateWith("key:webinar"), it("a", { sessionKey: "webinar" })), [], "control: the exact key IS vetoed");
  // the evaluator (the single matcher) agrees on a raw state
  assert.notEqual(evaluateJoinRules({ id: "webinar-2", meetingUrl: ZOOM(5) }, RS, stateWith("key:webinar")).reason, "meeting-opt-out");
  assert.notEqual(evaluateJoinRules({ id: "x", meetingUrl: ZOOM(123456789) }, RS, stateWith("url:zoom:12345678")).reason, "meeting-opt-out");
});

test("pin ISS-T037OPT-005 (M6, tag separation): key:X never matches a URL identity X, and url:X never matches a sessionKey/id X", () => {
  // stored key:zoom:123456789 must not veto an item whose URL identity is zoom:123456789
  assert.deepEqual(kept(stateWith("key:zoom:123456789"), it("a", { meetingUrl: ZOOM(123456789) })), ["a"]);
  // stored url:zoom:123456789 must not veto an item whose sessionKey / id is the literal "zoom:123456789"
  assert.deepEqual(kept(stateWith("url:zoom:123456789"), it("a", { sessionKey: "zoom:123456789", meetingUrl: ZOOM(2) }), it("zoom:123456789", { meetingUrl: ZOOM(3) })), ["a", "zoom:123456789"]);
  assert.notEqual(evaluateJoinRules({ id: "zoom:123456789", meetingUrl: ZOOM(4) }, RS, stateWith("url:zoom:123456789")).reason, "meeting-opt-out");
  assert.notEqual(evaluateJoinRules({ id: "e", meetingUrl: ZOOM(123456789) }, RS, stateWith("key:zoom:123456789")).reason, "meeting-opt-out");
  // controls: each tag matches its own side
  assert.deepEqual(kept(stateWith("key:zoom:123456789"), it("a", { sessionKey: "zoom:123456789", meetingUrl: ZOOM(2) })), []);
  assert.deepEqual(kept(stateWith("url:zoom:123456789"), it("a", { meetingUrl: ZOOM(123456789) })), []);
});
