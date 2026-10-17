/** Explicit scratch-only proof. Not an automatic test and never reads the production MONGODB_URL. */
import { MongoClient } from "mongodb";
import { scopedCollection } from "@lkb/db";
import { AutomationRuntime } from "./runtime.js";
import { createMongoAutomationStore, type AutomationCollection } from "./store.js";
import type { AutomationRecord } from "./types.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { checkApplicationReadiness } from "../../../../packages/core/src/domain/automation-monitor.js";

export async function proveAutomationMongo(url: string, database: string): Promise<{ checks: number; database: string }> {
  if (!url || !/^lkb_work_automation_[a-z0-9_]{1,40}$/.test(database)) throw new Error("explicit_automation_scratch_database_required");
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  await client.connect();
  const suffix = randomUUID(), a = { tenantId: `automation-proof-a-${suffix}`, actorId: "proof-admin" }, b = { tenantId: `automation-proof-b-${suffix}`, actorId: "proof-other" };
  const db = client.db(database);
  // Same tenant wrapper as production accessor; separate collection avoids live application data entirely.
  const accessor = scopedCollection<AutomationRecord>(db, "automation_runs");
  const store = () => createMongoAutomationStore(tenant => accessor(tenant) as unknown as AutomationCollection);
  const config = { enabled: true, maxAttempts: 3, timeoutMs: 1000, expectedVersion: 0 };
  const input = { kind: "application-readiness", idempotencyKey: "mongo-proof", input: { applicationRef: "fixture-only", requiredDocuments: ["identity"], availableDocuments: [] } };
  let checks = 0;
  try {
    const runtime = new AutomationRuntime(store()); await runtime.configure(a, config); await runtime.configure(b, config); checks += 2;
    const created = await runtime.submit(a, input), replay = await runtime.submit(a, input); assert.equal(created.run._id, replay.run._id); assert.equal(replay.replay, true); checks++;
    const foreign = await runtime.submit(b, input); assert.notEqual(foreign.run._id, created.run._id); checks++;
    await assert.rejects(runtime.load(b.tenantId, created.run._id)); checks++;
    await assert.rejects(runtime.submit(a, { ...input, input: { ...input.input, availableDocuments: ["identity"] } })); checks++;
    const done = await runtime.execute(a, created.run._id, created.run.version); assert.equal(done.status, "succeeded"); assert.deepEqual(done.outcome, { ready: false, missingDocuments: ["identity"] }); checks++;
    const concurrencyInput = { ...input, idempotencyKey: "mongo-concurrency" }, concurrentRun = await runtime.submit(a, concurrencyInput);
    let invocations = 0;
    const registered = { retrySafe: true, async execute(value: Parameters<typeof checkApplicationReadiness>[0]) { invocations++; return checkApplicationReadiness(value); } };
    const workerA = new AutomationRuntime(store(), registered), workerB = new AutomationRuntime(store(), registered);
    const outcomes = await Promise.allSettled([workerA.execute(a, concurrentRun.run._id, concurrentRun.run.version), workerB.execute(a, concurrentRun.run._id, concurrentRun.run.version)]);
    assert.equal(outcomes.filter(v => v.status === "fulfilled").length, 1); assert.equal(outcomes.filter(v => v.status === "rejected").length, 1); assert.equal(invocations, 1); checks++;
    // Reconstruct actual client, not just runtime over a retained in-memory collection.
    await client.close();
    const second = new MongoClient(url, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }); await second.connect();
    try {
      const nextAccessor = scopedCollection<AutomationRecord>(second.db(database), "automation_runs");
      const restored = new AutomationRuntime(createMongoAutomationStore(tenant => nextAccessor(tenant) as unknown as AutomationCollection));
      assert.equal((await restored.load(a.tenantId, done._id)).status, "succeeded"); checks++;
      assert.equal((await restored.submit(a, input)).run._id, done._id); checks++;
      const list = await restored.store.list(a.tenantId, "run", 100); assert.equal(list.length, 2); assert.ok(list.every(row => row.tenantId === a.tenantId)); checks++;
      assert.deepEqual(await restored.monitor(a), { scanned: 0, changed: 0, truncated: false }); checks++;
    } finally { await second.close(); }
    return { checks, database };
  } finally {
    // Delete only the two private proof tenants, never a database/collection or any other user's rows.
    const cleaner = new MongoClient(url, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    try {
      await cleaner.connect(); const cleanupAccessor = scopedCollection<AutomationRecord>(cleaner.db(database), "automation_runs");
      await cleanupAccessor(a.tenantId).deleteMany({}); await cleanupAccessor(b.tenantId).deleteMany({});
    }
    finally { await cleaner.close(); await client.close(); }
  }
}
