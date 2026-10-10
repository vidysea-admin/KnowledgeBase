import { test } from "node:test";
import assert from "node:assert/strict";
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem } from "@lkb/core";
import { applyJoinRules, type JoinRuleEvaluator } from "./join-rules-select.js";
import { EMPTY_JOIN_RULE_STATE, type JoinRule, type JoinRuleSet, type JoinRuleState } from "./join-rules.js";

const MEET = "https://meet.google.com/abc-defg-hij";
const item = (n: number, sender?: string): AutoRecordItem => ({ sessionKey: `cal:e${n}`, source: "calendar", sourceId: `e${n}`,
  title: `Webinar ${n}`, startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z", meetingUrl: MEET, sender });
const sk = (n: number): SkippedItem => ({ sessionKey: `cal:s${n}`, source: "calendar", sourceId: `s${n}`, title: `S${n}`, reason: "past" });
const sel = (toSchedule: AutoRecordItem[], skipped: SkippedItem[] = []): SelectAutoRecordItemsResult => ({ toSchedule, skipped });
const rs = (rules: JoinRule[] = []): JoinRuleSet => ({ version: 1, ownDomains: [], rules });
const deny = (id: string, email: string): JoinRule => ({ id, effect: "deny", match: { email } });
const allow = (id: string, email: string): JoinRule => ({ id, effect: "allow", match: { email } });
const st = (over: Partial<JoinRuleState> = {}): JoinRuleState => ({ ...EMPTY_JOIN_RULE_STATE, ...over });
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.values(v)) freeze(k); } return v; };
const keys = (r: SelectAutoRecordItemsResult) => r.toSchedule.map((i) => i.sessionKey);

test("rules undefined: identity (same reference), with or without context", () => {
  const s = freeze(sel([item(1, "a@x.com")], [sk(1)]));
  assert.equal(applyJoinRules(s, undefined), s);
  assert.equal(applyJoinRules(s, undefined, { state: st({ optedOutEventIds: ["e1"] }) }), s);
});

test("deny rule removes exactly the matching item, original order kept", () => {
  const s = freeze(sel([item(1, "a@x.com"), item(2, "bad@x.com"), item(3, "c@x.com")], [sk(1)]));
  const r = applyJoinRules(s, freeze(rs([deny("d1", "bad@x.com")])));
  assert.deepEqual(keys(r), ["cal:e1", "cal:e3"]);
  assert.equal(r.skipped.length, 2);
  assert.deepEqual(r.skipped[0], sk(1));
  assert.equal(r.skipped[1]!.sessionKey, "cal:e2");
  assert.equal(r.skipped[1]!.reason, "untrusted-sender");
  assert.match(r.skipped[1]!.detail!, /deny-rule \(rule d1\)/);
  assert.ok(!r.skipped[1]!.detail!.includes("meet.google.com"));
});

test("opt-out removes that event only (by source id or session key)", () => {
  const s = freeze(sel([item(1, "a@x.com"), item(2, "a@x.com")]));
  const r = applyJoinRules(s, freeze(rs()), freeze({ state: st({ optedOutEventIds: ["e2"] }) }));
  assert.deepEqual(keys(r), ["cal:e1"]);
  assert.match(r.skipped[0]!.detail!, /meeting-opt-out/);
  const r2 = applyJoinRules(s, rs(), { state: st({ optedOutEventIds: ["cal:e1"] }) });
  assert.deepEqual(keys(r2), ["cal:e2"]);
});

test("opt-out is honoured even when the rule set is invalid", () => {
  const r = applyJoinRules(sel([item(1, "a@x.com")]), { version: 2 } as unknown as JoinRuleSet, { state: st({ optedOutEventIds: ["e1"] }) });
  assert.deepEqual(keys(r), []);
  assert.match(r.skipped[0]!.detail!, /meeting-opt-out/);
});

test("no matching rule leaves the item scheduled (does not decide ISS-376)", () => {
  const s = sel([item(1, "a@x.com"), item(2)]);
  const r = applyJoinRules(s, rs([deny("d", "other@x.com"), allow("a", "zzz@x.com")]));
  assert.equal(r, s);
  assert.deepEqual(keys(r), ["cal:e1", "cal:e2"]);
});

test("allow rule and approval never resurrect a skipped item or add one", () => {
  const s = freeze(sel([item(1, "a@x.com")], [sk(1), { ...sk(2), reason: "untrusted-sender" }]));
  const r = applyJoinRules(s, rs([allow("a", "a@x.com")]), { state: st({ approvedSenders: ["a@x.com"], approvedDomains: ["x.com"] }) });
  assert.deepEqual(r, s);
  assert.deepEqual(keys(r), ["cal:e1"]);
});

