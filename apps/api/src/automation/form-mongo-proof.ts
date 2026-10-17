/** Explicit isolated proof, never reads production credentials or runs on import. Fixture target is Mongo, not a live application. */
import { MongoClient } from "mongodb";
import { scopedCollection } from "@lkb/db";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ApplicationFormRuntime } from "./form-runtime.js";
import { createMongoApplicationStore } from "./form-store.js";
import { applicationDigest } from "./form-validation.js";
import { AutomationError } from "./types.js";
import type { AutomationCollection } from "./store.js";
import type { ApplicationRecord, ApplicationStore, ApplicationTarget } from "./form-types.js";
interface FixturePage { _id: string; tenantId: string; text: string; revision: string; page: number }
interface FixtureReceipt { _id: string; tenantId: string; receiptId: string; operationId: string }
export async function proveApplicationFormsMongo(url: string, database: string): Promise<{ checks: number; database: string; externalRequests: 0 }> {
  if (!url || !/^lkb_work_automation_[a-z0-9_]{1,40}$/.test(database)) throw new Error("explicit_automation_scratch_database_required");
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }); await client.connect();
  const suffix = randomUUID(), p = { tenantId: `form-proof-a-${suffix}`, actorId: "proof-operator" }, other = { tenantId: `form-proof-b-${suffix}`, actorId: "proof-other" };
  const db = client.db(database), pages = scopedCollection<FixturePage>(db, "fixture_application_pages"), receipts = scopedCollection<FixtureReceipt>(db, "fixture_application_receipts"), operations = scopedCollection<ApplicationRecord>(db, "application_operations");
  const realStore = createMongoApplicationStore(tenant => operations(tenant) as unknown as AutomationCollection);
  let failCommit = false, now = 1000, effects = 0, checks = 0;
  const store: ApplicationStore = { ...realStore, async cas(tenant, previous, next) { if (failCommit && next.recordType === "operation" && next.status === "succeeded") { failCommit = false; throw new AutomationError("unavailable"); } return realStore.cas(tenant, previous, next); } };
  const revision = applicationDigest("MATH"), field = { name: "courseRef", value: "MATH", source: { documentId: "source-page-1", page: 1, start: 0, end: 4, revision } };
  const target: ApplicationTarget = {
    id: "isolated-application", version: "fixture-v1", requiredFields: ["courseRef"], allowedFields: ["courseRef"], configurationDigest: "d".repeat(64),
    async verifyField(tenant, f, signal) { signal.throwIfAborted(); const page = await pages(tenant).findOne({ _id: `${tenant}-source`, page: f.source.page, revision: f.source.revision }); return !!page && f.source.documentId === "source-page-1" && applicationDigest(page.text) === page.revision && page.text.slice(f.source.start, f.source.end) === f.value; },
    adapter: {
      duplicateGuarantee: "operation-id",
      async submit(request) {
        request.signal.throwIfAborted();
        const receiptId = `receipt-${applicationDigest(request.operationId).slice(0, 32)}`;
        const write = await receipts(request.tenantId).updateOne({ _id: request.operationId }, { $setOnInsert: { receiptId, operationId: request.operationId } }, { upsert: true });
        if (!write.acknowledged) throw new Error("fixture_write_unacknowledged"); if (write.upsertedCount) effects++;
        return { receiptId };
      },
      async verifyReceipt(request) { request.signal.throwIfAborted(); return !!await receipts(request.tenantId).findOne({ _id: request.operationId, operationId: request.operationId, receiptId: request.receiptId }); },
    },
  };
  const runtime = new ApplicationFormRuntime(store, [target], () => now), config = { targetId: target.id, enabled: true, maxAttempts: 3, timeoutMs: 1000, expectedVersion: 0 }, input = { targetId: target.id, idempotencyKey: "application-fixture", fields: [field] };
  try {
    await pages(p.tenantId).insertOne({ _id: `${p.tenantId}-source`, text: "MATH", revision, page: 1 });
    await runtime.configure(p, config); await runtime.configure(other, config); checks += 2;
    const created = await runtime.submit(p, input); await assert.rejects(runtime.execute(p, created.operation._id, created.operation.version)); checks++;
    assert.equal((await runtime.submit(p, input)).replay, true); checks++;
    await assert.rejects(runtime.load(other.tenantId, created.operation._id)); checks++;
    const approved = await runtime.approve(p, created.operation._id, created.operation.version); assert.ok(approved.approval); checks++;
    // The fixture target persists its side effect; then the application's outcome write fails.
    failCommit = true; await assert.rejects(runtime.execute(p, approved._id, approved.version)); assert.equal(effects, 1); checks++;
    now = 8000; assert.equal((await runtime.monitor(p)).changed, 1); assert.equal((await runtime.monitor(p)).changed, 0); checks++;
    const retry = await runtime.load(p.tenantId, approved._id); assert.equal(retry.status, "approved"); assert.equal(retry.sideEffectUncertain, true);
    const done = await runtime.execute(p, retry._id, retry.version); assert.equal(done.status, "succeeded"); assert.equal(effects, 1); checks++;
    await client.close(); const second = new MongoClient(url, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }); await second.connect();
    try {
      const accessor = scopedCollection<ApplicationRecord>(second.db(database), "application_operations"), restored = new ApplicationFormRuntime(createMongoApplicationStore(tenant => accessor(tenant) as unknown as AutomationCollection), [target]);
      assert.equal((await restored.load(p.tenantId, done._id)).status, "succeeded"); checks++;
      assert.equal((await restored.submit(p, input)).operation._id, done._id); checks++;
      const listed = await restored.store.list(p.tenantId, "operation"); assert.equal(listed.length, 1); assert.equal(listed[0]!.tenantId, p.tenantId); checks++;
    } finally { await second.close(); }
    return { checks, database, externalRequests: 0 };
  } finally {
    const cleaner = new MongoClient(url, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    try {
      await cleaner.connect(); const cleanDb = cleaner.db(database);
      for (const tenant of [p.tenantId, other.tenantId]) {
        await scopedCollection<ApplicationRecord>(cleanDb, "application_operations")(tenant).deleteMany({});
        await scopedCollection<FixturePage>(cleanDb, "fixture_application_pages")(tenant).deleteMany({});
        await scopedCollection<FixtureReceipt>(cleanDb, "fixture_application_receipts")(tenant).deleteMany({});
      }
    } finally { await cleaner.close(); await client.close(); }
  }
}
