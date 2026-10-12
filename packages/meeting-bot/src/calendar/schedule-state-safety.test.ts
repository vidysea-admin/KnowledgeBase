/** ISS-ALERTWHOFIX-001: schedule-state.json is written atomically under a lock, a corrupt file is quarantined (never silently reset), and a corrupt file never stops the tick from joining. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { AutoRecordCandidateInput } from "./auto-join.js";
import { ScheduleStateCorrupt, loadScheduledKeysForTick, readScheduleState, readScheduledKeys, recordScheduled, scheduleStateFilePath, readScheduledJob } from "./schedule-state.js";
import { runScheduleTickOnce, type ScheduleTickDeps } from "./schedule-tick.js";
import type { ScheduleOnceOptions } from "./task-scheduler.js";
import { StateTenantRefusal } from "./state-tenant-tag.js";

const A = "A", NOW = "2026-09-28T12:26:00Z";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(path.join(tmpdir(), "schedstatesafe-"));
const entry = (k: string) => ({ sessionKey: `cal:${k}`, title: "t", scheduledAt: "2026-10-10T10:00:00.000Z" });
const keys = (d: string) => [...readScheduledKeys(d, A)].sort();
const leftovers = (d: string) => readdirSync(d).filter((n) => n.endsWith(".tmp"));
const asides = (d: string) => readdirSync(d).filter((n) => n.startsWith("schedule-state.json.corrupt-"));
const heldLock = (d: string) => writeFileSync(path.join(d, "schedule-state.lock"), JSON.stringify({ pid: process.pid, token: "held", at: Date.now() }));
const cand = (id: string, startTime = "2026-09-28T12:30:00Z"): AutoRecordCandidateInput => ({
  id, title: "TOC webinar", senderEmail: "ops@theoutreachcollective.in", senderDomain: "theoutreachcollective.in", senderAuthenticated: true,
  status: "auto_approved", meetingUrl: "https://zoho.com/meeting/abc?tk=SECRET123", startTime, endTime: "2026-09-28T13:30:00Z", kind: "upcoming" });
function tickDeps(d: string, logs: string[], calls: ScheduleOnceOptions[], candidates = [cand("c1")]): ScheduleTickDeps {
  return { loadCalendarEvents: async () => [], loadCandidates: async () => candidates, now: () => NOW, stateDir: d, stateTenantId: A,
    scheduler: { scheduleOnce: async (o) => { calls.push(o); } }, log: (m) => logs.push(m) };
}

test("atomic: a crash between write and rename leaves the old file byte-identical, no temp file, lock released", () => {
  const d = tmp();
  recordScheduled(d, entry("a"), A); recordScheduled(d, entry("b"), A);
  const before = readFileSync(scheduleStateFilePath(d), "utf8");
  const crash = (() => { throw Object.assign(new Error("simulated crash before rename"), { code: "EIO" }); }) as typeof renameSync;
  assert.throws(() => recordScheduled(d, entry("c"), A, { rename: crash }), /simulated crash/);
  assert.equal(readFileSync(scheduleStateFilePath(d), "utf8"), before);
  assert.deepEqual(leftovers(d), []);
  assert.deepEqual(keys(d), ["cal:a", "cal:b"]);
  assert.equal(existsSync(path.join(d, "schedule-state.lock")), false);
  rmSync(d, { recursive: true, force: true });
});

const SHAPES: Array<[string, string]> = [
  ["truncated", '{"version":2,"tenantId":"A","entries":{"cal:x":{"sessi'], ["empty", ""], ["whitespace", "   \n"], ["array", "[1,2]"], ["string", '"x"'], ["null", "null"],
  ["number", "5"], ["entries-array", '{"version":2,"tenantId":"A","entries":[1]}'], ["entries-string", '{"version":2,"tenantId":"A","entries":"x"}'],
  ["entries-null", '{"version":2,"tenantId":"A","entries":null}'], ["binary", "\u0000\u0001\u0002�"]];

test("corrupt shapes: read throws ScheduleStateCorrupt and never mutates; write quarantines byte-for-byte and starts fresh", () => {
  for (const [name, bytes] of SHAPES) {
    const d = tmp(); const f = scheduleStateFilePath(d);
    writeFileSync(f, bytes);
    assert.throws(() => readScheduleState(d, A), ScheduleStateCorrupt, name);
    assert.equal(readFileSync(f, "utf8"), bytes, `${name}: read left the file untouched`);
    const moved: string[] = [];
    recordScheduled(d, entry("n"), A, { onQuarantine: (m) => moved.push(m) });
    assert.equal(moved.length, 1, `${name}: quarantine reported`);
    assert.match(moved[0]!, /^schedule-state\.json\.corrupt-/);
    assert.equal(readFileSync(path.join(d, moved[0]!), "utf8"), bytes, `${name}: quarantined bytes identical`);
    assert.deepEqual(keys(d), ["cal:n"], name);
    rmSync(d, { recursive: true, force: true });
  }
});

test("a tagged file with no entries key is empty, not corrupt; foreign / untagged files are refused, not quarantined", () => {
  const d = tmp(); writeFileSync(scheduleStateFilePath(d), '{"version":2,"tenantId":"A"}');
  assert.deepEqual(keys(d), []);
  recordScheduled(d, entry("a"), A);
  assert.throws(() => recordScheduled(d, entry("b"), "B"), StateTenantRefusal);
  writeFileSync(scheduleStateFilePath(d), '{"cal:x":{"sessionKey":"cal:x"}}');
  assert.throws(() => recordScheduled(d, entry("b"), A), StateTenantRefusal);
  assert.throws(() => loadScheduledKeysForTick(d, A), StateTenantRefusal, "tick read still fails closed on an untagged file");
  assert.deepEqual(asides(d), []);
  rmSync(d, { recursive: true, force: true });
});

test("tick: a corrupt state file is quarantined, WARNING logged, and the meeting is STILL scheduled", async () => {
  for (const [name, bytes] of SHAPES) {
    const d = tmp(); writeFileSync(scheduleStateFilePath(d), bytes);
    const logs: string[] = [], calls: ScheduleOnceOptions[] = [];
    const res = await runScheduleTickOnce(tickDeps(d, logs, calls), false);
    assert.equal(res.toSchedule.length, 1, name);
    assert.equal(calls.length, 1, `${name}: scheduler called, joining not blocked`);
    assert.ok(logs.some((l) => /WARNING: schedule-state\.json was corrupt; moved aside as schedule-state\.json\.corrupt-/.test(l)), `${name}: loud`);
    assert.equal(asides(d).length, 1, name);
    assert.equal(readFileSync(path.join(d, asides(d)[0]!), "utf8"), bytes, `${name}: evidence kept`);
    assert.equal(keys(d).length, 1, `${name}: fresh file has the new row`);
    rmSync(d, { recursive: true, force: true });
  }
});

test("tick: dry-run with a corrupt file warns, still selects, and touches nothing", async () => {
  const d = tmp(); writeFileSync(scheduleStateFilePath(d), "{broken");
  const logs: string[] = [], calls: ScheduleOnceOptions[] = [];
  const res = await runScheduleTickOnce(tickDeps(d, logs, calls), true);
  assert.equal(res.toSchedule.length, 1); assert.equal(calls.length, 0);
  assert.equal(readFileSync(scheduleStateFilePath(d), "utf8"), "{broken"); assert.deepEqual(asides(d), []);
  assert.ok(logs.some((l) => /WARNING: schedule-state\.json is corrupt and could not be moved aside/.test(l)));
  rmSync(d, { recursive: true, force: true });
});

test("tick read: corrupt file + lock unobtainable -> empty dedup, reported as unmoved, file untouched", () => {
  const d = tmp(); writeFileSync(scheduleStateFilePath(d), "{broken"); heldLock(d);
  const why: string[] = [];
  const seen = loadScheduledKeysForTick(d, A, { lockWaitMs: 150, onCorruptUnmoved: (w) => why.push(w) });
  assert.equal(seen.size, 0); assert.equal(why.length, 1);
  assert.equal(readFileSync(scheduleStateFilePath(d), "utf8"), "{broken");
  rmSync(d, { recursive: true, force: true });
});

test("tick: a failed dedup write (lock held) does not crash the tick; the job is still scheduled and a WARNING is logged", { timeout: 60_000 }, async () => {
  const d = tmp(); heldLock(d);
  const logs: string[] = [], calls: ScheduleOnceOptions[] = [];
  await runScheduleTickOnce(tickDeps(d, logs, calls), false);
  assert.equal(calls.length, 1, "scheduled despite the dedup write failing");
  assert.ok(logs.some((l) => /WARNING: scheduled .* could not record it in schedule-state\.json/.test(l)));
  rmSync(d, { recursive: true, force: true });
});

test("corruption cannot cause a second JOB: re-scheduling after quarantine reuses the same deterministic jobKey and job file", async () => {
  const d = tmp(); const logs: string[] = [], calls: ScheduleOnceOptions[] = [];
  await runScheduleTickOnce(tickDeps(d, logs, calls), false);
  writeFileSync(scheduleStateFilePath(d), "{broken");
  await runScheduleTickOnce(tickDeps(d, logs, calls), false);
  assert.equal(calls.length, 2); assert.equal(calls[0]!.jobKey, calls[1]!.jobKey, "same task name, so `schtasks /create /f` replaces rather than duplicates");
  assert.ok(readScheduledJob(d, calls[0]!.jobKey, A));
  rmSync(d, { recursive: true, force: true });
});

test("concurrency: overlapping writers (child processes) lose no rows", () => {
  const d = tmp();
  const child = path.join(HERE, "..", "sched-state-writer.fixture.ts");
  const ps = ["p0", "p1", "p2", "p3", "p4", "p5"];
  const procs = ps.map((k) => spawn(process.execPath, ["--import", "tsx", child, d, k], { cwd: path.join(HERE, "..", ".."), stdio: "pipe" }));
  return Promise.all(procs.map((p) => new Promise<number>((res) => { let err = ""; p.stderr!.on("data", (b: Buffer) => (err += b)); p.on("close", (c: number) => { if (c) console.log(err); res(c ?? 1); }); }))).then((codes) => {
    assert.deepEqual(codes, [0, 0, 0, 0, 0, 0]);
    assert.deepEqual(keys(d), ps.flatMap((k) => [0, 1, 2, 3].map((i) => `cal:${k}${i}`)).sort(), "all 24 rows present");
    assert.deepEqual(leftovers(d), []);
    rmSync(d, { recursive: true, force: true });
  });
});

test("REPLAY ISS-ALERTWHOFIX-001: 4 dedup rows, file truncated to 60 bytes, then a REAL tick", async () => {
  const d = tmp(); const f = scheduleStateFilePath(d);
  for (const k of ["h1", "h2", "h3", "h4"]) recordScheduled(d, entry(k), A);
  assert.equal(keys(d).length, 4);
  truncateSync(f, 60); const truncated = readFileSync(f);
  const logs: string[] = [], calls: ScheduleOnceOptions[] = [];
  await runScheduleTickOnce(tickDeps(d, logs, calls), false);
  assert.equal(asides(d).length, 1); assert.ok(readFileSync(path.join(d, asides(d)[0]!)).equals(truncated), "kept byte-for-byte");
  assert.equal(calls.length, 1, "tick still joined");
  assert.ok(logs.some((l) => /WARNING: schedule-state\.json was corrupt/.test(l)));
  assert.equal(keys(d).length, 1);
  console.log("REPLAY ISS-ALERTWHOFIX-001: damaged file preserved 1/1, WARNING 1/1, tick scheduled 1/1; the 4 history rows are unrecoverable from a truncated file");
  rmSync(d, { recursive: true, force: true });
});
