// ISS-T045TENANTID-001 (D-136, pending append): WhatsApp ingest stores the tenant-scoped source _id, and until
// migration 20261012150000 has run it still reads (and rewrites in place) a legacy bare-hash row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { createMongoWhatsAppDeps } from "./store.js";

const A = "111111111111111111111111";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const GROUP_HASH = hash(`same:${A}`);

function fixture(legacyRows: Array<{ _id: string; tenantId: string }>) {
  const rows: Array<{ name: string; filter?: any; row: any }> = [];
  const appDb = () => ({
    collection: (name: string) => ({
      findOne: async (f: any) => legacyRows.find((r) => r._id === f._id && r.tenantId === f.tenantId) ?? null,
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
  return { store, rows };
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
