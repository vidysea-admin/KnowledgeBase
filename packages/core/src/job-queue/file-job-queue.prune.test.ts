/** ISS-JOBQLOST-001: opt-in pruning of terminal jobs, inside the existing lock and the operation's single atomic save. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE, decodeQueue } from "./queue-store.js";
import { MemQueueFs, SimulatedCrash } from "./mem-queue-fs.testkit.js";

const KEEP = 1000;
const FILE = `/q/${QUEUE_FILE}`;
function mk(prune: number | null = KEEP) {
  const fs = new MemQueueFs(); const c = { t: 10_000 };
  const q = new FileJobQueue({ dir: "/q", now: () => c.t, leaseMs: 100, fs, pruneTerminalAfterMs: prune ?? undefined });
  const state = () => JSON.parse(fs.files.get(FILE)!) as { nextSeq: number; jobs: any[] };
  const ids = () => state().jobs.map(j => j.id);
  /** enqueue + claim + complete (or fail to dead) one job for `tenant`. */
  const finish = (id: string, tenant: string, how: "done" | "dead" = "done") => {
    assert.equal((q.enqueue({ id, tenantId: tenant, payload: id, maxAttempts: 1 }) as any).ok, true);
    const j = (q.claim("w", { tenantId: tenant }) as any).value; assert.equal(j.id, id);
    const ref = { id, workerId: "w", attempt: j.attempt, tenantId: tenant };
    assert.equal(((how === "done" ? q.complete(ref) : q.fail(ref, "boom")) as any).ok, true);
  };
  return { fs, c, q, state, ids, finish };
}

