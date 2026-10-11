/**
 * packages/meeting-bot/src/calendar/join-rules-enforce.test.ts — T-037 unit `t037-scheduler-wiring-behind-flag`.
 * The wired tick (runScheduleTickOnce -> enforceJoinRules -> applyJoinRules) against the REAL join-rules store in a temp root.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CalendarEvent, SelectAutoRecordItemsResult } from "@lkb/core";

import { loadTrustedSenderConfig, redactJoinLink, selectAutoRecordItems, type AutoRecordCandidateInput } from "./auto-join.js";
import { enforceJoinRules, parseJoinRulesEnforce, type JoinRulesEnforceIo } from "./join-rules-enforce.js";
import { JoinRulesStoreError, joinRulesFilePath, recordTenantOptOut, saveJoinRules, type StoredJoinRules } from "./join-rules-store.js";
import { evaluateJoinRules, type JoinRuleSet } from "./join-rules.js";
import { readScheduledKeys } from "./schedule-state.js";
import { runScheduleTickOnce, type ScheduleTickDeps } from "./schedule-tick.js";
import { describeSkip } from "./skip-describe.js";
import type { TaskScheduler, ScheduleOnceOptions } from "./task-scheduler.js";

const NOW = "2026-10-10T09:56:00Z";
const START = "2026-10-10T10:00:00Z", END = "2026-10-10T11:00:00Z";
const ZOOM = "https://zoom.us/j/123456789?pwd=a";
const A = "ten-a", B = "ten-b";
const EMPTY: JoinRuleSet = { version: 1, ownDomains: [], rules: [] };

const cand = (id: string, o: Partial<AutoRecordCandidateInput> = {}): AutoRecordCandidateInput => ({
  id, title: `Webinar: ${id}`, senderEmail: "o@x.com", senderDomain: "x.com", senderAuthenticated: true, status: "approved",
  meetingUrl: ZOOM, startTime: START, endTime: END, kind: "upcoming", ...o,
});
const g2 = () => cand("g2", { meetingUrl: "https://meet.google.com/abc-defg-hij", startTime: "2026-10-10T09:57:00Z", endTime: "2026-10-10T09:58:30Z" });
const calX: CalendarEvent = { id: "calX", title: "Weekly sync", organizer: "o@x.com", meetingUrl: ZOOM, startTime: START, endTime: END };

async function withRoot(fn: (root: string) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-enforce-"));
  try { await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function fakeScheduler() {
  const calls: ScheduleOnceOptions[] = [];
  const scheduler: TaskScheduler = { scheduleOnce: async (o) => { calls.push(o); } };
  return { scheduler, calls };
}
function deps(root: string, o: Partial<ScheduleTickDeps> & { logs?: string[] } = {}): ScheduleTickDeps {
  const { logs, ...rest } = o;
  return { loadCalendarEvents: async () => [], loadCandidates: async () => [cand("g1")], now: () => NOW, stateDir: root,
    scheduler: fakeScheduler().scheduler, log: (m) => { logs?.push(m); }, everyWebinar: true, joinRulesTenantId: A, ...rest };
}
const save = (root: string, tenant: string, ruleSet: JoinRuleSet, state: Partial<StoredJoinRules["state"]> = {}) =>
  saveJoinRules(root, tenant, { ruleSet, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [], ...state } });
const writeRaw = (root: string, tenant: string, body: unknown) => {
  const file = joinRulesFilePath(root, tenant); mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
};
const ids = (r: SelectAutoRecordItemsResult) => r.toSchedule.map((i) => i.sourceId);
const warns = (logs: string[]) => logs.filter((l) => l.includes("JOIN RULES WARNING"));
const MODES = ["fail-closed", "fail-open"] as const;

// ---------- DEFAULT PARITY ----------
const NOT_ENABLING: unknown[] = [undefined, "off", "", "OFF", "garbage", "true", "1", 1, true, null, " fail-closed", "Fail-Open", "fail-closed ", {}];
const SILENT: unknown[] = NOT_ENABLING.filter((v) => typeof v !== "string" || v === "" || v === "off"); // unrecognised NON-EMPTY strings now warn (ISS-T037WIRE-002): see join-rules-enforce-preconditions.test.ts

test("parse: only the exact strings fail-closed / fail-open enable enforcement", () => {
  for (const v of NOT_ENABLING) assert.equal(parseJoinRulesEnforce(v), "off", String(v));
  assert.equal(parseJoinRulesEnforce("fail-closed"), "fail-closed");
  assert.equal(parseJoinRulesEnforce("fail-open"), "fail-open");
});

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const URLS = [ZOOM, "https://zoom.us/j/555000111", "https://meet.google.com/abc-defg-hij", "https://zoho.com/meeting/abc?tk=SECRET", undefined, "http://evil.example/x", "https://teams.microsoft.com/l/meetup-join/19%3a1"];
const STAT = ["pending", "approved", "rejected", "auto_approved"] as const;
function genInputs(seed: number) {
  const r = rng(seed), pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString();
  const candidates = Array.from({ length: Math.floor(r() * 6) }, (_, i) => {
    const s = Math.floor(r() * 80) - 20;
    return cand(`g${i}`, { status: pick(STAT), meetingUrl: pick(URLS), startTime: at(s), endTime: at(s + 60), senderEmail: pick(["o@x.com", "bad@x.com", "q@y.org"]),
      senderAuthenticated: r() < 0.5, title: pick(["Webinar: A", "Weekly sync", "Seminar B"]) });
  });
  const calendarEvents: CalendarEvent[] = Array.from({ length: Math.floor(r() * 4) }, (_, i) => {
    const s = Math.floor(r() * 80) - 20;
    return { id: `c${i}`, title: pick(["Webinar: A", "Standup"]), organizer: pick(["o@x.com", "bad@x.com"]), meetingUrl: pick(URLS), startTime: at(s), endTime: at(s + 60), cancelled: r() < 0.1 };
  });
  return { candidates, calendarEvents, everyWebinar: r() < 0.5 };
}
const reference = (i: ReturnType<typeof genInputs>, root: string) => selectAutoRecordItems({ calendarEvents: i.calendarEvents, candidates: i.candidates, now: NOW,
  leadMinutes: 5, trustedSenders: loadTrustedSenderConfig(), alreadyScheduled: readScheduledKeys(root), everyWebinar: i.everyWebinar });
const expectedLogs = (i: ReturnType<typeof genInputs>, ref: SelectAutoRecordItemsResult) => [
  `schedule-tick: ${ref.toSchedule.length} to schedule, ${ref.skipped.length} skipped (${i.calendarEvents.length} calendar event(s), ${i.candidates.length} candidate(s), now=${NOW})`,
  ...ref.toSchedule.map((x) => `  schedule — ${x.source}:${x.sourceId} "${x.title}" ${x.startTime} -> ${x.endTime} join: ${redactJoinLink(x.meetingUrl)}`),
  ...ref.skipped.map(describeSkip), "schedule-tick: --dry-run — nothing scheduled, nothing written to state",
];

test("DEFAULT PARITY: every non-enabling value gives the un-wired tick's exact output over 200 seeded selections; the store is never opened", async () => {
  await withRoot(async (root) => {
    let opened = 0, evaluated = 0;
    const io: JoinRulesEnforceIo = { load: () => { opened++; throw new Error("store opened"); }, evaluate: () => { evaluated++; throw new Error("evaluated"); } };
    let compared = 0, scheduledTotal = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const inp = genInputs(seed), ref = reference(inp, root), want = expectedLogs(inp, ref);
      scheduledTotal += ref.toSchedule.length;
      for (const v of SILENT) {
        const logs: string[] = [];
        const out = await runScheduleTickOnce(deps(root, { loadCalendarEvents: async () => inp.calendarEvents, loadCandidates: async () => inp.candidates,
          everyWebinar: inp.everyWebinar, joinRulesEnforce: v, joinRulesIo: io, logs }), true);
        assert.deepEqual(out, ref, `seed ${seed} value ${String(v)}`);
        assert.deepEqual(logs, want, `seed ${seed} value ${String(v)} logs`);
        compared++;
      }
    }
    assert.equal(opened, 0, "store opened under a non-enabling value");
    assert.equal(evaluated, 0);
    assert.equal(existsSync(path.join(root, "join-rules")), false, "no join-rules directory touched");
    assert.ok(scheduledTotal >= 20, `seeds exercised real schedules (${scheduledTotal})`);
    assert.equal(compared, 200 * SILENT.length);
  });
});

test("DEFAULT PARITY (real run): scheduler calls, persisted dedup state and logs identical for absent vs every non-enabling value", async () => {
  const run = async (v: unknown) => withRootResult(async (root) => {
    const { scheduler, calls } = fakeScheduler(); const logs: string[] = [];
    save(root, A, EMPTY, { optedOutEventIds: ["g1"] }); // a rules file that WOULD remove g1 if it were read
    const out = await runScheduleTickOnce(deps(root, { scheduler, logs, joinRulesEnforce: v }), false);
    return { out, calls, logs, keys: [...readScheduledKeys(root)] };
  });
  const base = await run(undefined);
  assert.equal(base.out.toSchedule.length, 1, "un-wired tick still schedules the opted-out item");
  for (const v of SILENT) assert.deepEqual(await run(v), base, String(v));
});
async function withRootResult<T>(fn: (root: string) => Promise<T>): Promise<T> {
  let out!: T; await withRoot(async (r) => { out = await fn(r); }); return out;
}

// ---------- ENFORCING ----------
test("opt-out by event id removes the item with reason opted-out, in both policies", async () => {
  for (const mode of MODES) await withRoot(async (root) => {
    save(root, A, EMPTY, { optedOutEventIds: ["g1"] }); const logs: string[] = [];
    const out = await runScheduleTickOnce(deps(root, { loadCandidates: async () => [cand("g1"), g2()], joinRulesEnforce: mode, logs }), true);
    assert.deepEqual(ids(out), ["g2"]);
    assert.equal(out.skipped.find((s) => s.sourceId === "g1")!.reason, "opted-out");
    assert.ok(logs.some((l) => l.includes("skip [opted-out]") && l.includes("the bot will not join it")));
    assert.equal(warns(logs).length, 0);
  });
});

test("ISS-T037VETO-002 recorded repro through the real tick: calendar calX opted out, gmail g1 is the surviving copy", async () => {
  let removed = 0, n = 0;
  for (const mode of MODES) await withRoot(async (root) => {
    save(root, A, EMPTY, { optedOutEventIds: ["calX"] });
    const out = await runScheduleTickOnce(deps(root, { loadCalendarEvents: async () => [calX], joinRulesEnforce: mode }), true);
    n++; if (!ids(out).includes("g1") && out.skipped.some((s) => s.sourceId === "g1" && s.reason === "opted-out")) removed++;
  });
  assert.equal(`${removed}/${n}`, "2/2");
});

test("ISS-T037W1-001 recorded scenario end to end: calX opted out, Calendar returns nothing, gmail g1 alone", async () => {
  const tally = { idOnlyRefused: 0, idOnly: 0, urlRefused: 0, urlN: 0, keyRefused: 0, keyN: 0 };
  for (const mode of MODES) {
    await withRoot(async (root) => { // verbatim recorded state: id only. Known, named, still open (W7 gates (b)/id-only gap)
      save(root, A, EMPTY, { optedOutEventIds: ["calX"] });
      const out = await runScheduleTickOnce(deps(root, { joinRulesEnforce: mode }), true);
      tally.idOnly++; if (!ids(out).includes("g1")) tally.idOnlyRefused++;
    });
    await withRoot(async (root) => { // opt-out recorded WITH the meeting URL hint (what ISS-T037OPT-004's adapter persists)
      save(root, A, EMPTY); recordTenantOptOut(root, A, "calX", {}, { meetingUrl: ZOOM });
      const out = await runScheduleTickOnce(deps(root, { joinRulesEnforce: mode }), true);
      tally.urlN++; if (!ids(out).includes("g1") && out.skipped[0]?.reason === "opted-out") tally.urlRefused++;
    });
    await withRoot(async (root) => { // opt-out recorded with sessionKey hint
      const key = (await runScheduleTickOnce(deps(root), true)).toSchedule[0]!.sessionKey; // the real collapsed webinar key
      save(root, A, EMPTY); recordTenantOptOut(root, A, "calX", {}, { sessionKey: key });
      const out = await runScheduleTickOnce(deps(root, { joinRulesEnforce: mode }), true);
      tally.keyN++; if (!ids(out).includes("g1")) tally.keyRefused++;
    });
  }
  console.log(`D-015 ISS-T037W1-001 via real tick: id-only (verbatim) ${tally.idOnlyRefused}/${tally.idOnly} refused; with url hint ${tally.urlRefused}/${tally.urlN}; with sessionKey hint ${tally.keyRefused}/${tally.keyN}`);
  assert.equal(tally.idOnlyRefused, 0, "id-only opt-out still cannot follow an absent sibling (W7); asserted so a change is noticed");
  assert.equal(tally.urlRefused, tally.urlN); assert.equal(tally.keyRefused, tally.keyN);
});

test("deny rule removes with reason rule-denied; approvals add nothing", async () => {
  for (const mode of MODES) await withRoot(async (root) => {
    save(root, A, { version: 1, ownDomains: [], rules: [{ id: "d1", effect: "deny", match: { email: "bad@x.com" } }] }, { approvedSenders: ["o@x.com"], approvedDomains: ["x.com"] });
    const c = [cand("g1", { senderEmail: "bad@x.com" }), g2(), cand("g3", { status: "rejected", meetingUrl: "https://zoom.us/j/999" })];
    const out = await runScheduleTickOnce(deps(root, { loadCandidates: async () => c, joinRulesEnforce: mode }), true);
    assert.deepEqual(ids(out), ["g2"]);
    assert.equal(out.skipped.find((s) => s.sourceId === "g1")!.reason, "rule-denied");
    assert.equal(out.skipped.find((s) => s.sourceId === "g3")!.reason, "untrusted-sender", "rejected stays skipped for its own reason");
  });
});

test("no rules file (first run) means no rules: nothing removed, no warning, nothing created", async () => {
  for (const mode of MODES) await withRoot(async (root) => {
    const logs: string[] = [];
    const out = await runScheduleTickOnce(deps(root, { joinRulesEnforce: mode, logs }), true);
    assert.deepEqual(ids(out), ["g1"]); assert.equal(warns(logs).length, 0);
    assert.equal(existsSync(joinRulesFilePath(root, A)), false);
  });
});

test("invalid rules file: fail-closed skips ALL of the tenant's items (rules-unevaluable) with ONE loud log carrying the validation message", async () => {
  await withRoot(async (root) => {
    writeRaw(root, A, { version: 1, tenantId: A, ruleSet: { version: 2, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });
    const logs: string[] = [];
    const out = await runScheduleTickOnce(deps(root, { loadCandidates: async () => [cand("g1"), g2()], joinRulesEnforce: "fail-closed", logs }), true);
    assert.deepEqual(ids(out), []);
    assert.deepEqual(out.skipped.map((s) => s.reason), ["rules-unevaluable", "rules-unevaluable"]);
    assert.equal(warns(logs).length, 1);
    assert.match(warns(logs)[0]!, /invalid/); assert.match(warns(logs)[0]!, /2 meeting\(s\) NOT scheduled/);
    assert.ok(logs.some((l) => l.includes("skip [rules-unevaluable]") && l.includes("failing closed")));
    assert.ok(!logs.join("\n").includes(root), "no path in any log line");
  });
});

test("invalid rules file: fail-open leaves the selection exactly as today's with ONE loud warning", async () => {
  await withRoot(async (root) => {
    writeRaw(root, A, "{ not json"); const logs: string[] = [];
    const base = reference({ candidates: [cand("g1")], calendarEvents: [], everyWebinar: true }, root);
    const out = await runScheduleTickOnce(deps(root, { joinRulesEnforce: "fail-open", logs }), true);
    assert.deepEqual(out, base); assert.equal(warns(logs).length, 1);
    assert.match(warns(logs)[0]!, /rules NOT applied, selection unchanged/);
  });
});

test("a log never carries a path, or another tenant's name (tenant-mismatch / not-a-file report only the code)", async () => {
  for (const mode of MODES) await withRoot(async (root) => {
    writeRaw(root, A, { version: 1, tenantId: "someone-else-secret", ruleSet: EMPTY, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });
    const logs: string[] = []; await runScheduleTickOnce(deps(root, { joinRulesEnforce: mode, logs }), true);
    const text = logs.join("\n");
    assert.ok(!text.includes("someone-else-secret") && !text.includes(root));
    assert.match(warns(logs)[0]!, /tenant-mismatch/);
  });
});

test("locked then readable: retried, then enforced; permanently locked is unevaluable (never 'no rules')", async () => {
  const stored: StoredJoinRules = { ruleSet: EMPTY, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: ["g1"] } };
  const lock = () => new JoinRulesStoreError("locked", "busy");
  for (const mode of MODES) {
    let calls = 0; const waits: number[] = [];
    const io: JoinRulesEnforceIo = { load: () => { if (calls++ === 0) throw lock(); return stored; }, wait: async (ms) => { waits.push(ms); } };
    const out = await runScheduleTickOnce(deps("x", { joinRulesEnforce: mode, joinRulesIo: io }), true);
    assert.deepEqual(ids(out), []); assert.equal(calls, 2); assert.deepEqual(waits, [150]);
  }
  for (const [mode, expectIds] of [["fail-closed", []], ["fail-open", ["g1"]]] as const) {
    let calls = 0; const waits: number[] = []; const logs: string[] = [];
    const io: JoinRulesEnforceIo = { load: () => { calls++; throw lock(); }, wait: async (ms) => { waits.push(ms); } };
    const out = await runScheduleTickOnce(deps("x", { joinRulesEnforce: mode, joinRulesIo: io, logs }), true);
    assert.deepEqual(ids(out), expectIds); assert.equal(calls, 3); assert.deepEqual(waits, [150, 300]); assert.equal(warns(logs).length, 1);
  }
  let calls = 0; // a non-transient failure is not retried
  await runScheduleTickOnce(deps("x", { joinRulesEnforce: "fail-closed", joinRulesIo: { load: () => { calls++; throw new JoinRulesStoreError("invalid", "bad"); }, wait: async () => {} } }), true);
  assert.equal(calls, 1);
});

test("evaluator: throwing is unevaluable per policy; a Promise result is read as keep (W5)", async () => {
  const stored: StoredJoinRules = { ruleSet: EMPTY, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
  const run = async (mode: string, evaluate: JoinRulesEnforceIo["evaluate"]) => {
    const logs: string[] = [];
    const out = await runScheduleTickOnce(deps("x", { joinRulesEnforce: mode, joinRulesIo: { load: () => stored, evaluate }, logs }), true);
    return { out, logs };
  };
  const thrower = (() => { throw new Error("boom"); }) as JoinRulesEnforceIo["evaluate"];
  const closed = await run("fail-closed", thrower);
  assert.deepEqual(ids(closed.out), []); assert.equal(closed.out.skipped[0]!.reason, "rules-unevaluable"); assert.equal(warns(closed.logs).length, 1);
  const open = await run("fail-open", thrower);
  assert.deepEqual(ids(open.out), ["g1"]); assert.equal(open.out.skipped.length, 0); assert.equal(warns(open.logs).length, 1);
  const prom = (async () => ({ action: "skip", reason: "deny-rule", ruleId: "x" })) as unknown as JoinRulesEnforceIo["evaluate"];
  for (const mode of MODES) assert.deepEqual(ids((await run(mode, prom)).out), ["g1"], "Promise is read as keep");
});

test("fail-open only restores items that were UNEVALUABLE; a genuine opt-out in the same tick stays removed", async () => {
  const stored: StoredJoinRules = { ruleSet: EMPTY, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: ["g1"] } };
  const evaluate: JoinRulesEnforceIo["evaluate"] = (ev, rules, state) => { if (ev.id === "g2") throw new Error("boom"); return evaluateJoinRules(ev, rules, state); };
  const c = async () => [cand("g1"), g2()];
  const open = await runScheduleTickOnce(deps("x", { loadCandidates: c, joinRulesEnforce: "fail-open", joinRulesIo: { load: () => stored, evaluate } }), true);
  assert.deepEqual(ids(open), ["g2"]); assert.deepEqual(open.skipped.map((s) => [s.sourceId, s.reason]), [["g1", "opted-out"]]);
  const closed = await runScheduleTickOnce(deps("x", { loadCandidates: c, joinRulesEnforce: "fail-closed", joinRulesIo: { load: () => stored, evaluate } }), true);
  assert.deepEqual(ids(closed), []); assert.deepEqual(closed.skipped.map((s) => s.reason).sort(), ["opted-out", "rules-unevaluable"]);
});

test("production evaluator receives three arguments (rules and state both passed)", async () => {
  const seen: number[] = [];
  const stored: StoredJoinRules = { ruleSet: EMPTY, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
  const ev = ((...a: unknown[]) => { seen.push(a.length); return { action: "join", reason: "allow-rule", ruleId: "r" }; }) as unknown as JoinRulesEnforceIo["evaluate"];
  await runScheduleTickOnce(deps("x", { joinRulesEnforce: "fail-closed", joinRulesIo: { load: () => stored, evaluate: ev } }), true);
  assert.ok(seen.length > 0 && seen.every((n) => n === 3), JSON.stringify(seen));
});

// ---------- VETO-ONLY PROPERTY ----------
test("veto-only property: wired scheduled is a subsequence of un-wired scheduled; removed items carry one of three reasons; survivors untouched", async () => {
  const sels = Array.from({ length: 40 }, (_, k) => { const i = genInputs(1000 + k); return { i, ref: reference(i, "x") }; });
  const evs: (JoinRulesEnforceIo["evaluate"])[] = [undefined, (() => { throw new Error("x"); }) as never, (async () => ({})) as never, (() => undefined) as never];
  const errs = ["invalid", "corrupt", "locked", "lock-failed", "tenant-mismatch", "too-large"] as const;
  let cases = 0, removedTotal = 0, restored = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed), pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
    const { ref } = pick(sels);
    const sessions = ref.toSchedule.flatMap((t) => [t.sourceId, t.sessionKey]);
    const rules: JoinRuleSet = r() < 0.15 ? ({ version: 9 } as never) : { version: 1, ownDomains: [], rules: r() < 0.5 ? [{ id: "d", effect: "deny", match: { email: pick(["o@x.com", "bad@x.com", "q@y.org"]) } }] : [] };
    const state = { approvedSenders: [], approvedDomains: [], optedOutEventIds: sessions.filter(() => r() < 0.3), ...(r() < 0.3 ? { optedOutMeetings: ["url:zoom:123456789"] } : {}) };
    const failing = r() < 0.2, ev = pick(evs);
    for (const mode of ["off", "fail-closed", "fail-open", "garbage"]) {
      const out = await enforceJoinRules(ref, { mode, tenantId: A, stateDir: "x", log: () => {},
        io: { load: () => { if (failing) throw new JoinRulesStoreError(pick(errs), "m"); return { ruleSet: rules, state }; }, evaluate: ev, wait: async () => {} } });
      cases++;
      let at = 0;
      for (const item of out.toSchedule) { at = ref.toSchedule.indexOf(item, at); assert.ok(at >= 0, `seed ${seed} ${mode}: scheduled item not in un-wired order`); at++; }
      assert.deepEqual(out.skipped.slice(0, ref.skipped.length), ref.skipped);
      const extra = out.skipped.slice(ref.skipped.length);
      assert.equal(extra.length, ref.toSchedule.length - out.toSchedule.length, `seed ${seed} ${mode}: one skip per removed item`);
      for (const e of extra) assert.ok(["opted-out", "rule-denied", "rules-unevaluable"].includes(e.reason), e.reason);
      if (mode === "off" || mode === "garbage") assert.equal(out, ref);
      removedTotal += extra.length; if (mode === "fail-open" && failing) restored += ref.toSchedule.length;
    }
  }
  assert.ok(cases === 1200 && removedTotal > 30 && restored > 0, `${cases} ${removedTotal} ${restored}`);
});

// ---------- TENANCY ----------
test("a tick for tenant A never opens tenant B's rules; no tenant id is unevaluable, not a guess", async () => {
  await withRoot(async (root) => {
    save(root, A, EMPTY); writeRaw(root, B, "{ corrupt on purpose");
    const opened: string[] = [];
    const real = await import("./join-rules-store.js");
    const io: JoinRulesEnforceIo = { load: (d, t) => { opened.push(t); return real.loadJoinRules(d, t); } };
    for (const mode of MODES) {
      const out = await runScheduleTickOnce(deps(root, { joinRulesEnforce: mode, joinRulesIo: io }), true);
      assert.deepEqual(ids(out), ["g1"], "B's corrupt file cannot affect A");
    }
    assert.deepEqual([...new Set(opened)], [A]);
    const asB = await runScheduleTickOnce(deps(root, { joinRulesEnforce: "fail-closed", joinRulesTenantId: B }), true);
    assert.deepEqual(ids(asB), [], "tenant B's own corrupt file fails closed for B");
    opened.length = 0;
    for (const t of [undefined, "", "UPPER", "../x"]) {
      const closed = await runScheduleTickOnce(deps(root, { joinRulesEnforce: "fail-closed", joinRulesTenantId: t, joinRulesIo: io }), true);
      assert.deepEqual(ids(closed), [], String(t));
      const open = await runScheduleTickOnce(deps(root, { joinRulesEnforce: "fail-open", joinRulesTenantId: t, joinRulesIo: io }), true);
      assert.deepEqual(ids(open), ["g1"], String(t));
    }
    assert.ok(!opened.includes(B));
  });
});

test("a real (non-dry) enforced run schedules only what the veto leaves", async () => {
  await withRoot(async (root) => {
    save(root, A, EMPTY, { optedOutEventIds: ["g1"] }); const { scheduler, calls } = fakeScheduler();
    await runScheduleTickOnce(deps(root, { scheduler, loadCandidates: async () => [cand("g1"), g2()], joinRulesEnforce: "fail-closed" }), false);
    const two = async () => [cand("g1"), g2()];
    const g2Key = (await runScheduleTickOnce(deps("x", { loadCandidates: two }), true)).toSchedule.find((i) => i.sourceId === "g2")!.sessionKey;
    assert.equal(calls.length, 1); assert.deepEqual([...readScheduledKeys(root)], [g2Key]);
  });
});
