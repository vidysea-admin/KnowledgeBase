/** ISS-JOBQLOST-004: EPERM/EBUSY/EACCES while CREATING the lock is contention (retry within the wait budget, then typed conflict); an unwritable dir is io-error, promptly. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE } from "./queue-store.js";
import { QUEUE_LOCK_FILE } from "./queue-lock.js";
import { MemQueueFs } from "./mem-queue-fs.testkit.js";

const codes = ["EPERM", "EBUSY", "EACCES"] as const;
const DIR = "/q";
const LOCK = `${DIR}/${QUEUE_LOCK_FILE}`;
const job = { id: "j1", tenantId: "t", payload: 1 };
/** MemQueueFs whose LOCK create fails with `code` while `failing()` is true (the real attempt is not made, as when the OS refuses it). */
function flaky(code: string, failing: (n: number) => boolean) {
  const fs = new MemQueueFs(); let lockCreates = 0;
  const orig = fs.create.bind(fs);
  fs.create = (p: string, d: string) => {
    if (p.split("\\").join("/") === LOCK && failing(lockCreates++)) throw Object.assign(new Error(`${code}: operation not permitted, open ${p}`), { code });
    orig(p, d);
  };
  return { fs, attempts: () => lockCreates };
}
const jobFiles = (fs: MemQueueFs) => [...fs.files.keys()].filter(k => k.endsWith(QUEUE_FILE));

for (const code of codes) {
  test(`${code} on lock create, lock file absent (delete just finished) x3 then success: the operation succeeds`, () => {
    const { fs, attempts } = flaky(code, n => n < 3);
    assert.deepEqual(new FileJobQueue({ dir: DIR, now: () => 1, fs, lockWaitMs: 2000 }).enqueue(job), { ok: true, value: "enqueued" });
    assert.equal(attempts(), 4); assert.equal(jobFiles(fs).length, 1); assert.ok(!fs.files.has(LOCK), "lock released");
  });
  test(`${code} on lock create while a (delete-pending) lock file is present, 12 times then it vanishes: succeeds, not bounded by the absent-lock cap`, () => {
    const { fs, attempts } = flaky(code, n => n < 12);
    fs.files.set(LOCK, JSON.stringify({ token: "other", at: 1 })); fs.mtimes.set(LOCK, 1);
    const origCreate = fs.create; fs.create = (p: string, d: string) => { if (attempts() === 11) fs.files.delete(LOCK); origCreate(p, d); };
    const r = new FileJobQueue({ dir: DIR, now: () => 1, fs, lockWaitMs: 5000, wallNow: () => 2 }).enqueue(job);
    assert.deepEqual(r, { ok: true, value: "enqueued" }); assert.equal(jobFiles(fs).length, 1);
  });
  test(`${code} on lock create past the wait budget: typed conflict (never io-error) and nothing written`, () => {
    const { fs } = flaky(code, () => true);
    fs.files.set(LOCK, JSON.stringify({ token: "other", at: Date.now() })); fs.mtimes.set(LOCK, Date.now());
    const t0 = Date.now();
    const r = new FileJobQueue({ dir: DIR, now: () => 1, fs, lockWaitMs: 80, lockStaleMs: 60_000 }).enqueue(job);
    assert.equal((r as any).ok, false); assert.equal((r as any).error.code, "conflict"); assert.match((r as any).error.message, /locked/);
    assert.ok(Date.now() - t0 < 2000, "bounded by the wait budget"); assert.deepEqual(jobFiles(fs), []);
  });
  test(`${code} on lock create with NO lock file ever present (directory not writable): io-error promptly, bounded retries, nothing written`, () => {
    const { fs, attempts } = flaky(code, () => true);
    const t0 = Date.now();
    const r = new FileJobQueue({ dir: DIR, now: () => 1, fs, lockWaitMs: 20_000 }).enqueue(job);
    assert.equal((r as any).ok, false); assert.equal((r as any).error.code, "io-error"); assert.match((r as any).error.message, new RegExp(code));
    assert.ok(attempts() <= 8, `bounded: ${attempts()} create attempts`); assert.ok(Date.now() - t0 < 1000, `prompt, not the 20 s budget: ${Date.now() - t0} ms`);
    assert.deepEqual(jobFiles(fs), []);
  });
}

test("other lock-create errors (ENOSPC, EIO) stay io-error at once", () => {
  for (const code of ["ENOSPC", "EIO"]) {
    const { fs, attempts } = flaky(code, () => true);
    const r = new FileJobQueue({ dir: DIR, now: () => 1, fs, lockWaitMs: 20_000 }).enqueue(job);
    assert.equal((r as any).error.code, "io-error"); assert.equal(attempts(), 1);
  }
});

for (const code of codes) {
  test(`lock exists but reading it fails with ${code} (delete-pending): retried; succeeds when it clears, typed conflict if it never does`, () => {
    for (const forever of [false, true]) {
      const fs = new MemQueueFs(); let reads = 0, cleared = false;
      fs.files.set(LOCK, JSON.stringify({ token: "other", at: Date.now() })); fs.mtimes.set(LOCK, Date.now());
      const read = fs.read.bind(fs);
      fs.read = (p: string) => {
        if (p.split("\\").join("/") === LOCK && (forever || (reads < 4 && ++reads))) throw Object.assign(new Error(`${code}: operation not permitted, open ${p}`), { code });
        if (p.split("\\").join("/") === LOCK && reads === 4 && !cleared) { cleared = true; fs.files.delete(LOCK); }
        return read(p);
      };
      const r: any = new FileJobQueue({ dir: DIR, now: () => 1, fs, lockWaitMs: forever ? 300 : 5000, lockStaleMs: 60_000 }).enqueue(job); // ISS-JOBQPID-003: the clearing case needs 4 backoffs of 5-20 ms each, which Windows rounds to ~15.6 ms ticks (>= ~62-80 ms): a budget of 80 raced it. Only the never-clears case depends on the budget.
      if (forever) { assert.equal(r.error.code, "conflict"); assert.deepEqual(jobFiles(fs), []); } else assert.deepEqual(r, { ok: true, value: "enqueued" });
    }
  });
}
test("a non-transient error reading an existing lock stays io-error", () => {
  const fs = new MemQueueFs(); fs.files.set(LOCK, "{}"); const read = fs.read.bind(fs);
  fs.read = (p: string) => { if (p.split("\\").join("/") === LOCK) throw Object.assign(new Error("EIO"), { code: "EIO" }); return read(p); };
  assert.equal((new FileJobQueue({ dir: DIR, now: () => 1, fs, lockWaitMs: 20_000 }).enqueue(job) as any).error.code, "io-error");
});
