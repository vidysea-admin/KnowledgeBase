/** ISS-JOBQSTALL-002 (a lock whose owner died but whose pid answers -- a reused pid, or a terminated worker thread -- blocked writers for up to 1 h):
 *  replay of the ledger's recorded reproductions (S4 real unrelated live pid; S5 real worker thread terminated at the rename) + the injected-probe rule
 *  + the ISS-JOBQLOST-003 guarantees that must survive (a live, genuine holder is never displaced). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { FileJobQueue, type FileJobQueueOptions } from "./file-job-queue.js";
import { QUEUE_FILE, decodeQueue } from "./queue-store.js";
import { QUEUE_LOCK_FILE, QUEUE_LOCK_LIVE_CEILING_MS, QUEUE_LOCK_REUSE_SLACK_MS, QUEUE_LOCK_STALE_MS, QUEUE_LOCK_THREAD_LEASE_MS, defaultQueueStartTime } from "./queue-lock.js";
import { MemQueueFs } from "./mem-queue-fs.testkit.js";

const here = dirname(fileURLToPath(import.meta.url));
const STALE = QUEUE_LOCK_STALE_MS, CEIL = QUEUE_LOCK_LIVE_CEILING_MS, LEASE = QUEUE_LOCK_THREAD_LEASE_MS, SLACK = QUEUE_LOCK_REUSE_SLACK_MS;
const job = (id: string) => ({ id, tenantId: "t", payload: id });
const storedIds = (dir: string) => { const d = decodeQueue(readFileSync(join(dir, QUEUE_FILE), "utf8")); assert.ok(d.ok); return d.value.jobs.map(j => j.id).sort(); };
const ledgerRow = (id: string) => readFileSync(join(here, "../../../../qa/issues.jobqstall.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.id === id);
const code = (r: any) => r?.error?.code;

test("ISS-JOBQSTALL-002 recorded reproduction S4, verbatim: lock body {pid: a REAL live unrelated process, this host, at: now-10min}; the default-wait enqueue is no longer refused for 1 h", async () => {
  const row = ledgerRow("ISS-JOBQSTALL-002");
  assert.match(row.evidence, /\(S4\) lock body \{pid: a live unrelated process, host: this host, at: now-10min\}: enqueue with the default 2000 ms wait returns conflict after 2012 ms/);
  const dir = mkdtempSync(join(tmpdir(), "jq-jqpid-")); const live = spawn(process.execPath, ["-e", "setTimeout(()=>{},120000)"], { stdio: "ignore" });
  try {
    await new Promise(r => setTimeout(r, 300)); // the unrelated process exists NOW; the lock claims to have been written 10 min ago, i.e. before it was born
    const lockFile = join(dir, QUEUE_LOCK_FILE);
    writeFileSync(lockFile, JSON.stringify({ token: "dead-holder", pid: live.pid, host: hostname(), thread: 0, at: Date.now() - 10 * 60_000 }));
    const t0 = Date.now(); const r = new FileJobQueue({ dir, now: () => 1 }).enqueue(job("a")), took = Date.now() - t0; // DEFAULT 2000 ms wait, real probe, real clock
    assert.deepEqual(r, { ok: true, value: "enqueued" }); assert.deepEqual(storedIds(dir), ["a"]); assert.deepEqual(readdirSync(dir), [QUEUE_FILE]);
    console.log(`ISS-JOBQSTALL-002 S4: before = conflict after 2012 ms (taken over only at +1 h+1 s); now = ok in ${took} ms with the real start-time lookup; stored [a], no debris`);
    // the genuine holder (born BEFORE the lock was written) is still protected at +31 s and +59 min (ISS-JOBQLOST-003 side)
    const body = JSON.stringify({ token: "live-holder", pid: live.pid, host: hostname(), thread: 0, at: Date.now() }); writeFileSync(lockFile, body);
    for (const plus of [31_000, CEIL - 60_000]) {
      const g = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0, wallNow: () => Date.now() + plus }).enqueue(job("b"));
      assert.equal(code(g), "conflict", `genuine live holder at +${plus}`); assert.equal(readFileSync(lockFile, "utf8"), body);
    }
    assert.deepEqual(storedIds(dir), ["a"]);
  } finally { try { live.kill(); } catch { /* gone */ } rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-JOBQSTALL-002 recorded reproduction S5, verbatim: a REAL worker_thread blocked at the rename and terminate()d leaves its lock; writers recover after the lease, not after 1 h", async () => {
  const row = ledgerRow("ISS-JOBQSTALL-002");
  assert.match(row.evidence, /\(S5\) a worker thread blocked at the rename and then worker\.terminate\(\)d leaves its lock/);
  const dir = mkdtempSync(join(tmpdir(), "jq-jqpid-")); let w: Worker | null = null;
  try {
    w = new Worker(new URL("./file-job-queue.dead-thread.worker.ts", import.meta.url), { workerData: { dir }, execArgv: ["--import", "tsx"] });
    const seen: string[] = []; w.on("message", m => seen.push(String(m))); w.on("error", e => seen.push("error:" + e.message));
    for (let i = 0; i < 400 && !seen.includes("at-rename"); i++) await new Promise(r => setTimeout(r, 25));
    assert.ok(seen.includes("at-rename"), `worker reached the rename: ${seen}`);
    const held = JSON.parse(readFileSync(join(dir, QUEUE_LOCK_FILE), "utf8")); assert.equal(held.pid, process.pid); assert.ok(held.thread > 0, "the lock names a worker thread");
    await w.terminate(); w = null;
    assert.ok(!seen.some(m => m.startsWith("returned")), "the worker never finished");
    const at = (plus: number) => new FileJobQueue({ dir, now: () => 1, lockWaitMs: 300, wallNow: () => Date.now() + plus });
    const t0 = Date.now(); assert.equal(code(at(0).enqueue(job("p0"))), "conflict", "fresh: the thread might still be working"); const conflictMs = Date.now() - t0;
    assert.equal(code(at(LEASE - 5000).enqueue(job("p1"))), "conflict", "inside the lease");
    assert.deepEqual(at(LEASE + 1000).enqueue(job("p2")), { ok: true, value: "enqueued" });
    assert.deepEqual(storedIds(dir), ["p2"], "the dead worker's job was never acknowledged, the parent's is stored"); assert.deepEqual(readdirSync(dir).filter(f => f !== QUEUE_FILE && !/^job-queue.json.[0-9a-f-]{36}.tmp$/.test(f)), [], "no lock or claim left; only the killed worker's own temp file may remain (as for any crashed writer)"); assert.ok(readdirSync(dir).length <= 2);
    console.log(`ISS-JOBQSTALL-002 S5: before = conflict at +0 and +59 min 59 s, ok only at +1 h+1 s; now = conflict at +0 (${conflictMs} ms) and +${(LEASE - 5000) / 1000} s, ok at +${(LEASE + 1000) / 1000} s; stored [p2], no lock or claim left (the killed worker's own temp file remains)`);
  } finally { if (w) await w.terminate(); rmSync(dir, { recursive: true, force: true }); }
});