test("default (option unset): nothing is ever removed or stamped, file format unchanged", () => {
  const { fs, c, q, finish, state } = mk(null);
  for (let i = 0; i < 5; i++) finish(`a${i}`, "ta", i % 2 ? "dead" : "done");
  c.t += 10 ** 12; q.enqueue({ id: "z", tenantId: "ta", payload: 1 });
  assert.equal(state().jobs.length, 6); assert.ok(!fs.files.get(FILE)!.includes("terminalAt"));
});
test("a terminal job is kept until it has been terminal for the retention, then dropped by the next operation of its tenant (done and dead)", () => {
  const { c, q, finish, ids } = mk();
  finish("d", "ta", "done"); finish("x", "ta", "dead");
  c.t += KEEP - 1; q.enqueue({ id: "n1", tenantId: "ta", payload: 1 });
  assert.deepEqual(ids(), ["d", "x", "n1"], "one ms short of the retention: kept");
  c.t += 1; q.enqueue({ id: "n2", tenantId: "ta", payload: 1 });
  assert.deepEqual(ids(), ["n1", "n2"], "exactly the retention: dropped");
});
test("retention counts from when the job became terminal, not from when it was enqueued", () => {
  const { c, q, ids } = mk();
  q.enqueue({ id: "old", tenantId: "ta", payload: 1 }); c.t += 50 * KEEP;
  const j = (q.claim("w") as any).value; q.complete({ id: "old", workerId: "w", attempt: j.attempt, tenantId: "ta" });
  q.enqueue({ id: "n", tenantId: "ta", payload: 1 }); assert.deepEqual(ids(), ["old", "n"], "completed just now: not pruned although enqueued long ago");
});
test("ready, leased and lease-expired jobs are never pruned, however old", () => {
  const { c, q, ids, state } = mk();
  q.enqueue({ id: "r", tenantId: "ta", payload: 1 }); q.enqueue({ id: "l", tenantId: "ta", payload: 1 });
  q.claim("w", { tenantId: "ta" }); // r is leased (oldest)
  c.t += 100 * KEEP; // lease long expired, never reclaimed
  q.enqueue({ id: "n", tenantId: "ta", payload: 1 });
  assert.deepEqual(ids(), ["r", "l", "n"]); assert.deepEqual(state().jobs.map(j => j.status), ["leased", "ready", "ready"]);
  assert.ok(state().jobs.every(j => !("terminalAt" in j)));
});
test("tenant scope: an operation prunes only its own tenant's terminal jobs; a tenant-less claim prunes nothing", () => {
  const { c, q, finish, ids } = mk();
  finish("a", "ta", "done"); finish("b", "tb", "done"); c.t += 10 * KEEP;
  assert.deepEqual(q.claim("w"), { ok: true, value: null }); assert.deepEqual(ids(), ["a", "b"], "no tenant named: nothing pruned");
  q.enqueue({ id: "n", tenantId: "ta", payload: 1 }); assert.deepEqual(ids(), ["b", "n"], "ta's old job gone, tb's untouched");
  q.claim("w2", { tenantId: "tb" }); assert.deepEqual(ids(), ["n"], "tb's own claim prunes tb");
});
test("a failed / refused operation prunes and writes nothing", () => {
  const { c, q, finish, fs } = mk();
  finish("a", "ta"); c.t += 10 * KEEP; const before = fs.files.get(FILE);
  assert.equal((q.enqueue({ id: "a", tenantId: "ta", payload: "different" }) as any).error.code, "payload-mismatch");
  assert.equal((q.complete({ id: "zz", workerId: "w", attempt: 1, tenantId: "ta" }) as any).error.code, "not-found");
  assert.equal(fs.files.get(FILE), before);
});
test("pruning rides the operation's single atomic save: same creates/renames as without pruning, and no extra files left", () => {
  const run = (prune: number | null) => {
    const { c, q, finish, fs } = mk(prune); finish("a", "ta"); c.t += 10 * KEEP; fs.log.length = 0;
    q.enqueue({ id: "n", tenantId: "ta", payload: 1 });
    return { ops: fs.log.map(l => l.split(" ")[0]!).filter(o => o === "create" || o === "rename" || o === "unlink").join(","), left: [...fs.files.keys()].sort() };
  };
  const on = run(KEEP), off = run(null);
  assert.equal(on.ops, off.ops); assert.deepEqual(on.left, off.left);
});
test("crash at every fs call of a pruning operation: the file is always the old or the new complete state, decodable, never half-pruned", () => {
  let kept = 0, swapped = 0;
  for (let at = 0; at < 60; at++) {
    const { c, q, finish, fs } = mk(); finish("a", "ta"); finish("b", "ta"); c.t += 10 * KEEP;
    const old = fs.files.get(FILE)!; fs.calls = 0; fs.crashAt = at;
    try { q.enqueue({ id: "n", tenantId: "ta", payload: 1 }); } catch (e) { if (!(e instanceof SimulatedCrash)) throw e; }
    fs.crashAt = null;
    const now = fs.files.get(FILE)!; const d = decodeQueue(now); assert.equal(d.ok, true, `at ${at}`);
    const names = (d as any).value.jobs.map((j: any) => j.id).join();
    if (now === old) kept++; else { swapped++; assert.equal(names, "n", `at ${at}: new state is fully pruned + enqueued`); }
  }
  assert.ok(kept > 0 && swapped > 0, `${kept} kept, ${swapped} swapped`);
});
test("pruning forgets the id (documented): a pruned id can be enqueued again as a NEW job, and nextSeq never rewinds", () => {
  const { c, q, finish, state } = mk();
  finish("a", "ta"); const seqBefore = state().nextSeq; c.t += 10 * KEEP;
  assert.deepEqual(q.enqueue({ id: "a", tenantId: "ta", payload: "a" }), { ok: true, value: "exists" }, "the enqueue itself still sees it: prune runs after the change");
  q.enqueue({ id: "m", tenantId: "ta", payload: 1 });
  assert.deepEqual(q.enqueue({ id: "a", tenantId: "ta", payload: "a" }), { ok: true, value: "enqueued" });
  assert.ok(state().nextSeq > seqBefore); assert.ok(state().jobs.every(j => j.seq < state().nextSeq));
  assert.deepEqual((q.claim("w", { tenantId: "ta" }) as any).value.id, "m", "FIFO order by seq survives pruning");
});
test("a pruned job's late lease operation answers not-found (same as a missing job) and changes nothing", () => {
  const { c, q, finish, fs } = mk(); finish("a", "ta"); c.t += 10 * KEEP; q.enqueue({ id: "n", tenantId: "ta", payload: 1 });
  const before = fs.files.get(FILE);
  assert.equal((q.complete({ id: "a", workerId: "w", attempt: 1, tenantId: "ta" }) as any).error.code, "not-found"); assert.equal(fs.files.get(FILE), before);
});
test("clock going backwards prunes nothing", () => {
  const { c, q, finish, ids } = mk(); finish("a", "ta"); c.t -= 5000; q.enqueue({ id: "n", tenantId: "ta", payload: 1 }); assert.deepEqual(ids(), ["a", "n"]);
});
test("terminal jobs written by an older build (no stamp) are stamped on the first pruning operation and age from then, not deleted at once", () => {
  const off = mk(null); off.finish("old", "ta");
  const on = new FileJobQueue({ dir: "/q", now: () => off.c.t + 5 * KEEP, fs: off.fs, pruneTerminalAfterMs: KEEP });
  on.enqueue({ id: "n1", tenantId: "ta", payload: 1 });
  assert.deepEqual(off.ids(), ["old", "n1"]); assert.equal(off.state().jobs[0].terminalAt, off.c.t + 5 * KEEP);
  const later = new FileJobQueue({ dir: "/q", now: () => off.c.t + 6 * KEEP, fs: off.fs, pruneTerminalAfterMs: KEEP });
  later.enqueue({ id: "n2", tenantId: "ta", payload: 1 }); assert.deepEqual(off.ids(), ["n1", "n2"]);
});
test("a bounded retention keeps the file size bounded over a long run (500 jobs through the queue)", () => {
  const { c, finish, fs, state } = mk(10 * 5); let max = 0;
  for (let i = 0; i < 500; i++) { c.t += 5; finish(`j${i}`, "ta"); max = Math.max(max, state().jobs.length); }
  assert.ok(max <= 14, `peak ${max} jobs`);
  const unpruned = mk(null); for (let i = 0; i < 500; i++) unpruned.finish(`j${i}`, "ta");
  assert.ok(fs.files.get(FILE)!.length * 20 < unpruned.fs.files.get(FILE)!.length);
});
test("option validation, and strict decode: a stamp on a non-terminal job is corrupt", () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => new FileJobQueue({ dir: "/q", now: () => 1, pruneTerminalAfterMs: bad }), RangeError);
  const mkJob = (extra: object) => JSON.stringify({ version: 1, nextSeq: 1, jobs: [{ id: "a", tenantId: "t", payload: 1, status: "ready", seq: 0, enqueuedAt: 0, attempt: 0, maxAttempts: 1, workerId: null, leaseExpiresAt: null, errorCode: null, ...extra }] });
  assert.equal(decodeQueue(mkJob({ terminalAt: 5 })).ok, false); assert.equal(decodeQueue(mkJob({})).ok, true);
  assert.equal(decodeQueue(mkJob({ status: "done", terminalAt: -1 })).ok, false); assert.equal(decodeQueue(mkJob({ status: "done", terminalAt: 5 })).ok, true);
});
