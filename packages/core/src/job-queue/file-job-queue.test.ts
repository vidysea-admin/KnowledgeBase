import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE, decodeQueue } from "./queue-store.js";
import { MemQueueFs } from "./mem-queue-fs.testkit.js";
import type { QueueJob } from "./queue-types.js";

function setup(leaseMs = 100, start = 1000) {
  const fs = new MemQueueFs(); const clock = { t: start };
  const q = new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs, fs });
  return { fs, clock, q };
}
const job = (r: { ok: boolean; value?: unknown; error?: unknown }): QueueJob => { assert.ok(r.ok, JSON.stringify(r)); return r.value as QueueJob; };
const ref = (j: QueueJob) => ({ id: j.id, workerId: j.workerId as string, attempt: j.attempt });
const stored = (fs: MemQueueFs) => { const d = decodeQueue(fs.files.get(`/q/${QUEUE_FILE}`) ?? ""); assert.ok(d.ok); return d.value.jobs; };

test("enqueue is idempotent on the id and stores tenant and payload untouched", () => {
  const { q, fs } = setup();
  assert.deepEqual(q.enqueue({ id: "a", tenantId: "T1", payload: { x: 1 } }), { ok: true, value: "enqueued" });
  const before = fs.files.get(`/q/${QUEUE_FILE}`);
  assert.deepEqual(q.enqueue({ id: "a", tenantId: "T2", payload: { x: 2 } }), { ok: true, value: "exists" });
  assert.equal(fs.files.get(`/q/${QUEUE_FILE}`), before, "a duplicate enqueue writes nothing");
  assert.deepEqual([stored(fs)[0]?.tenantId, stored(fs)[0]?.payload], ["T1", { x: 1 }]);
});
test("enqueue validates maxAttempts and payload", () => {
  const { q } = setup();
  for (const maxAttempts of [0, -1, 1.5, 101, NaN]) assert.equal((q.enqueue({ id: "a", tenantId: "t", payload: 1, maxAttempts }) as any).error.code, "invalid-input");
  const cyc: any = {}; cyc.self = cyc;
  assert.equal((q.enqueue({ id: "a", tenantId: "t", payload: cyc }) as any).error.code, "invalid-input");
});
test("claim gives the oldest ready job with a lease from the injected clock; empty queue gives null", () => {
  const { q, clock } = setup();
  assert.deepEqual(q.claim("w1"), { ok: true, value: null });
  q.enqueue({ id: "a", tenantId: "t", payload: 1 }); clock.t += 5; q.enqueue({ id: "b", tenantId: "t", payload: 2 });
  const j = job(q.claim("w1"));
  assert.deepEqual([j.id, j.status, j.workerId, j.attempt, j.leaseExpiresAt], ["a", "leased", "w1", 1, 1105]);
  assert.equal(job(q.claim("w2")).id, "b");
  assert.deepEqual(q.claim("w3"), { ok: true, value: null });
});
test("a live lease blocks a second claim; the exact expiry instant frees it", () => {
  const { q, clock } = setup(100);
  q.enqueue({ id: "a", tenantId: "t", payload: 1 }); job(q.claim("w1"));
  clock.t += 99; assert.deepEqual(q.claim("w2"), { ok: true, value: null });
  clock.t += 1; assert.equal(job(q.claim("w2")).id, "a");
});
test("re-claim after expiry consumes an attempt and fences the old holder", () => {
  const { q, clock } = setup(100);
  q.enqueue({ id: "a", tenantId: "t", payload: 1 });
  const first = job(q.claim("w1"));
  clock.t += 99; assert.deepEqual(q.claim("w2"), { ok: true, value: null });
  clock.t += 1;
  const second = job(q.claim("w2"));
  assert.deepEqual([second.attempt, second.workerId], [2, "w2"]);
  for (const op of [() => q.heartbeat(ref(first)), () => q.complete(ref(first)), () => q.fail(ref(first), "x")]) assert.equal((op() as any).error.code, "stale-lease");
  assert.equal(job(q.complete(ref(second))).status, "done");
});
test("the same worker re-claiming gets a new attempt number, so its old handle is stale", () => {
  const { q, clock } = setup(10);
  q.enqueue({ id: "a", tenantId: "t", payload: 1 }); const a1 = job(q.claim("w1")); clock.t += 10; const a2 = job(q.claim("w1"));
  assert.equal((q.complete(ref(a1)) as any).error.code, "stale-lease"); assert.equal(job(q.complete(ref(a2))).status, "done");
});
test("heartbeat extends the lease from now", () => {
  const { q, clock } = setup(100);
  q.enqueue({ id: "a", tenantId: "t", payload: 1 }); const j = job(q.claim("w1"));
  clock.t += 90; assert.equal(job(q.heartbeat(ref(j))).leaseExpiresAt, 1190);
  clock.t += 99; assert.deepEqual(q.claim("w2"), { ok: true, value: null });
});
test("fail returns the job to ready until maxAttempts, then dead; dead and done are terminal", () => {
  const { q } = setup();
  q.enqueue({ id: "a", tenantId: "t", payload: 1, maxAttempts: 2 });
  const a1 = job(q.claim("w1")); const f1 = job(q.fail(ref(a1), "boom"));
  assert.deepEqual([f1.status, f1.errorCode, f1.attempt], ["ready", "boom", 1]);
  const a2 = job(q.claim("w1")); assert.equal(a2.attempt, 2);
  assert.equal(job(q.fail(ref(a2), "boom")).status, "dead");
  assert.deepEqual(q.claim("w1"), { ok: true, value: null });
  assert.equal((q.complete(ref(a2)) as any).error.code, "terminal");
  assert.equal((q.enqueue({ id: "a", tenantId: "t", payload: 1 }) as any).value, "exists", "a dead id is never re-enqueued");
});
test("a worker that dies on its last attempt makes the job dead at the next claim, not claimable", () => {
  const { q, clock } = setup(10);
  q.enqueue({ id: "a", tenantId: "t", payload: 1, maxAttempts: 1 }); job(q.claim("w1")); clock.t += 10;
  assert.deepEqual(q.claim("w2"), { ok: true, value: null });
  const a = q.fail({ id: "a", workerId: "w1", attempt: 1 }, "x") as any;
  assert.deepEqual([a.error.code], ["terminal"]);
});
test("operations on unknown or unleased jobs are typed errors and write nothing", () => {
  const { q, fs } = setup();
  q.enqueue({ id: "a", tenantId: "t", payload: 1 });
  const raw = fs.files.get(`/q/${QUEUE_FILE}`);
  assert.equal((q.complete({ id: "zz", workerId: "w", attempt: 1 }) as any).error.code, "not-found");
  assert.equal((q.heartbeat({ id: "a", workerId: "w", attempt: 0 }) as any).error.code, "not-leased");
  assert.equal(fs.files.get(`/q/${QUEUE_FILE}`), raw);
});
test("a bad clock is a typed error and nothing is written", () => {
  const fs = new MemQueueFs();
  for (const now of [() => NaN, () => -1, () => { throw new Error("x"); }, () => 1.5]) {
    const q = new FileJobQueue({ dir: "/q", now, fs });
    assert.equal((q.enqueue({ id: "a", tenantId: "t", payload: 1 }) as any).error.code, "invalid-input");
  }
  assert.equal(fs.files.size, 0);
});
test("a corrupt queue file is a typed error on every operation and is never modified or deleted", () => {
  for (const body of ["", "{", '{"version":1,"nextSeq":2,"jobs":[{"id":"a","tenantId":"t","payload":1,"status":"ready","seq":0,"enqueuedAt":0,"attempt":0,"maxAttempts":3,"workerId":null,"leaseExpiresAt":null,"errorCode":null},{"id":"a","tenantId":"t","payload":1,"status":"ready","seq":1,"enqueuedAt":0,"attempt":0,"maxAttempts":3,"workerId":null,"leaseExpiresAt":null,"errorCode":null}]}',  "[]", "null", '{"version":2,"nextSeq":0,"jobs":[]}', '{"version":1,"nextSeq":0,"jobs":[{"id":"a"}]}',
    '{"version":1,"nextSeq":1,"jobs":[{"id":"a","tenantId":"t","payload":1,"status":"leased","seq":0,"enqueuedAt":0,"attempt":1,"maxAttempts":3,"workerId":null,"leaseExpiresAt":null,"errorCode":null}]}']) {
    const { q, fs } = setup(); fs.files.set(`/q/${QUEUE_FILE}`, body); fs.log = [];
    const results = [q.enqueue({ id: "n", tenantId: "t", payload: 1 }), q.claim("w"), q.heartbeat({ id: "a", workerId: "w", attempt: 1 }), q.complete({ id: "a", workerId: "w", attempt: 1 }), q.fail({ id: "a", workerId: "w", attempt: 1 }, "x")];
    for (const r of results) assert.equal((r as any).error.code, "corrupt", body);
    assert.equal(fs.files.get(`/q/${QUEUE_FILE}`), body); assert.equal(fs.files.size, 1);
    assert.ok(fs.log.every(l => l.startsWith("read")), "only reads were issued: " + fs.log.join("|"));
  }
});
test("tenant restriction: a claim for one tenant never returns another tenant's job", () => {
  const { q } = setup();
  q.enqueue({ id: "a", tenantId: "A", payload: 1 }); q.enqueue({ id: "b", tenantId: "B", payload: 1 });
  assert.equal(job(q.claim("w", { tenantId: "B" })).id, "b");
  assert.deepEqual(q.claim("w", { tenantId: "B" }), { ok: true, value: null });
  assert.equal(job(q.claim("w", { tenantId: "A" })).id, "a");
});
test("a read-modify-write conflict is detected before the rename and nothing is replaced", () => {
  const { q, fs } = setup(); q.enqueue({ id: "a", tenantId: "t", payload: 1 });
  const realRead = fs.read.bind(fs); let n = 0;
  fs.read = p => { const v = realRead(p); return ++n === 2 ? (v ?? "") + " " : v; };
  assert.equal((q.claim("w") as any).error.code, "conflict");
  assert.equal(stored(fs)[0]?.status, "ready");
});
test("real filesystem round trip in a temp folder; no temp files remain", () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-jobq-test-"));
  try {
    let t = 10; const q = new FileJobQueue({ dir, now: () => t, leaseMs: 50 });
    q.enqueue({ id: "a", tenantId: "t", payload: { k: "v" } }); const j = job(q.claim("w1")); t += 50; const j2 = job(q.claim("w2"));
    assert.equal(j2.attempt, 2); assert.equal(job(q.complete(ref(j2))).status, "done"); assert.notEqual(j.workerId, null);
    assert.deepEqual(readdirSync(dir), [QUEUE_FILE]);
    writeFileSync(join(dir, QUEUE_FILE), "garbage");
    assert.equal((q.claim("w1") as any).error.code, "corrupt"); assert.equal(readFileSync(join(dir, QUEUE_FILE), "utf8"), "garbage");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