test("malformed rule set or state: items skipped with could-not-evaluate detail, never throws", () => {
  const s = freeze(sel([item(1, "a@x.com"), item(2, "b@x.com")], [sk(1)]));
  const bad: unknown[] = [null, 5, "x", { version: 1, ownDomains: [], rules: [{ id: "r", effect: "maybe", match: { email: "a@x.com" } }] }, { version: 1 }];
  for (const b of bad) {
    const r = applyJoinRules(s, b as JoinRuleSet);
    assert.deepEqual(keys(r), [], JSON.stringify(b));
    assert.equal(r.skipped.length, 3);
    assert.match(r.skipped[1]!.detail!, /could not be evaluated/);
  }
  const r = applyJoinRules(s, rs(), { state: { approvedSenders: "nope" } as unknown as JoinRuleState });
  assert.deepEqual(keys(r), []);
  assert.match(r.skipped[1]!.detail!, /could not be evaluated/);
});

test("throwing evaluator (injected seam) skips only that item, fail closed", () => {
  const boom: JoinRuleEvaluator = (e) => { if (e.id === "e2") throw new Error("boom"); return { action: "join", reason: "allow-rule", ruleId: "x" }; };
  const r = applyJoinRules(freeze(sel([item(1), item(2), item(3)])), rs(), {}, boom);
  assert.deepEqual(keys(r), ["cal:e1", "cal:e3"]);
  assert.match(r.skipped[0]!.detail!, /could not be evaluated/);
});

test("engine decision table through a fake evaluator", () => {
  const mk = (action: "join" | "skip" | "needs-approval", reason: string): JoinRuleEvaluator =>
    () => ({ action, reason: reason as never, ruleId: "r" });
  const cases: Array<[string, string, boolean, string?]> = [
    ["skip", "deny-rule", false, "untrusted-sender"], ["skip", "meeting-opt-out", false, "untrusted-sender"],
    ["skip", "cancelled", false, "cancelled"], ["skip", "no-meeting-url", false, "no-join-link"],
    ["needs-approval", "no-matching-rule", true], ["needs-approval", "sender-unverifiable", true],
    ["needs-approval", "invalid-rule-set", false, "untrusted-sender"],
    ["join", "allow-rule", true], ["join", "approved-sender", true], ["join", "approved-domain", true],
  ];
  for (const [action, reason, stays, skipReason] of cases) {
    const r = applyJoinRules(sel([item(1)]), rs(), {}, mk(action as "join", reason));
    assert.equal(r.toSchedule.length === 1, stays, `${action}/${reason}`);
    if (!stays) assert.equal(r.skipped[0]!.reason, skipReason, `${action}/${reason}`);
  }
});

test("two tenants: independent results from the same selection; no shared state", () => {
  const s = freeze(sel([item(1, "a@x.com"), item(2, "b@x.com")]));
  const t1 = applyJoinRules(s, rs([deny("d", "a@x.com")]));
  const t2 = applyJoinRules(s, rs([deny("d", "b@x.com")]));
  assert.deepEqual(keys(t1), ["cal:e2"]);
  assert.deepEqual(keys(t2), ["cal:e1"]);
  assert.deepEqual(keys(applyJoinRules(s, rs([deny("d", "a@x.com")]))), ["cal:e2"]);
});

test("property: 3000 seeded random cases keep the subset property", () => {
  let seed = 20261010;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;
  const senders = ["a@x.com", "b@y.org", "c@z.io", undefined];
  let removedTotal = 0;
  for (let n = 0; n < 3000; n++) {
    const toSchedule = Array.from({ length: Math.floor(rnd() * 7) }, (_, i) => item(i, pick(senders)));
    const skipped = Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => sk(i));
    const rules: JoinRule[] = Array.from({ length: Math.floor(rnd() * 4) }, (_, i) =>
      (rnd() < 0.5 ? deny : allow)(`r${i}`, pick(["a@x.com", "b@y.org", "c@z.io"])));
    const mode = rnd();
    const ruleSet: JoinRuleSet | undefined = mode < 0.1 ? undefined : mode < 0.2 ? ({ version: 9 } as unknown as JoinRuleSet) : rs(rules);
    const state = st({ optedOutEventIds: rnd() < 0.3 ? [`e${Math.floor(rnd() * 7)}`] : [], approvedSenders: rnd() < 0.3 ? ["a@x.com"] : [] });
    const input = freeze(sel(toSchedule, skipped));
    const out = applyJoinRules(input, ruleSet ? freeze(ruleSet) : ruleSet, freeze({ state }));
    let j = 0;
    for (const i of out.toSchedule) { while (j < toSchedule.length && toSchedule[j] !== i) j++; assert.ok(j < toSchedule.length, "not a subsequence"); j++; }
    const removed = toSchedule.length - out.toSchedule.length;
    removedTotal += removed;
    assert.equal(out.skipped.length, skipped.length + removed);
    assert.deepEqual(out.skipped.slice(0, skipped.length), skipped);
    assert.equal(new Set(out.toSchedule).size, out.toSchedule.length);
    const removedKeys = out.skipped.slice(skipped.length).map((x) => x.sessionKey).sort();
    assert.deepEqual(removedKeys, toSchedule.filter((i) => !out.toSchedule.includes(i)).map((i) => i.sessionKey).sort());
    if (ruleSet === undefined) assert.equal(out, input);
  }
  assert.ok(removedTotal > 500, `property run removed too little to be meaningful: ${removedTotal}`);
});
