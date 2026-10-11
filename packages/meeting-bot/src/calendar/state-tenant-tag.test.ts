/**
 * ISS-ALERTID-006: the scheduler's state files (schedule-state.json, scheduled/<jobKey>.json) are tenant-tagged and every
 * reader/writer fails closed on a missing or different tag. Temp directories only: the real <repo>/raw/webinars is never touched.
 * Counters at the end print "ISS-ALERTID-006: n/n" for the manifest.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  readScheduleState, readScheduledKeys, readScheduledJob, recordScheduled, writeScheduledJob, scheduleStateFilePath, scheduledJobFilePath,
} from "./schedule-state.js";
import { runScheduleTickOnce, type ScheduleTickDeps } from "./schedule-tick.js";
import { StateTenantRefusal, assertTenantTag, requireStateTenant } from "./state-tenant-tag.js";
import { readLiveJobs } from "../send-now-command.js";
import { readWebinarOperationState } from "./schedule-state.js";
import { deriveJobKey } from "./task-scheduler.js";
import type { AutoRecordCandidateInput } from "./auto-join.js";

const A = "tenant-a", B = "tenant-b";
let pass = 0, total = 0;
const check = (name: string, fn: () => void) => { total++; fn(); pass++; void name; };
after(() => { console.log(`ISS-ALERTID-006: ${pass}/${total} reproductions refused or tagged as required`); });

function tmp<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), "alerttenant-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function tree(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name); out.push(`${path.relative(dir, p)}|${e.isDirectory() ? "d" : `${statSync(p).size}|${readFileSync(p, "utf8")}`}`);
    if (e.isDirectory()) walk(p); } };
  walk(dir); return out.sort();
}
const refused = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: unknown) => e instanceof StateTenantRefusal && re.test(e.message));

// Verbatim shapes recorded in ISS-ALERTID-006 (ScheduledEntry {sessionKey,title,scheduledAt}, ScheduledJob {url,until,title,sessionId}) as written by the OLD code.
const LEGACY_STATE = { "cal:tenantB": { sessionKey: "cal:tenantB", title: "TENANT-B Board Review", scheduledAt: "2026-10-10T09:00:00.000Z" } };
const LEGACY_JOB = { url: "https://zoom.us/j/12345678901?pwd=SECRET", until: "2026-10-12T10:30:00Z", title: "TENANT-B Board Review", sessionId: "cal:tenantB" };
const ENTRY = { sessionKey: "cal:one", title: "One", scheduledAt: "2026-10-10T09:00:00.000Z" };
const JOB = { url: "https://zoom.us/j/1", until: "2026-10-12T10:00:00Z", title: "One", sessionId: "cal:one" };

test("ISS-ALERTID-006 repro 1/2: the writers now store the tenant (recorded evidence: 'neither writer stores a tenant field')", () => tmp((dir) => {
  recordScheduled(dir, ENTRY, A);
  writeScheduledJob(dir, "job-one", JOB, A);
  check("state tagged", () => assert.equal(JSON.parse(readFileSync(scheduleStateFilePath(dir), "utf8")).tenantId, A));
  check("job tagged", () => assert.equal(JSON.parse(readFileSync(scheduledJobFilePath(dir, "job-one"), "utf8")).tenantId, A));
  assert.deepEqual([...readScheduledKeys(dir, A)], ["cal:one"]);
  assert.deepEqual(readScheduledJob(dir, "job-one", A), JOB, "the tag is not leaked into the returned job");
}));

test("ISS-ALERTID-006 repro 3-6: old untagged files (verbatim shapes) are refused by every reader, for every tenant, and left untouched", () => tmp((dir) => {
  mkdirSync(path.join(dir, "scheduled"), { recursive: true });
  writeFileSync(scheduleStateFilePath(dir), JSON.stringify(LEGACY_STATE, null, 2) + "\n");
  writeFileSync(scheduledJobFilePath(dir, "legacy"), JSON.stringify(LEGACY_JOB, null, 2) + "\n");
  const before = tree(dir);
  for (const t of [A, B]) {
    check("readScheduleState", () => refused(() => readScheduleState(dir, t), /schedule-state\.json: it has no tenant tag/));
    check("readScheduledKeys", () => refused(() => readScheduledKeys(dir, t), /no tenant tag/));
    check("readScheduledJob", () => refused(() => readScheduledJob(dir, "legacy", t), /scheduled\/legacy\.json: it has no tenant tag/));
    check("recordScheduled does not overwrite", () => refused(() => recordScheduled(dir, ENTRY, t), /no tenant tag/));
    check("writeScheduledJob does not overwrite", () => refused(() => writeScheduledJob(dir, "legacy", { ...JOB, sessionId: "cal:tenantB" }, t), /no tenant tag/));
  }
  const msg = (() => { try { readScheduleState(dir, A); } catch (e) { return (e as Error).message; } return ""; })();
  assert.match(msg, /Review it and move it aside yourself; no automatic migration is done/);
  assert.ok(!msg.includes("TENANT-B Board Review"), "the refusal does not print the file's contents");
  assert.deepEqual(tree(dir), before, "no file was changed, migrated or deleted");
}));

test("ISS-ALERTID-006: two tenants - A cannot read, resolve, extend or overwrite B's tagged state, and B's state survives byte-identical", () => tmp((dir) => {
  recordScheduled(dir, { ...ENTRY, title: "B-ONLY-TITLE" }, B);
  writeScheduledJob(dir, "job-one", { ...JOB, title: "B-ONLY-TITLE" }, B);
  const before = tree(dir);
  check("A readScheduleState", () => refused(() => readScheduleState(dir, A), /different tenant/));
  check("A readScheduledKeys", () => refused(() => readScheduledKeys(dir, A), /different tenant/));
  check("A readScheduledJob", () => refused(() => readScheduledJob(dir, "job-one", A), /different tenant/));
  check("A recordScheduled", () => refused(() => recordScheduled(dir, ENTRY, A), /different tenant/));
  check("A writeScheduledJob (same session, would be allowed as a rewrite)", () => refused(() => writeScheduledJob(dir, "job-one", JOB, A), /different tenant/));
  check("A readLiveJobs (send-now)", () => {
    const ops = path.join(dir, "operations.json");
    assert.throws(() => readLiveJobs({ operationsFile: ops, scheduledDir: path.join(dir, "scheduled"), tenantId: A }, new Date("2026-10-10T10:00:00Z"), readWebinarOperationState),
      (e: unknown) => e instanceof StateTenantRefusal && /different tenant/.test(e.message));
  });
  assert.ok(!(() => { try { readScheduleState(dir, A); } catch (e) { return (e as Error).message; } return ""; })().includes(B), "the message never names the other tenant");
  assert.deepEqual(tree(dir), before, "B's files are byte-identical after A's attempts");
  assert.deepEqual([...readScheduledKeys(dir, B)], ["cal:one"], "B still reads its own");
}));

test("ISS-ALERTID-006: a missing or invalid tenant fails closed (no default tenant, no path-like tenant)", () => tmp((dir) => {
  for (const bad of [undefined, null, "", " ", "../b", "a/b", "a\\b", "x".repeat(101), 5, {}]) {
    check(`invalid tenant ${JSON.stringify(bad)}`, () => {
      assert.throws(() => requireStateTenant(bad), StateTenantRefusal);
      assert.throws(() => readScheduleState(dir, bad as never), StateTenantRefusal);
      assert.throws(() => recordScheduled(dir, ENTRY, bad as never), StateTenantRefusal);
    });
  }
  assert.deepEqual(readdirSync(dir), [], "nothing was created");
}));

test("ISS-ALERTID-006: tags are matched exactly; non-object, array and empty-tag bodies are untagged", () => {
  for (const body of [null, 5, "x", [], {}, { tenantId: "" }, { tenantId: 7 }, { tenantid: A }, { tenantId: A.toUpperCase() }]) {
    check(`body ${JSON.stringify(body)}`, () => assert.throws(() => assertTenantTag(body, A, "f.json"), StateTenantRefusal));
  }
  check("exact", () => assert.doesNotThrow(() => assertTenantTag({ tenantId: A }, A, "f.json")));
});

test("ISS-ALERTID-006: a state file whose body is a bare map with a session key named 'tenantId' is still untagged (no spoof via keys)", () => tmp((dir) => {
  writeFileSync(scheduleStateFilePath(dir), JSON.stringify({ tenantId: { sessionKey: "tenantId", title: "x", scheduledAt: "y" } }));
  check("entry named tenantId", () => refused(() => readScheduleState(dir, A), /different tenant|no tenant tag/));
}));

test("ISS-ALERTID-006: __proto__ key in a tagged state file does not pollute", () => tmp((dir) => {
  writeFileSync(scheduleStateFilePath(dir), `{"version":2,"tenantId":"${A}","entries":{"__proto__":{"polluted":1},"cal:k":{"sessionKey":"cal:k","title":"t","scheduledAt":"s"}}}`);
  const s = readScheduleState(dir, A);
  assert.deepEqual(Object.keys(s), ["cal:k"]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
}));

// ----- the tick -----
const CAND: AutoRecordCandidateInput = {
  id: "c1", title: "TOC webinar", senderEmail: "ops@theoutreachcollective.in", senderDomain: "theoutreachcollective.in", senderAuthenticated: true,
  status: "auto_approved", meetingUrl: "https://zoho.com/meeting/abc?tk=SECRET123", startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T13:30:00Z", kind: "upcoming",
};
function tickDeps(dir: string, o: Partial<ScheduleTickDeps>, calls: string[]): ScheduleTickDeps {
  return { loadCalendarEvents: async () => [], loadCandidates: async () => [CAND], now: () => "2026-09-28T12:26:00Z", stateDir: dir,
    scheduler: { scheduleOnce: async (x) => { calls.push(x.jobKey); } }, log: () => {}, ...o };
}

test("ISS-ALERTID-006: the tick refuses when its tenant is missing/invalid, or when the shared dir holds another tenant's or an untagged state, and schedules nothing", async () => {
  for (const setup of ["other-tenant", "untagged-state", "untagged-job"] as const) {
    const dir = mkdtempSync(path.join(tmpdir(), "alerttenant-tick-"));
    try {
      mkdirSync(path.join(dir, "scheduled"), { recursive: true });
      if (setup === "other-tenant") recordScheduled(dir, { sessionKey: "gmail:other", title: "t", scheduledAt: "s" }, B);
      if (setup === "untagged-state") writeFileSync(scheduleStateFilePath(dir), JSON.stringify(LEGACY_STATE));
      if (setup === "untagged-job") writeFileSync(scheduledJobFilePath(dir, deriveJobKey("gmail:c1")!), JSON.stringify({ ...LEGACY_JOB, sessionId: "gmail:other" }));
      const before = tree(dir), calls: string[] = [], logs: string[] = [];
      const run = runScheduleTickOnce(tickDeps(dir, { stateTenantId: A, log: (m) => logs.push(m) }, calls), false);
      if (setup === "untagged-job") {
        // the state file is absent (readable), the job file at this key is untagged: the item is skipped loudly, nothing is scheduled or overwritten
        await run;
        total++; assert.deepEqual(calls, []); assert.ok(logs.some((l) => /refused to schedule .*no tenant tag/.test(l)), logs.join("\n")); pass++;
      } else {
        total++; await assert.rejects(run, StateTenantRefusal); assert.deepEqual(calls, []); pass++;
      }
      assert.deepEqual(tree(dir), before, `${setup}: nothing changed on disk`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  for (const bad of [undefined, "", "../b"]) {
    const dir = mkdtempSync(path.join(tmpdir(), "alerttenant-tick-")), calls: string[] = [];
    try {
      total++; await assert.rejects(runScheduleTickOnce(tickDeps(dir, { stateTenantId: bad as never }, calls), false), StateTenantRefusal);
      await assert.rejects(runScheduleTickOnce(tickDeps(dir, { stateTenantId: bad as never }, calls), true), StateTenantRefusal);
      assert.deepEqual(calls, []); assert.deepEqual(readdirSync(dir), []); pass++;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("ISS-ALERTID-006: two tenants on two state dirs each tick normally; a normal tick writes tagged files", async () => {
  for (const t of [A, B]) {
    const dir = mkdtempSync(path.join(tmpdir(), "alerttenant-tick-")), calls: string[] = [];
    try {
      await runScheduleTickOnce(tickDeps(dir, { stateTenantId: t }, calls), false);
      assert.equal(calls.length, 1);
      assert.equal(JSON.parse(readFileSync(scheduleStateFilePath(dir), "utf8")).tenantId, t);
      assert.equal(JSON.parse(readFileSync(scheduledJobFilePath(dir, calls[0]!), "utf8")).tenantId, t);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
