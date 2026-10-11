/** ISS-JOBQUEUE-002 (lost update between the pre-rename re-read and the rename): replay of the ledger's recorded reproduction + real multi-process + lock protocol. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE, decodeQueue, realQueueFs, type QueueFs } from "./queue-store.js";
import { QUEUE_LOCK_FILE } from "./queue-lock.js";
import { MemQueueFs } from "./mem-queue-fs.testkit.js";

const here = dirname(fileURLToPath(import.meta.url));
const storedIds = (dir: string) => { const d = decodeQueue(readFileSync(join(dir, QUEUE_FILE), "utf8")); assert.ok(d.ok); return d.value.jobs.map(j => j.id).sort(); };

test("ISS-JOBQUEUE-002 recorded reproduction, verbatim: a second FileJobQueue.enqueue on the same dir at EACH fs call of the first instance's enqueue loses nothing", () => {
  const row = readFileSync(join(here, "../../../../qa/issues.jobqueue.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.id === "ISS-JOBQUEUE-002");
  assert.match(row.evidence, /Real-fs test with an fs wrapper running a second FileJobQueue\.enqueue on the same dir at each fs call of the first instance's enqueue/);
  assert.match(row.evidence, /a hook exactly at rename loses the other instance's job/);
  const run = (hookAt: number | null) => {
    const dir = mkdtempSync(join(tmpdir(), "jq-jqlost-"));
    try {
      let n = 0, inHook = false, rb: any = null; const ops: string[] = [];
      const B = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0 }); // the second instance: no waiting (same thread, it cannot wait for A)
      const hooked: QueueFs = new Proxy(realQueueFs, { get(t, p: keyof QueueFs) { return (...a: any[]) => {
        if (!inHook) { const i = n++; ops[i] = String(p); if (i === hookAt) { inHook = true; try { rb = B.enqueue({ id: "fromB", tenantId: "t", payload: "b" }); } finally { inHook = false; } } }
        return (t[p] as any)(...a);
      }; } });
      const A = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0, fs: hooked });
      const ra = A.enqueue({ id: "fromA", tenantId: "t", payload: "a" });
      return { ra, rb, ids: storedIds(dir), n, ops };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const base = run(null); assert.ok(base.n >= 6, `fs calls in one enqueue: ${base.n}`); assert.ok(base.ops.includes("rename"));
  let safe = 0, bStored = 0, aRefused = 0;
  for (let k = 0; k < base.n; k++) {
    const r = run(k);
    if (r.ra.ok) assert.ok(r.ids.includes("fromA"), `hook ${k} (${base.ops[k]}): A reported enqueued but its job is missing: ${r.ids}`);
    else { assert.equal(r.ra.error.code, "conflict", `hook ${k}`); assert.ok(!r.ids.includes("fromA"), `hook ${k}: A reported a failure but stored its job`); aRefused++; }
    if (r.rb?.ok) assert.ok(r.ids.includes("fromB"), `hook ${k} (${base.ops[k]}): B reported enqueued but its job is missing (the lost update): ${r.ids}`);
    if (r.ids.includes("fromB")) bStored++;
    assert.ok(r.ids.length >= 1 && r.ids.every(i => i === "fromA" || i === "fromB"));
    safe++;
  }
  assert.equal(safe, base.n);
  console.log(`ISS-JOBQUEUE-002 reproduction: ${safe}/${base.n} hook points lose nothing (A refused as conflict at ${aRefused}, B stored at ${bStored}); ops: ${base.ops.join(",")}`);
});

test("a competing enqueue while the lock is held (exactly at A's rename) is refused with a typed conflict, never applied to a stale view", () => {
  const dir = mkdtempSync(join(tmpdir(), "jq-jqlost-"));
  try {
    let hits = 0;
    const hooked: QueueFs = new Proxy(realQueueFs, { get(t, p: keyof QueueFs) { return (...a: any[]) => {
      if (p === "rename" && String(a[0]).endsWith(".tmp")) {
        hits++; const b = new FileJobQueue({ dir, now: () => 1, lockWaitMs: 0 }).enqueue({ id: "fromB", tenantId: "t", payload: 1 });
        assert.equal((b as any).error.code, "conflict"); assert.match((b as any).error.message, /locked/);
      }
      return (t[p] as any)(...a);
    }; } });
    assert.deepEqual(new FileJobQueue({ dir, now: () => 1, fs: hooked }).enqueue({ id: "fromA", tenantId: "t", payload: 1 }), { ok: true, value: "enqueued" });
    assert.equal(hits, 1); assert.deepEqual(storedIds(dir), ["fromA"]); assert.ok(!readdirSync(dir).includes(QUEUE_LOCK_FILE), "lock released");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("real processes: 3 child processes x 10 enqueue+claim+complete on one directory lose no job and leave a decodable file and no lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jq-jqlost-"));
  try {
    const run = (prefix: string) => new Promise<{ enq: string[]; bad: string[] }>((res, rej) => {
      const c = spawn(process.execPath, ["--import", "tsx", join(here, "file-job-queue.lost-update.child.ts"), dir, prefix, "10"], { cwd: join(here, "../.."), stdio: ["ignore", "pipe", "inherit"] });
      let out = ""; c.stdout.on("data", d => { out += d; }); c.on("error", rej);
      c.on("close", code => code === 0 ? res(JSON.parse(out)) : rej(new Error(`child ${prefix} exit ${code}`)));
    });
    const rs = await Promise.all(["a", "b", "c"].map(run));
    for (const r of rs) assert.deepEqual(r.bad, [], "no child saw a conflict or error within its 20 s wait");
    const want = rs.flatMap(r => r.enq).sort(); assert.equal(want.length, 30);
    assert.deepEqual(storedIds(dir), want, "every job any process enqueued is in the file");
    assert.deepEqual(readdirSync(dir).filter(f => f !== QUEUE_FILE), [], "no lock or temp debris");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const W = { t: 10_000_000 };
function mem() { const fs = new MemQueueFs(); fs.wall = () => W.t; return { fs, q: () => new FileJobQueue({ dir: "/q", now: () => 1, fs, wallNow: () => W.t, lockWaitMs: 0 }) }; }
const LOCK = `/q/${QUEUE_LOCK_FILE}`;

test("lock protocol: live lock refuses; stale lock (>= staleMs) is taken over; lock is released after every outcome; a live foreign lock is left alone", () => {
  const { fs, q } = mem();
  const live = JSON.stringify({ token: "x", at: W.t - 1000 });
  fs.files.set(LOCK, live); fs.mtimes.set(LOCK, W.t - 1000);
  const r = q().enqueue({ id: "a", tenantId: "t", payload: 1 }) as any;
  assert.equal(r.error.code, "conflict"); assert.equal(fs.files.get(LOCK), live); assert.ok(!fs.files.has(`/q/${QUEUE_FILE}`));
  fs.files.set(LOCK, JSON.stringify({ token: "x", at: W.t - 30_000 }));
  assert.deepEqual(q().enqueue({ id: "a", tenantId: "t", payload: 1 }), { ok: true, value: "enqueued" });
  assert.deepEqual([...fs.files.keys()], [`/q/${QUEUE_FILE}`], "taken over, used, released, no debris");
  assert.deepEqual(q().enqueue({ id: "a", tenantId: "t", payload: 1 }), { ok: true, value: "exists" }); assert.ok(!fs.files.has(LOCK), "released after a no-op");
  assert.equal((q().claim("bad/id") as any).error.code, "invalid-input"); assert.ok(!fs.files.has(LOCK));
});
test("unparseable lock: aged by mtime (conflict when young or when the fs gives no mtime, takeover when old)", () => {
  const { fs, q } = mem();
  fs.files.set(LOCK, "{"); fs.mtimes.set(LOCK, W.t - 5);
  assert.equal((q().enqueue({ id: "a", tenantId: "t", payload: 1 }) as any).error.code, "conflict");
  fs.mtimes.set(LOCK, W.t - 40_000);
  assert.equal(q().enqueue({ id: "a", tenantId: "t", payload: 1 }).ok, true);
  fs.files.set(LOCK, "{"); fs.mtimes.delete(LOCK);
  assert.equal((q().enqueue({ id: "b", tenantId: "t", payload: 1 }) as any).error.code, "conflict");
});
test("a lock taken over while held is detected before the rename: conflict, queue file untouched, foreign lock not released", () => {
  const { fs, q } = mem(); q().enqueue({ id: "a", tenantId: "t", payload: 1 }); const before = fs.files.get(`/q/${QUEUE_FILE}`);
  const realRead = fs.read.bind(fs); let seenJson = false;
  fs.read = (p: string) => { if (p.endsWith(QUEUE_FILE)) seenJson = true; else if (seenJson && p.split("\\").join("/") === LOCK) fs.files.set(LOCK, JSON.stringify({ token: "thief", at: W.t })); return realRead(p); };
  const r = q().enqueue({ id: "b", tenantId: "t", payload: 1 }) as any;
  assert.equal(r.error.code, "conflict"); assert.match(r.error.message, /lock was lost/); assert.equal(fs.files.get(`/q/${QUEUE_FILE}`), before);
  assert.match(fs.files.get(LOCK) ?? "", /thief/, "we did not release a lock that is no longer ours");
});
