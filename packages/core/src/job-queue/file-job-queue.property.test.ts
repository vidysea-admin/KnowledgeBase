import { test } from "node:test";
import assert from "node:assert/strict";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE, decodeQueue } from "./queue-store.js";
import { MemQueueFs, seeded } from "./mem-queue-fs.testkit.js";
import type { LeaseRef, QueueJob } from "./queue-types.js";

const LEASE = 50, WORKERS = ["w1", "w2", "w3"], TENANTS = ["A", "B"], SEQUENCES = 1200, OPS = 30;
interface Held { ref: LeaseRef; expires: number }

function runSequence(seed: number) {
  const r = seeded(seed), pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const fs = new MemQueueFs(); const clock = { t: 1000 };
  const q = new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: LEASE, fs });
  const enq = new Map<string, string>(), holder = new Map<string, Held>(), handles: LeaseRef[] = [], terminal = new Map<string, string>();
  let nextId = 0, claims = 0, crashes = 0;
  const state = () => { const raw = fs.files.get(`/q/${QUEUE_FILE}`); if (!raw) return []; const d = decodeQueue(raw); assert.ok(d.ok, "decodes"); return d.value.jobs; };
  for (let i = 0; i < OPS; i++) {
    const op = r(); const raw0 = fs.files.get(`/q/${QUEUE_FILE}`), pre = state();
    const crash = r() < 0.05; fs.calls = 0; fs.crashAt = crash ? Math.floor(r() * 4) : null; fs.torn = r() < 0.5;
    if (op < 0.25) {
      const dup = enq.size > 0 && r() < 0.3; const id = dup ? pick([...enq.keys()]) : `j${nextId++}`; const tenantId = dup ? enq.get(id)! : pick(TENANTS);
      const res = q.enqueue({ id, tenantId, payload: { id }, maxAttempts: 1 + Math.floor(r() * 3) });
      if (res.ok) { assert.equal(res.value, dup ? "exists" : "enqueued"); enq.set(id, tenantId); } else assert.equal(res.error.code, "io-error");
    } else if (op < 0.55) {
      const w = pick(WORKERS), tenantId = r() < 0.5 ? pick(TENANTS) : undefined;
      const res = q.claim(w, tenantId === undefined ? {} : { tenantId });
      if (res.ok && res.value) {
        claims++; const j: QueueJob = res.value;
        const prev = holder.get(j.id);
        assert.ok(!prev || prev.expires <= clock.t, "claimed while another worker's lease was live");
        assert.ok(tenantId === undefined || j.tenantId === tenantId, "tenant leak"); assert.equal(j.tenantId, enq.get(j.id), "tenant changed");
        const eligible = pre.filter(x => (x.status === "ready" || (x.status === "leased" && x.leaseExpiresAt! <= clock.t && x.attempt < x.maxAttempts)) && (tenantId === undefined || x.tenantId === tenantId));
        assert.equal(j.seq, Math.min(...eligible.map(x => x.seq)), "FIFO order");
        const ref = { id: j.id, workerId: w, attempt: j.attempt }; holder.set(j.id, { ref, expires: clock.t + LEASE }); handles.push(ref);
      } else if (res.ok) {
        assert.ok(!pre.some(x => (x.status === "ready" || (x.status === "leased" && x.leaseExpiresAt! <= clock.t && x.attempt < x.maxAttempts)) && (tenantId === undefined || x.tenantId === tenantId)), "claim returned null with an eligible job");
      } else assert.equal(res.error.code, "io-error");
    } else if (op < 0.9 && handles.length) {
      const ref = pick(handles); const h = holder.get(ref.id); const current = !!h && h.ref.workerId === ref.workerId && h.ref.attempt === ref.attempt && !terminal.has(ref.id);
      const kind = pick(["heartbeat", "complete", "fail"]);
      const res = kind === "heartbeat" ? q.heartbeat(ref) : kind === "complete" ? q.complete(ref) : q.fail(ref, "err");
      if (res.ok) {
        assert.ok(current, `${kind} accepted from a stale or terminal handle`);
        if (kind === "heartbeat") holder.set(ref.id, { ref, expires: clock.t + LEASE });
        else { holder.delete(ref.id); if (res.value.status === "done" || res.value.status === "dead") terminal.set(ref.id, res.value.status); }
      } else if (res.error.code !== "io-error") assert.ok(!current, `${kind} refused a current holder: ${res.error.code}`);
    } else clock.t += Math.floor(r() * LEASE * 1.5);
    const crashedNow = fs.crashAt !== null && fs.calls > fs.crashAt; fs.restart();
    if (crashedNow) { crashes++; assert.equal(fs.files.get(`/q/${QUEUE_FILE}`), raw0, "crash before rename must not change the queue file"); }
    // invariants after every step
    const jobs = state(); const ids = jobs.map(j => j.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate job");
    assert.deepEqual([...ids].sort(), [...enq.keys()].sort(), "job lost or invented");
    for (const j of jobs) {
      assert.equal(j.tenantId, enq.get(j.id)); assert.ok(j.attempt <= j.maxAttempts);
      const t = terminal.get(j.id); if (t) assert.equal(j.status, t, "terminal job changed");
      if (j.status === "dead" || j.status === "done") terminal.set(j.id, j.status);
    }
    const leasedLive = jobs.filter(j => j.status === "leased");
    for (const j of leasedLive) assert.ok(j.workerId && j.leaseExpiresAt !== null);
  }
  return { claims, crashes };
}

test(`property: ${SEQUENCES} seeded operation sequences x ${OPS} ops, 3 workers, 2 tenants, clock advances, 5% crash injection`, () => {
  let claims = 0, crashes = 0;
  for (let s = 1; s <= SEQUENCES; s++) { try { const x = runSequence(s * 7919); claims += x.claims; crashes += x.crashes; } catch (e) { (e as Error).message = `seed ${s * 7919}: ${(e as Error).message}`; throw e; } }
  assert.ok(claims > 3000, `claims exercised: ${claims}`); assert.ok(crashes > 500, `crashes exercised: ${crashes}`);
});
