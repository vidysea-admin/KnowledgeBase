// ISS-T045TENANTID-001 (D-136, pending append): WhatsApp ingest stores the tenant-scoped source _id, and until
// migration 20261012150000 has run it still reuses a legacy bare-hash row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { createMongoWhatsAppDeps } from "./store.js";

const A = "111111111111111111111111";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const GROUP_HASH = hash(`same:${A}`);

function fixture(legacyRows: Array<{ _id: string; tenantId: string; [key: string]: unknown }>, beforeSourceWrite?: (sources: typeof legacyRows) => void) {
  const sources = structuredClone(legacyRows);
  const rows: Array<{ name: string; filter?: any; row: any }> = [];
  const appDb = () => ({
    collection: (name: string) => ({
      findOne: async (f: any) => structuredClone(sources.find((r) => r._id === f._id && r.tenantId === f.tenantId) ?? null),
      updateOne: async (filter: any, update: any, options: any) => {
        assert.equal(name, "sources"); assert.equal(options.upsert, true);
        assert.deepEqual(Object.keys(update), ["$setOnInsert"]);
        beforeSourceWrite?.(sources);
        const existing = sources.find(r => r._id === filter._id && r.tenantId === filter.tenantId);
        if (!existing) sources.push(structuredClone({ ...filter, ...update.$setOnInsert }));
        rows.push({ name, filter, row: structuredClone(sources.find(r => r._id === filter._id && r.tenantId === filter.tenantId)) });
      },
      replaceOne: async (filter: unknown, row: unknown) => { rows.push({ name, filter, row }); },
      bulkWrite: async (ops: any[]) => { for (const op of ops) rows.push({ name, row: op.replaceOne.replacement }); },
    }),
  }) as unknown as Db;
  const store = createMongoWhatsAppDeps(undefined, {
    resolveOwner: async () => A,
    listGroups: async (owner) => [{ groupJid: "same", ownerUserId: owner, subject: "S", trackedPersonCount: 1 }],
    fetchMessages: async () => [{ messageId: "m1", personId: "p1", displayName: "P", text: "hi", ts: "2026-10-09T01:00:00Z" }],
    appDb,
  });
  return { store, rows, sources };
}

test("fresh tenant: source stored under tenantSourceId, hash field kept, session id stays the bare group hash", async () => {
  const f = fixture([]);
  const r = await f.store.ingestGroup("tenant-a", "same");
  const src = f.rows.find((x) => x.name === "sources")!.row;
  assert.equal(src.hash, GROUP_HASH);
  assert.equal(src._id, `tenant-a:${GROUP_HASH}`);
  assert.equal(r.sourceId, src._id);
  assert.equal(f.rows.find((x) => x.name === "sessions")!.row.sourceId, src._id);
  assert.equal(r.sessionId, GROUP_HASH);
});

test("old-form read: a pre-migration bare-hash row is reused in place (no duplicate-key on {tenantId, hash})", async () => {
  const f = fixture([{ _id: GROUP_HASH, tenantId: "tenant-a" }]);
  const r = await f.store.ingestGroup("tenant-a", "same");
  const w = f.rows.find((x) => x.name === "sources")!;
  assert.equal(w.row._id, GROUP_HASH);
  assert.equal(w.filter._id, GROUP_HASH);
  assert.equal(r.sourceId, GROUP_HASH);
  assert.equal(f.rows.find((x) => x.name === "sessions")!.row.sourceId, GROUP_HASH);
});

test("another tenant's legacy row does not capture this tenant's ingest", async () => {
  const f = fixture([{ _id: GROUP_HASH, tenantId: "tenant-other" }]);
  const r = await f.store.ingestGroup("tenant-a", "same");
  assert.equal(r.sourceId, `tenant-a:${GROUP_HASH}`);
});

const withdrawal = { given: false, recordedBy: "owner-withdrawal" };
test("ISS-WAVECTORLESS-003: unchanged reingest preserves namespaced source withdrawal and future auth metadata", async () => {
  const f = fixture([]); const first = await f.store.ingestGroup("tenant-a", "same");
  const source = f.sources.find(row => row._id === first.sourceId)!;
  source.consent = structuredClone(withdrawal); source.sourceMeta = { authorizationRevision: 7 };
  const before = structuredClone(source);
  assert.equal((await f.store.ingestGroup("tenant-a", "same")).sourceId, first.sourceId);
  assert.deepEqual(source, before);
});

test("ISS-WAVECTORLESS-003: unchanged reingest preserves legacy source withdrawal and identity", async () => {
  const initial = fixture([]); await initial.store.ingestGroup("tenant-a", "same");
  const source = { ...initial.sources[0]!, _id: GROUP_HASH, consent: withdrawal, sourceMeta: { authorizationRevision: 8 } };
  const f = fixture([source]);
  assert.equal((await f.store.ingestGroup("tenant-a", "same")).sourceId, GROUP_HASH);
  assert.deepEqual(f.sources, [source]);
});

test("ISS-WAVECTORLESS-003: withdrawal immediately before atomic upsert cannot be overwritten", async () => {
  const initial = fixture([]); await initial.store.ingestGroup("tenant-a", "same");
  const source = { ...initial.sources[0]!, sourceMeta: { authorizationRevision: 9 } };
  const f = fixture([source], sources => { sources[0]!.consent = structuredClone(withdrawal); });
  await f.store.ingestGroup("tenant-a", "same");
  assert.deepEqual(f.sources[0]!.consent, withdrawal);
  assert.deepEqual(f.sources[0]!.sourceMeta, source.sourceMeta);
  assert.equal(f.sources.length, 1);
});
