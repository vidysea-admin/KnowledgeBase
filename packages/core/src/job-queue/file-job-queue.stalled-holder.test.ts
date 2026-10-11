/** ISS-JOBQLOST-003 (a holder stalled past the takeover age is displaced by age alone, and its late rename clobbers an acknowledged write):
 *  verbatim replay of the checker's recorded reproduction + the pid/host-aware takeover rule + the residual window, pinned. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileJobQueue, type FileJobQueueOptions } from "./file-job-queue.js";
import { QUEUE_FILE, decodeQueue, realQueueFs, type QueueFs } from "./queue-store.js";
import { QUEUE_LOCK_FILE, QUEUE_LOCK_LIVE_CEILING_MS, QUEUE_LOCK_STALE_MS } from "./queue-lock.js";
import { MemQueueFs } from "./mem-queue-fs.testkit.js";

const here = dirname(fileURLToPath(import.meta.url));
const storedIds = (dir: string) => { const d = decodeQueue(readFileSync(join(dir, QUEUE_FILE), "utf8")); assert.ok(d.ok); return d.value.jobs.map(j => j.id).sort(); };
const job = (id: string) => ({ id, tenantId: "t", payload: id });
const STALE = QUEUE_LOCK_STALE_MS, CEIL = QUEUE_LOCK_LIVE_CEILING_MS;

test("ISS-JOBQLOST-003 recorded reproduction, verbatim: B (wallNow +31 s, lockWaitMs 0) enqueues exactly at A's tmp->queue rename on the real fs; at EVERY fs call of A's enqueue no acknowledged write is lost", () => {
  const row = readFileSync(join(here, "../../../../qa/issues.jobqlost.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.id === "ISS-JOBQLOST-003");
  assert.match(row.evidence, /second FileJobQueue\.enqueue \(wallNow \+31 s, lockWaitMs 0\) exactly at A's tmp->queue rename/);
  assert.match(row.evidence, /A ok 'enqueued', B ok 'enqueued', stored ids \[fromA\]; B's acknowledged job is lost/);
  const run = (hookAt: number | null) => {
    const dir = mkdtempSync(join(tmpdir(), "jq-jqstall-"));
    try {
      let n = 0, inHook = false, rb: any = null; const ops: string[] = [];
      const B = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0, wallNow: () => Date.now() + 31_000 });
      const hooked: QueueFs = new Proxy(realQueueFs, { get(t, p: keyof QueueFs) { return (...a: any[]) => {
        if (!inHook) { const i = n++; ops[i] = String(p) + (p === "rename" ? ":" + String(a[0]).split(/[\\/]/).pop()!.replace(/\.[0-9a-f-]{36}\./, ".<uuid>.") : ""); if (i === hookAt) { inHook = true; try { rb = B.enqueue(job("fromB")); } finally { inHook = false; } } }
        return (t[p] as any)(...a);
      }; } });
      const ra = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0, fs: hooked }).enqueue(job("fromA"));
      const files = readdirSync(dir).sort();
      return { ra, rb, ids: storedIds(dir), n, ops, files };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const base = run(null); assert.ok(base.ops.some(o => o.startsWith("rename:job-queue.json.")), "the queue rename is among the hook points");
  let safe = 0, bConflict = 0, bStored = 0;
  for (let k = 0; k < base.n; k++) {
    const r = run(k);
    assert.equal(r.ra.ok, true, `hook ${k} (${base.ops[k]}): A is never displaced`); assert.ok(r.ids.includes("fromA"));
    if (r.rb?.ok) assert.ok(r.ids.includes("fromB"), `hook ${k} (${base.ops[k]}): B reported ok but its job is missing (the lost update): ${r.ids}`);
    else if (r.rb) { assert.equal(r.rb.error.code, "conflict"); assert.ok(!r.ids.includes("fromB")); bConflict++; }
    if (r.ids.includes("fromB")) bStored++;
    assert.deepEqual(r.files, [QUEUE_FILE], `hook ${k}: no lock, claim or temp debris`);
    safe++;
  }
  assert.equal(safe, base.n);
  const atRename = run(base.ops.findIndex(o => o.startsWith("rename:job-queue.json.")));
  assert.equal(atRename.ra.ok, true); assert.equal((atRename.rb as any).error.code, "conflict"); assert.deepEqual(atRename.ids, ["fromA"]);
  console.log(`ISS-JOBQLOST-003 reproduction: ${safe}/${base.n} hook points lose nothing (B conflict at ${bConflict}, B stored at ${bStored}); at the rename: A ok, B ${(atRename.rb as any).error.code}, stored ${atRename.ids}`);
});

const W = { t: 50_000_000 };
const ME = { host: "h1", pid: 100, thread: 0 };
const LOCK = `/q/${QUEUE_LOCK_FILE}`;
function mem(over: Partial<FileJobQueueOptions> = {}) {
  const fs = new MemQueueFs(); fs.wall = () => W.t;
  const q = (extra: Partial<FileJobQueueOptions> = {}) => new FileJobQueue({ dir: "/q", now: () => 1, fs, wallNow: () => W.t, lockWaitMs: 0, lockOwner: ME, lockIsAlive: () => "alive", ...over, ...extra });
  const hold = (body: object, ageMs: number) => { const s = JSON.stringify({ token: "other", at: W.t - ageMs, ...body }); fs.files.set(LOCK, s); fs.mtimes.set(LOCK, W.t - ageMs); return s; };
  return { fs, q, hold };
}
const jobKeys = (fs: MemQueueFs) => [...fs.files.keys()].filter(k => k.endsWith(QUEUE_FILE));

test("live holder on this host (another pid) is never displaced below the ceiling, at 31 s or just under 1 h; above the ceiling it is", () => {
  const { fs, q, hold } = mem();
  for (const age of [STALE, STALE + 1, 10 * STALE, CEIL - 1, CEIL]) {
    const s = hold({ pid: 200, host: "h1", thread: 0 }, age);
    assert.equal((q().enqueue(job("a")) as any).error.code, "conflict", `age ${age}`); assert.equal(fs.files.get(LOCK), s); assert.deepEqual(jobKeys(fs), []);
  }
  hold({ pid: 200, host: "h1", thread: 0 }, CEIL + 1);
  assert.deepEqual(q().enqueue(job("a")), { ok: true, value: "enqueued" });
  assert.deepEqual([...fs.files.keys()], [`/q/${QUEUE_FILE}`], "taken over, used, released, no claim or lock debris");
});
test("another THREAD of this process (same pid, other thread id) is a live holder too; the holder's own thread leftover (not held) is taken over after staleMs", () => {
  const { fs, q, hold } = mem();
  hold({ pid: 100, host: "h1", thread: 3 }, 10 * STALE);
  assert.equal((q().enqueue(job("a")) as any).error.code, "conflict");
  hold({ pid: 100, host: "h1", thread: 0 }, STALE - 1);
  assert.equal((q().enqueue(job("a")) as any).error.code, "conflict", "own leftover, still young");
  hold({ pid: 100, host: "h1", thread: 0 }, STALE);
  assert.deepEqual(q().enqueue(job("a")), { ok: true, value: "enqueued" }); assert.deepEqual([...fs.files.keys()], [`/q/${QUEUE_FILE}`]);
});
test("dead holder on this host is taken over at once, at any age; the probe saying unknown falls back to staleMs; other host and legacy body (no pid) need staleMs", () => {
  const { fs, q, hold } = mem({ lockIsAlive: p => (p === 300 ? "dead" : p === 400 ? "unknown" : "alive") });
  hold({ pid: 300, host: "h1", thread: 0 }, 0);
  assert.deepEqual(q().enqueue(job("a")), { ok: true, value: "enqueued" }); assert.ok(!fs.files.has(LOCK));
  hold({ pid: 400, host: "h1", thread: 0 }, STALE - 1); assert.equal((q().enqueue(job("b")) as any).error.code, "conflict");
  hold({ pid: 400, host: "h1", thread: 0 }, STALE); assert.equal(q().enqueue(job("b")).ok, true);
  hold({ pid: 200, host: "h2", thread: 0 }, STALE - 1); assert.equal((q().enqueue(job("c")) as any).error.code, "conflict");
  hold({ pid: 200, host: "h2", thread: 0 }, STALE); assert.equal(q().enqueue(job("c")).ok, true);
  hold({}, STALE - 1); assert.equal((q().enqueue(job("d")) as any).error.code, "conflict");
  hold({}, STALE); assert.equal(q().enqueue(job("d")).ok, true);
  assert.deepEqual([...fs.files.keys()], [`/q/${QUEUE_FILE}`]);
});
test("a lock `at` in the far future is never old; a live claim by another taker blocks, a claim of a dead taker is removed and the takeover goes through", () => {
  const { fs, q, hold } = mem({ lockIsAlive: p => (p === 300 ? "dead" : "alive") });
  const s = hold({ pid: 200, host: "h1", thread: 0, at: W.t + 10 * CEIL }, 0); fs.mtimes.set(LOCK, W.t); // mtime is now: young
  assert.equal((q().enqueue(job("a")) as any).error.code, "conflict"); assert.equal(fs.files.get(LOCK), s);
  const dead = hold({ pid: 300, host: "h1", thread: 0 }, 5);
  const claim = `${LOCK}.claim.other`;
  fs.files.set(claim, JSON.stringify({ token: "taker", pid: 200, host: "h1", thread: 0, at: W.t })); fs.mtimes.set(claim, W.t);
  assert.equal((q().enqueue(job("a")) as any).error.code, "conflict", "live taker's claim blocks"); assert.equal(fs.files.get(LOCK), dead);
  fs.files.set(claim, JSON.stringify({ token: "taker", pid: 300, host: "h1", thread: 0, at: W.t }));
  assert.deepEqual(q().enqueue(job("a")), { ok: true, value: "enqueued" }); assert.deepEqual([...fs.files.keys()], [`/q/${QUEUE_FILE}`], "dead taker's claim reaped");
});
test("takeover re-checks the lock bytes: a lock replaced between judgement and claim is not taken over and the claim is dropped", () => {
  const { fs, q, hold } = mem({ lockIsAlive: p => (p === 300 ? "dead" : "alive") });
  hold({ pid: 300, host: "h1", thread: 0 }, 0); const fresh = JSON.stringify({ token: "fresh", pid: 200, host: "h1", thread: 0, at: W.t });
  const create = fs.create.bind(fs);
  fs.create = (p: string, d: string) => { create(p, d); if (p.includes(".claim.")) fs.files.set(LOCK, fresh); }; // a live writer re-locks right after our claim
  assert.equal((q().enqueue(job("a")) as any).error.code, "conflict");
  assert.equal(fs.files.get(LOCK), fresh, "the live lock is untouched"); assert.deepEqual([...fs.files.keys()].filter(k => k.includes(".claim.")), [], "claim dropped"); assert.deepEqual(jobKeys(fs), []);
});

test("a writer displaced mid-operation (ceiling exceeded, i.e. a reused pid) returns conflict and writes nothing; the displacer's acknowledged write survives", () => {
  const { fs, q } = mem();
  const A = q({ wallNow: () => W.t }); let hooked = false, rb: any = null;
  const read = fs.read.bind(fs);
  fs.read = (p: string) => {
    const r = read(p);
    if (!hooked && p.endsWith(QUEUE_FILE)) { hooked = true; rb = q({ wallNow: () => W.t + CEIL + 1 }).enqueue(job("fromB")); } // A has loaded; B gets past the ceiling, takes over, writes, releases
    return r;
  };
  const ra = A.enqueue(job("fromA")) as any;
  assert.equal(rb.ok, true, JSON.stringify(rb)); assert.equal(ra.ok, false); assert.equal(ra.error.code, "conflict");
  const d = decodeQueue(fs.files.get(`/q/${QUEUE_FILE}`)!); assert.ok(d.ok); assert.deepEqual(d.value.jobs.map(j => j.id), ["fromB"]);
  assert.deepEqual([...fs.files.keys()].sort(), [`/q/${QUEUE_FILE}`], "no lock, claim or temp debris");
});

test("RESIDUAL, PINNED (ISS-JOBQSTALL-001): a holder displaced by the ceiling that stalls AFTER its last check, exactly at the rename, still clobbers the newer write (A ok, B ok, one stored)", () => {
  const dir = mkdtempSync(join(tmpdir(), "jq-jqstall-"));
  try {
    let rb: any = null;
    const hooked: QueueFs = new Proxy(realQueueFs, { get(t, p: keyof QueueFs) { return (...a: any[]) => {
      if (p === "rename" && String(a[0]).endsWith(".tmp")) rb = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0, wallNow: () => Date.now() + CEIL + 1000 }).enqueue(job("fromB"));
      return (t[p] as any)(...a);
    }; } });
    const ra = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0, fs: hooked }).enqueue(job("fromA"));
    assert.equal(ra.ok, true); assert.equal(rb.ok, true);
    assert.deepEqual(storedIds(dir), ["fromA"], "if this ever fails because B survives, the residual was closed: update the header, the manifest and this test");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("real pid probe: a lock owned by a dead process is taken over at once; one owned by a live process is not displaced at +31 s; a stale lock without pid still is", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jq-jqstall-")); const kids: ReturnType<typeof spawn>[] = [];
  const lockFile = join(dir, QUEUE_LOCK_FILE);
  const owned = (pid: number, at: number) => JSON.stringify({ token: "kid", pid, host: hostname(), thread: 0, at });
  try {
    const dead = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" }); kids.push(dead);
    await new Promise(r => dead.on("close", r));
    writeFileSync(lockFile, owned(dead.pid!, Date.now()));
    assert.deepEqual(new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0 }).enqueue(job("a")), { ok: true, value: "enqueued" });
    const live = spawn(process.execPath, ["-e", "setTimeout(()=>{},120000)"], { stdio: "ignore" }); kids.push(live);
    await new Promise(r => setTimeout(r, 100));
    const body = owned(live.pid!, Date.now()); writeFileSync(lockFile, body);
    const r = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0, wallNow: () => Date.now() + 31_000 }).enqueue(job("b"));
    assert.equal((r as any).error.code, "conflict"); assert.equal(readFileSync(lockFile, "utf8"), body); assert.deepEqual(storedIds(dir), ["a"]);
    writeFileSync(lockFile, JSON.stringify({ token: "legacy", at: Date.now() - 31_000 }));
    assert.equal(new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0 }).enqueue(job("b")).ok, true);
    assert.deepEqual(storedIds(dir), ["a", "b"]); assert.deepEqual(readdirSync(dir), [QUEUE_FILE]);
  } finally { for (const k of kids) { try { k.kill(); } catch { /* already gone */ } } rmSync(dir, { recursive: true, force: true }); }
});

test("takeover is confirmed by token after the rename: if another writer's lock sits there instead, we are not the holder (conflict, nothing written, their lock intact)", () => {
  const { fs, q, hold } = mem({ lockIsAlive: p => (p === 300 ? "dead" : "alive") });
  hold({ pid: 300, host: "h1", thread: 0 }, 0); const theirs = JSON.stringify({ token: "theirs", pid: 200, host: "h1", thread: 0, at: W.t });
  const rename = fs.rename.bind(fs);
  fs.rename = (a: string, b: string) => { rename(a, b); if (b.endsWith(QUEUE_LOCK_FILE)) fs.files.set(LOCK, theirs); };
  assert.equal((q().enqueue(job("a")) as any).error.code, "conflict");
  assert.equal(fs.files.get(LOCK), theirs); assert.deepEqual(jobKeys(fs), []); assert.deepEqual([...fs.files.keys()].filter(k => k.includes(".claim.")), []);
});
