import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Db } from "mongodb";
import { createKnowledgeRouter } from "./collections-router.js";
import { createMongoKnowledgeStore } from "./collections-store.js";

/**
 * T-055 ISS-T055COLLECTIONS-001: hidden/private collection members must survive any caller's update.
 * Mounts the ACTUAL knowledge router over the ACTUAL concrete store on a filter-enforcing Mongo-like fixture.
 * Auth is a minimal shim that sets req.auth like requireAuth does; server.ts is not imported (its module graph
 * does not load under shared CPU contention), so the production mounting of requireAuth itself is not exercised here.
 */
type Row = Record<string, any>;
function database() {
  const rows: Record<string, Row[]> = { sessions: [{ _id: "shared", tenantId: "a", title: "Own session", sourceId: "source" }, { _id: "foreign", tenantId: "b", title: "Hidden" }], sources: [{ _id: "source", tenantId: "a", kind: "recording", createdAt: "2026-10-14" }], topics: [], speakers: [], knowledge_collections: [], document_documents: [] };
  const value = (row: Row, key: string): any => row[key];
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([k, v]) => v && typeof v === "object" && "$ne" in v ? !value(row, k)?.includes(v.$ne) : Array.isArray(value(row, k)) ? value(row, k).includes(v) : value(row, k) === v);
  const db = { databaseName: "test-t055", collection(name: string) {
    const data = rows[name] ??= []; const need = (filter: Row) => assert.equal(typeof filter.tenantId, "string");
    return {
      find(filter: Row) { need(filter); return { toArray: async () => structuredClone(data.filter(r => matches(r, filter))) }; },
      async findOne(filter: Row) { need(filter); return structuredClone(data.find(r => matches(r, filter)) ?? null); },
      async insertOne(row: Row) { need(row); if (data.some(r => r._id === row._id)) throw { code: 11000 }; data.push(structuredClone(row)); return {}; },
      async updateOne(filter: Row, update: Row) { need(filter); const row = data.find(r => matches(r, filter)); if (!row) return { matchedCount: 0 }; if (update.$set) Object.assign(row, structuredClone(update.$set)); return { matchedCount: 1 }; },
      async deleteMany(filter: Row) { need(filter); const count = data.filter(r => matches(r, filter)).length; rows[name] = data.filter(r => !matches(r, filter)); data.splice(0, data.length, ...rows[name]!); return { deletedCount: count }; },
    };
  } } as unknown as Db;
  return { db, rows };
}
const KEYS: Record<string, { tenantId: string; scopes: string[] }> = { writer: { tenantId: "a", scopes: ["sessions", "ingest"] }, reader: { tenantId: "a", scopes: ["sessions"] }, foreign: { tenantId: "b", scopes: ["sessions", "ingest"] } };
async function run(fn: (call: (method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body: any }>, fx: ReturnType<typeof database>) => Promise<void>) {
  const fx = database(); const app = express(); app.use(express.json());
  app.use((req, res, next) => { const k = KEYS[String(req.headers.authorization).replace("Bearer ", "")]; if (!k) { res.status(401).json({ error: "unauthorized" }); return; } (req as any).auth = { ...k, keyId: "k" }; next(); });
  app.use(createKnowledgeRouter({ store: createMongoKnowledgeStore(fx.db), clock: () => "2026-10-14T00:00:00.000Z" }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const call = async (method: string, path: string, body?: unknown, key = "writer") => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  try { await fn(call, fx); } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
const HID = "a".repeat(64);
function seedHidden(fx: ReturnType<typeof database>) {
  fx.rows.sources!.push({ _id: "wa-source", tenantId: "a", kind: "whatsapp-batch", path: "PRIVATE_GROUP", createdAt: "2026-10-14" });
  fx.rows.sessions!.push({ _id: "wa-session", tenantId: "a", sourceId: "wa-source", title: "PRIVATE_GROUP_TITLE" });
  if (!fx.rows.sessions!.some(s => s._id === "safe-two")) fx.rows.sessions!.push({ _id: "safe-two", tenantId: "a", title: "Second", sourceId: "source" });
  fx.rows.speakers!.push({ _id: "mixed-speaker", tenantId: "a", personId: "PRIVATE_PERSON", aliases: ["PRIVATE_ALIAS"], evidence: [{ sessionId: "shared" }, { sessionId: "wa-session" }] });
  fx.rows.knowledge_collections!.push({ _id: HID, tenantId: "a", title: "Saved curation", revision: 1, updatedAt: "2026-10-14T00:00:00.000Z", members: [{ kind: "session", id: "shared" }, { kind: "speaker", id: "mixed-speaker" }, { kind: "session", id: "wa-session" }] });
  return structuredClone(fx.rows.knowledge_collections!.find(r => r._id === HID)!);
}
const stored = (fx: ReturnType<typeof database>, id = HID) => fx.rows.knowledge_collections!.find(r => r._id === id);

test("ISS-T055COLLECTIONS-001 ledger A/B verbatim: GET-sanitized PUT cannot erase hidden members; control C still updates", async () => run(async (call, fx) => {
  const original = seedHidden(fx);
  const read = await call("GET", "/knowledge/collections"); assert.equal(read.status, 200);
  assert.deepEqual(read.body.collections[0].members, [{ kind: "session", id: "shared", available: true }]); assert.equal(read.body.collections[0].unavailableMembers, true);
  assert.ok(!JSON.stringify(read.body).includes("wa-session") && !JSON.stringify(read.body).includes("mixed-speaker"));
  const A = await call("PUT", `/knowledge/collections/${HID}`, { title: "Saved curation", expectedRevision: 1, members: read.body.collections[0].members.map(({ kind, id }: Row) => ({ kind, id })) });
  assert.equal(A.status, 409); assert.deepEqual(stored(fx), original);
  const B = await call("PUT", `/knowledge/collections/${HID}`, { title: "Saved curation", expectedRevision: 1, members: [] });
  assert.equal(B.status, 409); assert.deepEqual(stored(fx), original);
  // Control C: fully visible collection updates, targeted, sibling untouched.
  const make = (key: string, title: string) => call("PUT", `/knowledge/collections/${key}`, { title, members: [{ kind: "session", id: "shared" }], expectedRevision: 0 });
  const target = (await make("t", "Target")).body, sibling = (await make("s", "Sibling")).body; const siblingRow = structuredClone(stored(fx, sibling.id));
  const C = await call("PUT", `/knowledge/collections/${target.id}`, { title: "Renamed", expectedRevision: 1, members: [{ kind: "session", id: "shared" }, { kind: "session", id: "safe-two" }] });
  assert.equal(C.status, 200); assert.equal(C.body.revision, 2); assert.deepEqual(stored(fx, target.id)!.members, [{ kind: "session", id: "shared" }, { kind: "session", id: "safe-two" }]);
  assert.deepEqual(stored(fx, sibling.id), siblingRow); assert.deepEqual(stored(fx), original);
}));

test("T055 collections: cross-tenant caller cannot update, delete or shadow another tenant's hidden-member collection", async () => run(async (call, fx) => {
  fx.rows.sessions!.push({ _id: "b-session", tenantId: "b", title: "B own", sourceId: "b-source" }); fx.rows.sources!.push({ _id: "b-source", tenantId: "b", kind: "recording", createdAt: "2026-10-14" });
  const original = seedHidden(fx);
  assert.equal((await call("PUT", `/knowledge/collections/${HID}`, { title: "Hijack", expectedRevision: 1, members: [{ kind: "session", id: "b-session" }] }, "foreign")).status, 409);
  assert.deepEqual(stored(fx), original);
  assert.equal((await call("PUT", `/knowledge/collections/${HID}`, { title: "Hijack", expectedRevision: 1, members: [{ kind: "session", id: "shared" }] }, "foreign")).status, 422);
  assert.equal((await call("DELETE", `/knowledge/collections/${HID}`, { expectedRevision: 1 }, "foreign")).status, 404);
  const shadow = await call("PUT", `/knowledge/collections/${HID}`, { title: "Mine", expectedRevision: 0, members: [{ kind: "session", id: "b-session" }] }, "foreign");
  assert.equal(shadow.status, 200); assert.notEqual(shadow.body.id, HID); assert.deepEqual(stored(fx), original);
  assert.ok((await call("GET", "/knowledge/collections", undefined, "foreign")).body.collections.every((c: Row) => c.id !== HID));
}));

test("T055 collections: same-tenant caller with less visibility cannot drop, replace or re-title hidden members", async () => run(async (call, fx) => {
  const original = seedHidden(fx); const url = `/knowledge/collections/${HID}`;
  const attempts: Array<[string, Row]> = [
    ["rename only", { title: "Renamed", members: [{ kind: "session", id: "shared" }] }],
    ["add visible", { title: "Saved curation", members: [{ kind: "session", id: "shared" }, { kind: "session", id: "safe-two" }] }],
    ["swap", { title: "Saved curation", members: [{ kind: "session", id: "safe-two" }] }],
    ["re-submit hidden ids", { title: "Saved curation", members: [{ kind: "session", id: "shared" }, { kind: "speaker", id: "mixed-speaker" }, { kind: "session", id: "wa-session" }] }],
  ];
  for (const [name, body] of attempts) { const r = await call("PUT", url, { ...body, expectedRevision: 1 }); assert.ok([409, 422].includes(r.status), name); assert.ok(!JSON.stringify(r.body).includes("wa-session"), name); assert.deepEqual(stored(fx), original, name); }
  assert.equal((await call("PUT", url, { title: "x", members: [], expectedRevision: 1 }, "reader")).status, 403); assert.deepEqual(stored(fx), original);
  // Visibility revoked after a fully visible save: a stale-view PUT must still refuse.
  fx.rows.knowledge_collections!.push({ _id: "b".repeat(64), tenantId: "a", title: "Later hidden", revision: 1, updatedAt: "2026-10-14T00:00:00.000Z", members: [{ kind: "session", id: "shared" }, { kind: "session", id: "safe-two" }] });
  const later = structuredClone(stored(fx, "b".repeat(64))); fx.rows.sessions!.find(s => s._id === "safe-two")!.sourceId = "wa-source";
  assert.equal((await call("PUT", `/knowledge/collections/${"b".repeat(64)}`, { title: "Later hidden", members: [{ kind: "session", id: "shared" }], expectedRevision: 1 })).status, 409);
  assert.deepEqual(stored(fx, "b".repeat(64)), later);
}));

test("T055 collections: concurrent updates cannot lose writes or erase hidden members", async () => run(async (call, fx) => {
  fx.rows.sessions!.push({ _id: "safe-two", tenantId: "a", title: "Second", sourceId: "source" });
  const target = (await call("PUT", "/knowledge/collections/target", { title: "target", members: [{ kind: "session", id: "shared" }], expectedRevision: 0 })).body;
  // Barrier: both writers must have READ revision 1 before either writes, so only the updateOne revision predicate (CAS) can make one lose.
  const orig = (fx.db as any).collection.bind(fx.db); const waiting: Array<() => void> = []; let barrierHits = 0;
  (fx.db as any).collection = (name: string) => { const c = orig(name); if (name !== "knowledge_collections") return c;
    return { ...c, async findOne(f: Row) { const r = await c.findOne(f); if (f.revision !== undefined) { barrierHits++; await new Promise<void>(res => { waiting.push(res); if (waiting.length >= 2) waiting.forEach(w => w()); setTimeout(res, 3000); }); } return r; } }; };
  const race = await Promise.all(["one", "two"].map(t => call("PUT", `/knowledge/collections/${target.id}`, { title: t, members: [{ kind: "session", id: "safe-two" }], expectedRevision: 1 })));
  assert.equal(barrierHits, 2, "both writers must reach the revision read");
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  (fx.db as any).collection = orig;
  const row = stored(fx, target.id)!; assert.equal(row.revision, 2); assert.equal(row.title, race.find(r => r.status === 200)!.body.title); assert.deepEqual(row.members, [{ kind: "session", id: "safe-two" }]);
  const original = seedHidden(fx);
  const hidden = await Promise.all([1, 2, 3].map(n => call("PUT", `/knowledge/collections/${HID}`, { title: `t${n}`, members: [{ kind: "session", id: "shared" }], expectedRevision: 1 })));
  assert.deepEqual(hidden.map(r => r.status), [409, 409, 409]); assert.deepEqual(stored(fx), original);
}));