const W = { t: 50_000_000 };
const LOCK = `/q/${QUEUE_LOCK_FILE}`;
function mem(over: Partial<FileJobQueueOptions> = {}) {
  const fs = new MemQueueFs(); fs.wall = () => W.t;
  const q = (extra: Partial<FileJobQueueOptions> = {}) => new FileJobQueue({ dir: "/q", now: () => 1, fs, wallNow: () => W.t, lockWaitMs: 0, lockOwner: { host: "h1", pid: 100, thread: 0 }, lockIsAlive: () => "alive", ...over, ...extra });
  const hold = (body: object, ageMs: number) => { const s = JSON.stringify({ token: "other", at: W.t - ageMs, ...body }); fs.files.set(LOCK, s); fs.mtimes.set(LOCK, W.t - ageMs); return s; };
  return { fs, q, hold };
}
const OTHER = { pid: 200, host: "h1", thread: 0 };

test("pid reuse (injected start time): a live pid whose process started AFTER the lock was written is not the holder -> taken over once the lock is >= staleMs; a genuine holder (started before) never is", () => {
  let calls = 0; let startOf = 0;
  const { fs, q, hold } = mem({ lockStartTime: () => { calls++; return startOf; } });
  const lockedAt = (age: number) => W.t - age;
  // genuine holder: process started before the lock was written (or within the slack)
  for (const age of [STALE, 10 * 60_000, CEIL - 1, CEIL]) {
    for (const s of [lockedAt(age) - 5000, lockedAt(age), lockedAt(age) + SLACK]) {
      startOf = s; const body = hold(OTHER, age);
      assert.equal(code(q().enqueue(job("a"))), "conflict", `genuine holder, age ${age}, start ${s - lockedAt(age)}`); assert.equal(fs.files.get(LOCK), body);
    }
  }
  // reused pid: started more than the slack after the lock was written
  for (const age of [STALE, STALE + 1, 10 * 60_000, CEIL - 1]) {
    startOf = lockedAt(age) + SLACK + 1; hold(OTHER, age);
    assert.deepEqual(q().enqueue(job("r" + age)), { ok: true, value: "enqueued" }, `reused pid, age ${age}`);
    assert.deepEqual([...fs.files.keys()], [`/q/${QUEUE_FILE}`], "taken over, used, released, no debris");
  }
  // a young lock is never judged by identity (no probe call, so no cost on the hot path)
  calls = 0; startOf = W.t + 10 * CEIL; hold(OTHER, STALE - 1);
  assert.equal(code(q().enqueue(job("young"))), "conflict"); assert.equal(calls, 0, "no start-time lookup for a lock younger than staleMs");
  // one lookup per call even though judge runs several times
  calls = 0; hold(OTHER, 10 * 60_000); startOf = 0; assert.equal(code(q().enqueue(job("once"))), "conflict"); assert.equal(calls, 1);
  // ... and across all retries inside a wait budget (the judge runs on every retry; the lookup, a process spawn on Windows, must not)
  calls = 0; let clock = W.t; hold(OTHER, 10 * 60_000);
  assert.equal(code(q({ lockWaitMs: 300, wallNow: () => (clock += 60) }).enqueue(job("retries"))), "conflict"); assert.equal(calls, 1, "one lookup across all retries of one call");
});

