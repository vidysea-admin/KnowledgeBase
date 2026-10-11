/**
 * packages/meeting-bot/src/calendar/join-rules-optout-meeting.test.ts — unit `t037-optout-meeting-identity-store`
 * (ISS-T037W1-001). D-015: the recorded reproduction in qa/issues.t037w1.jsonl is replayed verbatim; count printed by id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem } from "@lkb/core";
import { selectAutoRecordItems } from "./auto-join.js";
import { applyJoinRules } from "./join-rules-select.js";
import {
  EMPTY_JOIN_RULE_STATE, evaluateJoinRules, recordOptOut, recordRuleApproval, validateJoinRuleState,
  type JoinRuleSet, type JoinRuleState,
} from "./join-rules.js";
import { MAX_OPTED_OUT_MEETINGS, isMeetingEntry } from "./join-rules-optout.js";
import { loadJoinRules, saveJoinRules, recordTenantOptOut, joinRulesFilePath, JoinRulesStoreError } from "./join-rules-store.js";
import { meetingIdentity } from "../send-now.js";

const RS: JoinRuleSet = { version: 1, ownDomains: [], rules: [] };
const ZOOM = (n: number, q = "") => `https://zoom.us/j/${n}${q}`;
const sel = (toSchedule: AutoRecordItem[], skipped: SkippedItem[] = []): SelectAutoRecordItemsResult => ({ toSchedule, skipped });
const it = (sourceId: string, over: Partial<AutoRecordItem> = {}): AutoRecordItem => ({ sessionKey: `cal:${sourceId}`, source: "calendar", sourceId,
  title: `T ${sourceId}`, startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z", meetingUrl: ZOOM(123456789), sender: "a@x.com", ...over });
const g1 = (): AutoRecordItem => it("g1", { source: "gmail", sessionKey: "gmail:g1", meetingUrl: ZOOM(123456789, "?pwd=zz") });
const ids = (r: SelectAutoRecordItemsResult) => r.toSchedule.map((i) => i.sourceId);
const optOutX = (url: string | undefined = ZOOM(123456789, "?pwd=a"), key?: string): JoinRuleState =>
  recordOptOut(EMPTY_JOIN_RULE_STATE, "calX", { meetingUrl: url, sessionKey: key });
const withDir = (fn: (dir: string) => void) => { const d = mkdtempSync(path.join(tmpdir(), "optout-meeting-")); try { fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };

test("D-015 ISS-T037W1-001 replay: recorded scenario, opt-out of calX stores the meeting, g1 alone is vetoed", () => {
  const row = readFileSync(new URL("../../../../qa/issues.t037w1.jsonl", import.meta.url), "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
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

test("un-opt: the API has no un-opt operation, so identities share the id's lifecycle; replacing rules keeps both", () => withDir((dir) => {
  const state = recordTenantOptOut(dir, "acme", "calX", {}, { meetingUrl: ZOOM(123456789) });
  saveJoinRules(dir, "acme", { ruleSet: { version: 1, ownDomains: ["x.com"], rules: [] }, state: loadJoinRules(dir, "acme").state });
  assert.deepEqual(loadJoinRules(dir, "acme").state, state);
  const router = readFileSync(new URL("../../../../apps/api/src/join-rules/router.ts", import.meta.url), "utf8");
  assert.ok(!/router\.(delete|patch)\(/.test(router), "no delete/patch route exists; if one is added it must remove the identity too");
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
