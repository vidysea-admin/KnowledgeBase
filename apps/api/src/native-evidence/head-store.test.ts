import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { PageDocument } from "../../../../packages/ingest/src/sources/document-pages.js";
import { createNativeDocumentHeadStore, type NativeDocumentCandidate } from "./head-store.js";

function document(id: string, hash: string, tenantId = "A"): PageDocument {
  return { _id: id, sourceId: id, tenantId, version: hash.repeat(64), title: id, format: "pdf",
    pages: [{ pageNumber: 1, text: "Actual source passage" }], createdAt: "2026-10-15T00:00:00.000Z" };
}
function fixture() {
  const rows = new Map<string, Record<string, unknown>>(), docs = new Map<string, PageDocument>();
  const indexed: NativeDocumentCandidate[] = []; let writes = 0, reads = 0, uuid = 0;
  let indexHook: (() => Promise<void>) | undefined;
  const valueAt = (row: unknown, path: string): unknown => path.split(".").reduce((v, key) => v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined, row);
  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) => Object.entries(filter).every(([path, expected]) => {
    const value = valueAt(row, path);
    if (expected && typeof expected === "object") {
      const condition = expected as { $exists?: boolean; $nin?: unknown[] };
      if (condition.$exists !== undefined) return (value !== undefined) === condition.$exists;
      if (condition.$nin) return !condition.$nin.includes(value);
    }
    return value === expected;
  });
  const db = { collection(name: string) {
    assert.equal(name, "sources");
    return {
      async findOne(filter: Record<string, unknown>) { reads++; const row = [...rows.values()].find(row => matches(row, filter)); return row ? structuredClone(row) : null; },
      async insertOne(row: Record<string, unknown>) { writes++; const key = String(row.tenantId) + ":" + String(row._id); if (rows.has(key)) throw new Error("duplicate"); rows.set(key, structuredClone(row)); return { acknowledged: true }; },
      async updateOne(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) {
        const row = [...rows.values()].find(row => matches(row, filter));
        if (!row) return { modifiedCount: 0 };
        writes++; const next = update.$set["sourceMeta.nativeDocumentHead"];
        row.sourceMeta = { ...(row.sourceMeta as object ?? {}), nativeDocumentHead: structuredClone(next) };
        return { modifiedCount: 1 };
      },
    };
  } } as unknown as Pick<Db, "collection">;
  const store = createNativeDocumentHeadStore({ db, async loadDocument(tenant, id) { const doc = docs.get(id); return doc?.tenantId === tenant ? structuredClone(doc) : null; },
    async indexCandidate(candidate) { indexed.push(structuredClone(candidate)); await indexHook?.(); },
    randomUUID: () => "stable-" + ++uuid, now: () => "2026-10-15T00:00:00.000Z" });
  const publish = (sourceId: string, doc: PageDocument, expectedHeadRevision: number | null = null, tenant = "A") => store.publish(tenant,
    { sourceId, documentId: doc._id, documentSourceId: doc.sourceId, revisionHash: doc.version, expectedHeadRevision });
  return { rows, docs, indexed, store, publish, counts: () => ({ writes, reads }), setIndexHook(hook?: () => Promise<void>) { indexHook = hook; } };
}
async function setup() {
  const f = fixture(); const { sourceId } = await f.store.registerLogicalSource("A", { recordedBy: "human:umesh" });
  const first = document("doc:1", "a"), second = document("doc:2", "b"); f.docs.set(first._id, first); f.docs.set(second._id, second);
  return { ...f, sourceId, first, second };
}
function raceBarrier(f: ReturnType<typeof fixture>) {
  let waiting = 0; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  f.setIndexHook(async () => { if (++waiting === 2) release(); await gate; });
}

test("logical source is minted before publication and missing head fails closed without read writes", async () => {
  const f = await setup(); assert.notEqual(f.sourceId, f.first._id); assert.notEqual(f.sourceId, f.first.sourceId);
  const before = f.counts().writes; assert.equal(await f.store.loadPublished("A", f.sourceId), null);
  assert.equal(await f.store.isCurrent("A", { sourceId: f.sourceId, documentId: f.first._id, documentSourceId: f.first.sourceId, revisionHash: f.first.version, headRevision: 1 }), false);
  assert.equal(f.counts().writes, before); assert.equal(f.indexed.length, 0);
});