test("pid reuse: an unavailable start time (null, NaN, throws) means unknown -> the old rule (never before the ceiling); a lock with no usable `at` is never judged reused", () => {
  for (const probe of [() => null, () => NaN, () => { throw new Error("no permission"); }, () => undefined as any]) {
    const { fs, q, hold } = mem({ lockStartTime: probe });
    const body = hold(OTHER, 10 * 60_000); assert.equal(code(q().enqueue(job("a"))), "conflict"); assert.equal(fs.files.get(LOCK), body);
    hold(OTHER, CEIL - 1); assert.equal(code(q().enqueue(job("a"))), "conflict");
    hold(OTHER, CEIL + 1); assert.equal(q().enqueue(job("a")).ok, true);
  }
  const { q, hold } = mem({ lockStartTime: () => 0 });
  hold({ ...OTHER, at: "x" }, 10 * 60_000); assert.equal(code(q().enqueue(job("a"))), "conflict");
});

test("dead worker thread (injected): a worker-thread holder (id > 0) is displaced once it has held the lock for the lease; before that, and for a main-thread or legacy (no thread) holder, it is not", () => {
  const { fs, q, hold } = mem();
  for (const age of [STALE, LEASE - 1]) { hold({ ...OTHER, thread: 4 }, age); assert.equal(code(q().enqueue(job("a"))), "conflict", `age ${age}`); }
  for (const thread of [0, null]) for (const age of [LEASE, 10 * LEASE, CEIL]) { const b = hold({ ...OTHER, thread }, age); assert.equal(code(q().enqueue(job("a"))), "conflict", `thread ${thread} age ${age}`); assert.equal(fs.files.get(LOCK), b); }
  hold({ pid: 100, host: "h1", thread: 4 }, LEASE); // a worker thread of THIS process
  assert.deepEqual(q().enqueue(job("a")), { ok: true, value: "enqueued" }); assert.deepEqual([...fs.files.keys()], [`/q/${QUEUE_FILE}`]);
  const { q: q2, hold: hold2, fs: fs2 } = mem({ lockThreadLeaseMs: 5 * STALE });
  hold2({ ...OTHER, thread: 4 }, 4 * STALE); assert.equal(code(q2().enqueue(job("a"))), "conflict", "configurable lease");
  hold2({ ...OTHER, thread: 4 }, 5 * STALE); assert.equal(q2().enqueue(job("a")).ok, true); assert.deepEqual([...fs2.files.keys()], [`/q/${QUEUE_FILE}`]);
});

