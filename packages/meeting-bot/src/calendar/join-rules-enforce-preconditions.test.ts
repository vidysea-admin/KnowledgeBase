/**
 * packages/meeting-bot/src/calendar/join-rules-enforce-preconditions.test.ts — unit `t037-wiring-enable-preconditions`.
 * ISS-T037WIRE-002 (unrecognised setting is loud), ISS-T037WIRE-001 (tenant attribution, PARTLY closed), ISS-T037WIRE-003 (noted, unchanged).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CalendarEvent, SelectAutoRecordItemsResult } from "@lkb/core";

import { loadTrustedSenderConfig, redactJoinLink, selectAutoRecordItems, type AutoRecordCandidateInput } from "./auto-join.js";
import { resetJoinRulesEnforceWarnings, type JoinRulesEnforceIo } from "./join-rules-enforce.js";
import { saveJoinRules } from "./join-rules-store.js";
import type { JoinRuleSet } from "./join-rules.js";
import { readScheduledKeys } from "./schedule-state.js";
import { runScheduleTickOnce, type ScheduleTickDeps } from "./schedule-tick.js";
import { describeSkip } from "./skip-describe.js";

const NOW = "2026-10-10T09:56:00Z", START = "2026-10-10T10:00:00Z", END = "2026-10-10T11:00:00Z";
const ZOOM = "https://zoom.us/j/123456789?pwd=a";
const A = "ten-a", B = "ten-b";
const EMPTY: JoinRuleSet = { version: 1, ownDomains: [], rules: [] };
const MODES = ["fail-closed", "fail-open"] as const;
const ENV = "LKB_JOIN_RULES_ENFORCE";

const cand = (id: string, o: Partial<AutoRecordCandidateInput> = {}): AutoRecordCandidateInput => ({
  id, title: `Webinar: ${id}`, senderEmail: "o@x.com", senderDomain: "x.com", senderAuthenticated: true, status: "approved",
  meetingUrl: ZOOM, startTime: START, endTime: END, kind: "upcoming", ...o,
});
async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-precond-"));
  try { return await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function deps(root: string, o: Partial<ScheduleTickDeps> & { logs?: string[] } = {}): ScheduleTickDeps {
  const { logs, ...rest } = o;
  return { loadCalendarEvents: async () => [], loadCandidates: async () => [cand("g1")], now: () => NOW, stateDir: root,
    scheduler: { scheduleOnce: async () => {} }, log: (m) => { logs?.push(m); }, everyWebinar: true, joinRulesTenantId: A, ...rest };
}
const save = (root: string, tenant: string, state: Partial<{ optedOutEventIds: string[] }> = {}) =>
  saveJoinRules(root, tenant, { ruleSet: EMPTY, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [], ...state } });
const ids = (r: SelectAutoRecordItemsResult) => r.toSchedule.map((i) => i.sourceId);
const warns = (logs: string[]) => logs.filter((l) => l.includes("JOIN RULES WARNING"));
const dry = (d: ScheduleTickDeps) => runScheduleTickOnce(d, true);
const countingIo = () => { const c = { load: 0, evaluate: 0 }; const io: JoinRulesEnforceIo = {
  load: () => { c.load++; throw new Error("store opened"); }, evaluate: () => { c.evaluate++; throw new Error("evaluated"); } }; return { c, io }; };

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const URLS = [ZOOM, "https://zoom.us/j/555000111", "https://meet.google.com/abc-defg-hij", undefined, "http://evil.example/x"];
function genInputs(seed: number) {
  const r = rng(seed), pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString();
  const candidates = Array.from({ length: Math.floor(r() * 6) }, (_, i) => {
    const s = Math.floor(r() * 80) - 20;
    return cand(`g${i}`, { status: pick(["pending", "approved", "rejected", "auto_approved"] as const), meetingUrl: pick(URLS), startTime: at(s), endTime: at(s + 60),
      senderEmail: pick(["o@x.com", "bad@x.com"]), senderAuthenticated: r() < 0.5 });
  });
  const calendarEvents: CalendarEvent[] = Array.from({ length: Math.floor(r() * 4) }, (_, i) => {
    const s = Math.floor(r() * 80) - 20;
    return { id: `c${i}`, title: pick(["Webinar: A", "Standup"]), organizer: "o@x.com", meetingUrl: pick(URLS), startTime: at(s), endTime: at(s + 60), cancelled: r() < 0.1 };
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
const inputDeps = (root: string, inp: ReturnType<typeof genInputs>, o: Partial<ScheduleTickDeps> & { logs?: string[] }) =>
  deps(root, { loadCalendarEvents: async () => inp.calendarEvents, loadCandidates: async () => inp.candidates, everyWebinar: inp.everyWebinar, ...o });

// ---------- A: ISS-T037WIRE-002 ----------
test("DEFAULT PARITY: absent, empty and `off` give the un-wired tick's exact output and log lines over 300 seeds; zero store calls, zero requests", async () => {
  await withRoot(async (root) => {
    const { c, io } = countingIo(); let requests = 0;
    const realFetch = globalThis.fetch; globalThis.fetch = (async () => { requests++; throw new Error("network"); }) as typeof fetch;
    try {
      let compared = 0, scheduled = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const inp = genInputs(seed), ref = reference(inp, root), want = expectedLogs(inp, ref); scheduled += ref.toSchedule.length;
        for (const v of [undefined, "", "off"]) {
          resetJoinRulesEnforceWarnings();
          const logs: string[] = [];
          assert.deepEqual(await dry(inputDeps(root, inp, { joinRulesEnforce: v, joinRulesKeyTenantId: B, joinRulesIo: io, logs })), ref, `seed ${seed} ${String(v)}`);
          assert.deepEqual(logs, want, `seed ${seed} ${String(v)} logs`); compared++;
        }
      }
      assert.equal(compared, 900); assert.ok(scheduled >= 30);
    } finally { globalThis.fetch = realFetch; }
    assert.deepEqual([c.load, c.evaluate, requests], [0, 0, 0]);
    assert.equal(existsSync(path.join(root, "join-rules")), false);
  });
});

// The values ISS-T037WIRE-002 recorded, verbatim.
const RECORDED_002 = ["Fail-Closed", "FAIL-CLOSED", " fail-closed", "fail-closed ", "fail-open\n", "true", "1", "yes"];
test("ISS-T037WIRE-002 recorded values: each warns once, enforcement stays OFF, the ONLY difference from the un-wired tick is that one line", async () => {
  await withRoot(async (root) => {
    save(root, A, { optedOutEventIds: ["g1"] }); // would remove g1 if it were read
    let n = 0;
    for (const v of RECORDED_002) {
      resetJoinRulesEnforceWarnings();
      const { c, io } = countingIo(), logs: string[] = [];
      const out = await dry(deps(root, { joinRulesEnforce: v, joinRulesIo: io, logs }));
      assert.deepEqual(ids(out), ["g1"], `${JSON.stringify(v)}: enforcement stays off (opted-out g1 still scheduled)`);
      assert.equal(warns(logs).length, 1, JSON.stringify(v));
      const w = logs[0]!;
      assert.match(w, /unrecognised value/); assert.match(w, /enforcement is OFF/); assert.match(w, /off, fail-closed, fail-open/);
      assert.deepEqual(logs.slice(1), expectedLogs({ candidates: [cand("g1")], calendarEvents: [], everyWebinar: true },
        reference({ candidates: [cand("g1")], calendarEvents: [], everyWebinar: true }, root)), "rest of the log identical to the un-wired tick");
      assert.deepEqual([c.load, c.evaluate], [0, 0]); n++;
    }
    assert.equal(n, RECORDED_002.length, `ISS-T037WIRE-002: ${n}/${RECORDED_002.length}`);
  });
});
test("an unrecognised value differs from the un-wired tick by exactly one line over 300 seeds", async () => {
  await withRoot(async (root) => {
    for (let seed = 1; seed <= 300; seed++) {
      const inp = genInputs(seed), ref = reference(inp, root); resetJoinRulesEnforceWarnings();
      const logs: string[] = [];
      assert.deepEqual(await dry(inputDeps(root, inp, { joinRulesEnforce: "Fail-Closed", logs })), ref);
      assert.equal(logs.length, expectedLogs(inp, ref).length + 1, `seed ${seed}`);
      assert.deepEqual(logs.filter((l) => !l.includes("JOIN RULES WARNING")), expectedLogs(inp, ref));
    }
  });
});
test("the warning is once per process per value, not once per tick", async () => {
  await withRoot(async (root) => {
    resetJoinRulesEnforceWarnings(); const logs: string[] = [];
    for (let i = 0; i < 5; i++) await dry(deps(root, { joinRulesEnforce: "yes", logs }));
    assert.equal(warns(logs).length, 1);
    await dry(deps(root, { joinRulesEnforce: "enabled", logs })); assert.equal(warns(logs).length, 2, "a different bad value is reported too");
    await dry(deps(root, { joinRulesEnforce: undefined, logs })); await dry(deps(root, { joinRulesEnforce: "", logs }));
    assert.equal(warns(logs).length, 2, "absent/empty stay silent");
  });
});
test("the echo is bounded and sanitised: a 10,000-character or control-character value is inert in the log", async () => {
  await withRoot(async (root) => {
    for (const v of ["A".repeat(10_000), "x\r\nschedule-tick: FAKE LINE\u001b[31m\u0007\u0000y", String.fromCharCode(0x2028, 0x2029, 0x85) + "tab\there"]) {
      resetJoinRulesEnforceWarnings(); const logs: string[] = [];
      await dry(deps(root, { joinRulesEnforce: v, logs }));
      assert.equal(warns(logs).length, 1); const w = warns(logs)[0]!;
      assert.ok(w.length < 600, `bounded (${w.length})`);
      assert.doesNotMatch(w, /[\x00-\x1f\x7f-\x9f]|[\p{Zl}\p{Zp}]/u, "no control characters or line breaks");
      assert.ok(!w.includes("A".repeat(60)), "no long echo");
      assert.equal(logs.filter((l) => l.includes("FAKE LINE")).length, v.includes("FAKE") ? 1 : 0, "injected text stays inside the single warning line");
      assert.ok(!logs.some((l) => l.startsWith("schedule-tick: FAKE")));
    }
  });
});
test("enabling values are not warned about and `off` stays silent", async () => {
  await withRoot(async (root) => {
    save(root, A);
    for (const v of ["off", "fail-closed", "fail-open"]) { resetJoinRulesEnforceWarnings(); const logs: string[] = []; await dry(deps(root, { joinRulesEnforce: v, logs })); assert.equal(warns(logs).length, 0, v); }
  });
});

// ---------- B: ISS-T037WIRE-001 (partly) ----------
// Seam path only: the tick is called WITHOUT a key tenant (joinRulesKeyTenantId undefined), so nothing can be attributed and the rules store is read as is.
// This is NOT production: buildRealScheduleTickDeps now supplies the key tenant; that path is covered by join-rules-wiring/key-tenant.test.ts (ISS-T037WIRE-001 recorded repro, production shape).
test("ISS-T037WIRE-001 recorded repro, test seam with NO key tenant supplied (not production): B's empty store lets A's g1 through; production path is in join-rules-wiring/key-tenant.test.ts", async () => {
  await withRoot(async (root) => {
    save(root, A, { optedOutEventIds: ["g1"] });
    for (const mode of MODES) {
      const own = await dry(deps(root, { joinRulesEnforce: mode, joinRulesTenantId: A })); assert.deepEqual(ids(own), [], `${mode}: A's own run honours the opt-out`);
      const asB = await dry(deps(root, { joinRulesEnforce: mode, joinRulesTenantId: B }));
      assert.deepEqual(ids(asB), ["g1"], `${mode}: run as B without a key tenant still schedules g1 (residual, needs an API field)`);
    }
  });
});
test("ISS-T037WIRE-001 recorded repro with the key tenant known: mismatch is `tenant-mismatch`, never B's rules applied to A", async () => {
  await withRoot(async (root) => {
    save(root, A, { optedOutEventIds: ["g1"] }); save(root, B, { optedOutEventIds: ["g2"] });
    const inp = { candidates: [cand("g1"), cand("g2", { meetingUrl: "https://meet.google.com/abc-defg-hij", startTime: "2026-10-10T09:57:00Z", endTime: "2026-10-10T09:58:30Z" })], calendarEvents: [], everyWebinar: true };
    let n = 0;
    for (const mode of MODES) {
      const { c, io } = countingIo(), logs: string[] = [];
      const out = await dry(inputDeps(root, inp, { joinRulesEnforce: mode, joinRulesTenantId: B, joinRulesKeyTenantId: A, joinRulesIo: io, logs }));
      assert.equal(c.load, 0, "no rules are read on a mismatch");
      const w = warns(logs); assert.equal(w.length, 1); assert.match(w[0]!, /tenant-mismatch/);
      assert.ok(!/ten-a|ten-b|[A-Za-z]:[\\/]/.test(w[0]!), "no tenant ids or paths in the warning");
      if (mode === "fail-closed") {
        assert.deepEqual(ids(out), [], "fail-closed: every item skipped");
        assert.deepEqual(out.skipped.filter((s) => s.reason === "rules-unevaluable").map((s) => s.sourceId).sort(), ["g1", "g2"]);
      } else assert.deepEqual(ids(out).sort(), ["g1", "g2"], "fail-open: selection unchanged (A's g1 scheduled, B's g2 opt-out NOT applied)");
      n++;
    }
    assert.equal(n, 2, `ISS-T037WIRE-001 (key tenant known): ${n}/2 policies as specified`);
  });
});
test("matching tenants behave exactly as without the check; unknown key tenant is today's behaviour", async () => {
  await withRoot(async (root) => {
    save(root, A, { optedOutEventIds: ["g1"] });
    for (let seed = 1; seed <= 100; seed++) for (const mode of MODES) {
      const inp = genInputs(seed), la: string[] = [], lb: string[] = [];
      const withKey = await dry(inputDeps(root, inp, { joinRulesEnforce: mode, joinRulesKeyTenantId: A, logs: la }));
      const noKey = await dry(inputDeps(root, inp, { joinRulesEnforce: mode, logs: lb }));
      assert.deepEqual(withKey, noKey); assert.deepEqual(la, lb);
    }
  });
});
test("tenant-unset: absent, empty or invalid LKB_TENANT_ID is unevaluable per policy; no default tenant, no echo of the raw value", async () => {
  await withRoot(async (root) => {
    for (const t of ["default", "toc", "tenant"]) save(root, t, { optedOutEventIds: ["g1"] }); // a "default" tenant file must never be picked
    for (const bad of [undefined, "", "Ten-A", "../ten-a", "a b", "x".repeat(200), "CON"]) for (const mode of MODES) {
      const { c, io } = countingIo(), logs: string[] = [];
      const out = await dry(deps(root, { joinRulesEnforce: mode, joinRulesTenantId: bad, joinRulesIo: bad === undefined || bad === "" ? io : undefined, logs }));
      assert.equal(c.load, 0);
      assert.equal(warns(logs).length, 1, `${String(bad)} ${mode}`); assert.match(warns(logs)[0]!, /tenant-unset/);
      assert.ok(!logs.join("\n").includes("xxxxxxxxxx") && !logs.join("\n").includes("../"), "raw value not echoed");
      if (mode === "fail-closed") { assert.deepEqual(ids(out), []); assert.ok(out.skipped.some((s) => s.reason === "rules-unevaluable")); }
      else assert.deepEqual(ids(out), ["g1"]);
    }
  });
});

// ---------- veto-only ----------
test("VETO-ONLY: 500 seeded cases x both enabling values (random rules, tenants, key-tenant states): output is the input minus removed items", async () => {
  await withRoot(async (root) => {
    let removedTotal = 0;
    for (let seed = 1; seed <= 500; seed++) for (const mode of MODES) {
      const r = rng(seed * 7 + 1), inp = genInputs(seed), ref = reference(inp, root);
      save(root, A, { optedOutEventIds: inp.candidates.filter(() => r() < 0.4).map((x) => x.id) });
      const tenant = [A, B, undefined, "Bad Id"][Math.floor(r() * 4)], key = [undefined, A, B][Math.floor(r() * 3)];
      const out = await dry(inputDeps(root, inp, { joinRulesEnforce: mode, joinRulesTenantId: tenant, joinRulesKeyTenantId: key }));
      let i = 0; for (const it of out.toSchedule) { while (i < ref.toSchedule.length && ref.toSchedule[i]!.sessionKey !== it.sessionKey) i++; assert.ok(i < ref.toSchedule.length, `seed ${seed}: scheduled item not in input`); i++; }
      assert.deepEqual(out.skipped.slice(0, ref.skipped.length), ref.skipped);
      assert.equal(out.skipped.length - ref.skipped.length, ref.toSchedule.length - out.toSchedule.length);
      removedTotal += ref.toSchedule.length - out.toSchedule.length;
    }
    assert.ok(removedTotal >= 50, `exercised removals (${removedTotal})`);
  });
});

// ---------- C: ISS-T037WIRE-003 left as-is ----------
test("ISS-T037WIRE-003: contract clause 4/W5 reads a Promise-returning evaluator as KEEP; this unit deliberately does not change that (conflict noted for the checker)", async () => {
  await withRoot(async (root) => {
    save(root, A);
    for (const mode of MODES) {
      const out = await dry(deps(root, { joinRulesEnforce: mode, joinRulesIo: { load: () => ({ ruleSet: EMPTY, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } }),
        evaluate: (() => Promise.resolve({ action: "skip", reason: "deny-rule", ruleId: "r" })) as never } }));
      assert.deepEqual(ids(out), ["g1"], mode);
    }
  });
});
