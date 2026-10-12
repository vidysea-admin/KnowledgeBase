// ISS-JOBQTENANT-001: tenantId is REQUIRED on claim/heartbeat/complete/fail. A missing or empty tenant is a typed "invalid-input", never a wildcard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE } from "./queue-store.js";
import { MemQueueFs } from "./mem-queue-fs.testkit.js";
import type { QueueJob } from "./queue-types.js";

function setup() { const fs = new MemQueueFs(); const clock = { t: 1000 }; return { fs, clock, q: new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: 100, fs }) }; }
const raw = (fs: MemQueueFs) => fs.files.get(`/q/${QUEUE_FILE}`);
const code = (r: unknown) => (r as { error?: { code?: string } }).error?.code;
const BAD_TENANTS: unknown[] = [undefined, null, "", 0, {}, "a/b", ".."];

function leased() {
  const s = setup();
  s.q.enqueue({ id: "a", tenantId: "ta", payload: 1 });
  const j = (s.q.claim("w1", { tenantId: "ta" }) as { value: QueueJob }).value;
  return { ...s, ref: { id: "a", workerId: "w1", attempt: j.attempt, tenantId: "ta" } };
}

test("claim refuses a missing or empty tenant (typed invalid-input), never 'any tenant', and writes nothing", () => {
  const { q, fs } = setup();
  q.enqueue({ id: "a", tenantId: "ta", payload: 1 }); q.enqueue({ id: "b", tenantId: "tb", payload: 1 });
  const before = raw(fs);
  for (const t of BAD_TENANTS) assert.equal(code(q.claim("w", { tenantId: t } as never)), "invalid-input", String(t));
  assert.equal(code(q.claim("w", undefined as never)), "invalid-input");
  assert.equal(code(q.claim("w", {} as never)), "invalid-input");
  assert.equal(raw(fs), before, "no job was leased by the tenant-less claims");
});

for (const op of ["heartbeat", "complete", "fail"] as const) {
  test(`${op} refuses a missing or empty tenant (typed invalid-input), the lease is untouched`, () => {
    const { q, fs, ref } = leased(); const before = raw(fs);
    const call = (r: unknown) => op === "fail" ? q.fail(r as never, "x") : q[op](r as never);
    for (const t of BAD_TENANTS) assert.equal(code(call({ ...ref, tenantId: t })), "invalid-input", `${op} tenant=${String(t)}`);
    const { tenantId: _omit, ...noTenant } = ref;
    assert.equal(code(call(noTenant)), "invalid-input", `${op} with the key omitted`);
    assert.equal(code(call(undefined)), "invalid-input");
    assert.equal(raw(fs), before, "refusals write nothing");
    assert.equal((call(ref) as { ok: boolean }).ok, true, "the owner tenant still works");
  });
  test(`${op}: tenant B cannot touch tenant A's job (not-found, same answer as a missing id, nothing written)`, () => {
    const { q, fs, ref } = leased(); const before = raw(fs);
    const call = (r: typeof ref) => op === "fail" ? q.fail(r, "x") : q[op](r);
    const r = call({ ...ref, tenantId: "tb" });
    assert.equal(code(r), "not-found");
    assert.deepEqual(r, call({ ...ref, id: "missing", tenantId: "tb" }));
    assert.equal(raw(fs), before);
    assert.equal(call(ref).ok, true, "A's lease survived B's attempt");
  });
}

test("tenant B's claim never returns tenant A's job, and A's claim still does", () => {
  const { q } = setup();
  q.enqueue({ id: "a", tenantId: "ta", payload: 1 });
  assert.deepEqual(q.claim("w", { tenantId: "tb" }), { ok: true, value: null });
  assert.equal((q.claim("w", { tenantId: "ta" }) as { value: QueueJob }).value.id, "a");
});