test("a holder that is inside its call on THIS thread (nested use) is live by construction: neither the lease nor the start-time rule displaces it", () => {
  const { fs, q } = mem({ lockOwner: { host: "h1", pid: 100, thread: 3 }, lockStartTime: () => W.t + CEIL });
  let rb: any = null, hooked = false; const read = fs.read.bind(fs);
  fs.read = (p: string) => { const r = read(p); if (!hooked && p.endsWith(QUEUE_FILE)) { hooked = true; rb = q({ wallNow: () => W.t + 10 * LEASE }).enqueue(job("fromB")); } return r; };
  const ra = q().enqueue(job("fromA"));
  assert.equal(ra.ok, true); assert.equal(code(rb), "conflict");
  const d = decodeQueue(fs.files.get(`/q/${QUEUE_FILE}`)!); assert.ok(d.ok); assert.deepEqual(d.value.jobs.map(j => j.id), ["fromA"]);
});

test("a holder displaced as a reused pid / expired lease while it is mid-operation gets conflict and writes nothing; the displacer's acknowledged write survives (token + content re-check kept)", () => {
  for (const [name, holderThread, extra] of [["reused pid", 0, { lockStartTime: (p: number) => (p === 200 ? W.t + 2 * SLACK : null) }], ["worker lease", 4, {}]] as const) {
    const { fs, q } = mem(extra);
    const A = q({ lockOwner: { host: "h1", pid: 200, thread: holderThread }, lockStartTime: () => null }); let hooked = false, rb: any = null;
    const read = fs.read.bind(fs);
    fs.read = (p: string) => { const r = read(p); if (!hooked && p.endsWith(QUEUE_FILE)) { hooked = true; rb = q({ wallNow: () => W.t + LEASE + 1000, ...extra }).enqueue(job("fromB")); } return r; };
    const ra = A.enqueue(job("fromA")) as any;
    assert.equal(rb?.ok, true, `${name}: ${JSON.stringify(rb)}`); assert.equal(code(ra), "conflict", name);
    const d = decodeQueue(fs.files.get(`/q/${QUEUE_FILE}`)!); assert.ok(d.ok); assert.deepEqual(d.value.jobs.map(j => j.id), ["fromB"], name);
    assert.deepEqual([...fs.files.keys()].sort(), [`/q/${QUEUE_FILE}`], `${name}: no lock, claim or temp debris`);
  }
});

test("default start-time source: own pid ~ process start, a really live child between its spawn and now, a dead or bad pid null; measured cost of the foreign-pid lookup", async () => {
  const mine = defaultQueueStartTime(process.pid)!; assert.ok(Math.abs(mine - (Date.now() - process.uptime() * 1000)) < 1000);
  for (const bad of [0, -1, 1.5, NaN, 2 ** 40]) assert.equal(defaultQueueStartTime(bad), null, String(bad));
  const spawnedAt = Date.now(); const kid = spawn(process.execPath, ["-e", "setTimeout(()=>{},60000)"], { stdio: "ignore" });
  try {
    await new Promise(r => setTimeout(r, 300));
    const t0 = Date.now(); const s = defaultQueueStartTime(kid.pid!), cost = Date.now() - t0;
    assert.ok(s !== null && s >= spawnedAt - 2000 && s <= Date.now() + 1000, `child start ${s} vs spawn ${spawnedAt}`);
    kid.kill(); await new Promise(r => kid.on("close", r));
    assert.equal(defaultQueueStartTime(kid.pid!), null, "dead pid");
    console.log(`default start-time lookup of a foreign pid on ${process.platform}: ${cost} ms (child start - spawn = ${s! - spawnedAt} ms)`);
  } finally { try { kid.kill(); } catch { /* gone */ } }
});