test("competing initial CAS publishes one actual indexed candidate; loser is never eligible", async () => {
  const f = await setup(); raceBarrier(f);
  const results = await Promise.allSettled([f.publish(f.sourceId, f.first), f.publish(f.sourceId, f.second)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.indexed.length, 2);
  assert.deepEqual((await Promise.all(f.indexed.map(row => f.store.isCurrent("A", row)))).sort(), [false, true]);
  assert.equal(f.indexed[0]!.document.pages[0].text, "Actual source passage");
  assert.equal((await f.store.loadPublished("A", f.sourceId))?.head.headRevision, 1);
});

test("identical published retry is idempotent and replacement CAS increments exactly once", async () => {
  const f = await setup(); const first = await f.publish(f.sourceId, f.first);
  const before = f.counts().writes; assert.deepEqual(await f.publish(f.sourceId, f.first), first);
  assert.equal(f.counts().writes, before); assert.equal(f.indexed.length, 1);
  const third = document("doc:3", "c"); f.docs.set(third._id, third); raceBarrier(f);
  const results = await Promise.allSettled([f.publish(f.sourceId, f.second, 1), f.publish(f.sourceId, third, 1)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.loadPublished("A", f.sourceId))?.head.headRevision, 2);
  assert.equal(await f.store.isCurrent("A", f.indexed[0]!), false);
  assert.deepEqual((await Promise.all(f.indexed.slice(1).map(row => f.store.isCurrent("A", row)))).sort(), [false, true]);
});

test("revoke and delete tombstones invalidate existing candidates and stale CAS", async () => {
  const f = await setup(); await f.publish(f.sourceId, f.first);
  const revoked = await f.store.tombstone("A", { sourceId: f.sourceId, expectedHeadRevision: 1, status: "revoked" });
  assert.equal(revoked.headRevision, 2); assert.equal(await f.store.loadPublished("A", f.sourceId), null);
  assert.equal(await f.store.isCurrent("A", f.indexed[0]!), false);
  await assert.rejects(f.publish(f.sourceId, f.second, 1), /head_conflict/);
  const deleted = await f.store.tombstone("A", { sourceId: f.sourceId, expectedHeadRevision: 2, status: "deleted" });
  assert.equal(deleted.headRevision, 3); assert.equal(deleted.status, "deleted");
  assert.equal(await f.store.loadPublished("A", f.sourceId), null);
});

test("failed index callback never promotes a candidate or replaces the published head", async () => {
  const f = await setup(); f.setIndexHook(async () => { throw new Error("index failed"); });
  await assert.rejects(f.publish(f.sourceId, f.first), /index failed/); assert.equal(await f.store.loadPublished("A", f.sourceId), null);
  assert.equal(await f.store.isCurrent("A", f.indexed[0]!), false);
  f.setIndexHook(); await f.publish(f.sourceId, f.first); f.setIndexHook(async () => { throw new Error("index failed"); });
  await assert.rejects(f.publish(f.sourceId, f.second, 1), /index failed/);
  assert.equal((await f.store.loadPublished("A", f.sourceId))?.document._id, f.first._id);
});

test("foreign tenant document source binding and absent consent cannot publish or become visible", async () => {
  const f = await setup(); await assert.rejects(f.publish(f.sourceId, f.first, null, "B"), /source_unavailable/);
  const foreign = document("doc:foreign", "c", "B"); f.docs.set(foreign._id, foreign);
  await assert.rejects(f.publish(f.sourceId, foreign), /invalid_binding/);
  await assert.rejects(f.store.publish("A", { sourceId: f.sourceId, documentId: f.first._id, documentSourceId: "wrong", revisionHash: f.first.version, expectedHeadRevision: null }), /invalid_binding/);
  const row = f.rows.get("A:" + f.sourceId)!; delete row.consent;
  await assert.rejects(f.publish(f.sourceId, f.first), /source_unavailable/);
  assert.equal(await f.store.loadPublished("A", f.sourceId), null); assert.equal(f.indexed.length, 0);
});

test("consent withdrawal during index blocks CAS and immediately hides previous publication", async () => {
  const f = await setup(); await f.publish(f.sourceId, f.first);
  f.setIndexHook(async () => { (f.rows.get("A:" + f.sourceId)!.consent as { given: boolean }).given = false; });
  await assert.rejects(f.publish(f.sourceId, f.second, 1), /head_conflict/);
  assert.equal(await f.store.loadPublished("A", f.sourceId), null);
  assert.equal(await f.store.isCurrent("A", f.indexed[0]!), false);
  assert.equal(await f.store.isCurrent("A", f.indexed[1]!), false);
});
