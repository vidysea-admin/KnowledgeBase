// ISS-FAILEDJOB-001: listDead is read-only, tenant-required, tenant-isolated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE } from "./queue-store.js";
import { MemQueueFs } from "./mem-queue-fs.testkit.js";
import type { QueueJob } from "./queue-types.js";

function setup() { const fs = new MemQueueFs(); const clock = { t: 1000 }; return { fs, clock, q: new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: 100, fs }) }; }
const kill = (q: FileJobQueue, id: string, tenantId: string, errorCode: string) => {
  q.enqueue({ id, tenantId, payload: id });
  const j = (q.claim("w", { tenantId }) as { value: QueueJob }).value;
  q.fail({ id, workerId: "w", attempt: j.attempt, tenantId }, errorCode, { terminal: true });
};
const ids = (r: unknown) => ((r as { value: { jobs: { id: string }[] } }).value.jobs).map(j => j.id);

test("listDead returns only the named tenant's dead jobs, with only id/errorCode/at", () => {
  const { q } = setup();
  kill(q, "a1", "ta", "bad-media"); kill(q, "b1", "tb", "other-secret"); q.enqueue({ id: "a2", tenantId: "ta", payload: 1 });
  const r = q.listDead({ tenantId: "ta" });
  assert.deepEqual(ids(r), ["a1"]);
  assert.deepEqual(Object.keys((r as never as { value: { jobs: object[] } }).value.jobs[0]!).sort(), ["at", "attempt", "enqueuedAt", "errorCode", "id", "maxAttempts"]);
  assert.deepEqual(ids(q.listDead({ tenantId: "tb" })), ["b1"]);
  assert.deepEqual(ids(q.listDead({ tenantId: "tc" })), []);
});
test("listDead refuses a missing or malformed tenant and a bad limit", () => {
  const { q } = setup(); kill(q, "a1", "ta", "x");
  for (const t of [undefined, null, "", 0, "a/b", ".."]) assert.equal((q.listDead({ tenantId: t } as never) as { error?: { code: string } }).error?.code, "invalid-input", String(t));
  assert.equal((q.listDead(undefined as never) as { error?: { code: string } }).error?.code, "invalid-input");
  for (const l of [0, 101, 1.5, NaN]) assert.equal((q.listDead({ tenantId: "ta" }, l) as { error?: { code: string } }).error?.code, "invalid-input");
});
test("listDead is read-only: the queue file is byte-identical, newest first, limit and truncated", () => {
  const { q, fs, clock } = setup();
  kill(q, "a1", "ta", "x"); clock.t = 2000; kill(q, "a2", "ta", "x"); clock.t = 3000; kill(q, "a3", "ta", "x");
  const before = fs.files.get(`/q/${QUEUE_FILE}`);
  const r = q.listDead({ tenantId: "ta" }, 2) as { value: { jobs: { id: string }[]; truncated: boolean } };
  assert.deepEqual(r.value.jobs.map(j => j.id), ["a3", "a2"]); assert.equal(r.value.truncated, true);
  assert.equal(fs.files.get(`/q/${QUEUE_FILE}`), before);
});
test("listDead excludes done, ready and leased jobs of the same tenant", () => {
  const { q } = setup();
  q.enqueue({ id: "d1", tenantId: "ta", payload: 1 }); const j = (q.claim("w", { tenantId: "ta" }) as { value: QueueJob }).value;
  q.complete({ id: "d1", workerId: "w", attempt: j.attempt, tenantId: "ta" });
  kill(q, "x1", "ta", "bad");
  q.enqueue({ id: "r1", tenantId: "ta", payload: 2 }); q.enqueue({ id: "l1", tenantId: "ta", payload: 3 }); q.claim("w2", { tenantId: "ta" });
  assert.deepEqual(ids(q.listDead({ tenantId: "ta" })), ["x1"]);
});
