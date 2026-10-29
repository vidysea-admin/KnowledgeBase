// whatsapp-multiuser W1 acceptance 3 and 4: scoped accessors reject a missing/invalid tenant, a cross-tenant
// findOne returns null, and whatsapp_events exposes insert and read only. Real-Mongo paging runs only when
// WA_REVIEW_TEST_MONGO_URL is set (throwaway lkb_test_wa_links_* database; production names are refused).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import * as mod from "./whatsapp-links.js";
import { EVENT_DATA_KEYS, FORBIDDEN_EVENT_FIELDS, DEFAULT_STUDENT_DATA, whatsAppLinkStores } from "./whatsapp-links.js";

type Row = Record<string, unknown>;
const matches = (row: Row, filter: Row) => Object.entries(filter).every(([k, v]) => row[k] === v);
/** Equality-only in-memory stand-in for Db: enough to prove the tenant pin, which is what these tests are about. */
function fakeDb() {
  const tables = new Map<string, Row[]>();
  const table = (name: string) => tables.get(name) ?? tables.set(name, []).get(name)!;
  return {
    tables,
    collection: (name: string) => ({
      insertOne: async (doc: Row) => { table(name).push(doc); return { acknowledged: true, insertedId: doc._id }; },
      findOne: async (filter: Row) => table(name).find((r) => matches(r, filter)) ?? null,
    }),
  } as never;
}
const OWNER = "6a8d0c692fcc75f0e911b878";
const stores = () => whatsAppLinkStores(fakeDb());
const requested = (userId: string | null = "user-1") => ({ userId, label: "phone", state: "requested" as const });

test("accessors reject a missing or invalid tenant before any query", async () => {
  const s = stores();
  for (const bad of [undefined, null, "", " tenant", "tenant ", "a\nb", { $ne: null }, 7] as unknown[]) {
    assert.throws(() => s.links(bad as string), /tenantId is required/);
    assert.throws(() => s.syncRuns(bad as string), /tenantId is required/);
    assert.throws(() => s.events(bad as string), /tenantId is required/);
    assert.throws(() => s.getLink(bad as string, "x"), /tenantId is required/);
    assert.throws(() => s.findLiveLinkForUser(bad as string, "u"), /tenantId is required/);
    assert.throws(() => s.insertLink(bad as string, requested()), /tenantId is required/);
  }
});

test("a cross-tenant findOne by id returns null; the owning tenant gets the row", async () => {
  const s = stores();
  const a = await s.insertLink("tenant-a", { ...requested(), _id: "6a8d0c692fcc75f0e911b801" });
  assert.equal(a.tenantId, "tenant-a");
  assert.equal((await s.getLink("tenant-a", a._id))?._id, a._id);
  assert.equal(await s.getLink("tenant-b", a._id), null);
  assert.equal(await s.findLiveLinkForUser("tenant-b", "user-1"), null);
  assert.equal((await s.findLiveLinkForUser("tenant-a", "user-1"))?._id, a._id);
});

test("insertLink pins the tenant, derives live from state and applies the D-206 student-data default", async () => {
  const s = stores();
  const forged = { ...requested(), tenantId: "tenant-b", live: false, state: "active" } as never;
  const row = await s.insertLink("tenant-a", forged);
  assert.equal(row.tenantId, "tenant-a");
  assert.equal(row.live, true);
  assert.equal(row.studentData, DEFAULT_STUDENT_DATA);
  assert.equal(DEFAULT_STUDENT_DATA, "no");
  const dead = await s.insertLink("tenant-a", { ...requested(), state: "unlinked", live: true } as never);
  assert.equal(dead.live, false);
  assert.match(row._id, /^[0-9a-f]{24}$/);
  await assert.rejects(async () => s.findLiveLinkForUser("tenant-a", ""), /userId is required/);
  await assert.rejects(async () => s.findLiveLinkForUser("tenant-a", null as never), /userId is required/);
  assert.equal(await s.findLiveLinkForUser("tenant-a", "nobody"), null);
});

test("whatsapp_events exposes insert and read only: no update, delete, replace or bulk helper exists", async () => {
  const events = stores().events("tenant-a");
  assert.deepEqual(Object.keys(events).sort(), ["get", "insert", "list"]);
  assert.ok(Object.isFrozen(events));
  for (const name of Object.keys(events)) assert.doesNotMatch(name, /update|delete|remove|replace|bulk|drop/i);
  const exported = Object.keys(mod).filter((k) => /event/i.test(k));
  assert.ok(exported.length > 0);
  for (const name of exported) assert.doesNotMatch(name, /update|delete|remove|replace|bulk|drop/i);
});

test("event payload: ids, counts and codes only; every forbidden field is refused (R-39)", async () => {
  const s = stores();
  const ok = await s.events("tenant-a").insert({ eventType: "sync.completed", actorKind: "system", linkId: "6a8d0c692fcc75f0e911b801", data: { fetched: 4, newTurns: 4, candidatesCreated: 1, runId: "6a8d0c692fcc75f0e911b8a1" } });
  assert.equal(ok.tenantId, "tenant-a");
  assert.match(ok._id, /^[0-9a-f]{24}$/);
  assert.ok(await s.events("tenant-a").get(ok._id));
  assert.equal(await s.events("tenant-b").get(ok._id), null);
  for (const field of FORBIDDEN_EVENT_FIELDS) {
    await assert.rejects(() => s.events("tenant-a").insert({ eventType: "link.approved", actorKind: "user", data: { [field]: "x" } as never }), /not allowed/, field);
  }
  await assert.rejects(() => s.events("tenant-a").insert({ eventType: "link.approved", actorKind: "user", data: { reason: { nested: "text" } } as never }), /code, id or count/);
  await assert.rejects(() => s.events("tenant-a").insert({ eventType: "link.approved", actorKind: "user", text: "hello" } as never), /not allowed/);
  await assert.rejects(() => s.events("tenant-a").insert({ eventType: "link.approved", actorKind: "user", archiverOwnerId: OWNER } as never), /not allowed/);
});

test("the data-key allowlist in code equals the schema's data.properties (drift guard)", () => {
  const schema = JSON.parse(readFileSync(new URL("../../../../schema/whatsapp_events.schema.json", import.meta.url), "utf8"));
  assert.deepEqual([...EVENT_DATA_KEYS].sort(), Object.keys(schema.properties.data.properties).sort());
  assert.equal(schema.properties.data.additionalProperties, false);
  assert.equal(schema.additionalProperties, false);
  for (const field of FORBIDDEN_EVENT_FIELDS) assert.ok(!(EVENT_DATA_KEYS as readonly string[]).includes(field), field);
});

const url = process.env.WA_REVIEW_TEST_MONGO_URL;
test("real Mongo: cursor paging in (at, _id) order, link filter, tenant scoping", { skip: url ? false : "WA_REVIEW_TEST_MONGO_URL not set (needs a test Mongo)" }, async () => {
  const name = `lkb_test_wa_links_${Date.now()}`;
  assert.match(name, /^lkb_test_wa_links_\d+$/u);
  const client = await new MongoClient(url!).connect();
  try {
    const s = whatsAppLinkStores(client.db(name));
    const ev = s.events("tenant-a");
    const at = (n: number) => `2026-10-29T10:00:0${n}.000Z`;
    const ids: string[] = [];
    for (const n of [0, 1, 1, 2, 3]) ids.push((await ev.insert({ eventType: "selection.changed", actorKind: "user", at: at(n), linkId: n === 3 ? "6a8d0c692fcc75f0e911b802" : "6a8d0c692fcc75f0e911b801", data: { groupCount: n } }))._id);
    await s.events("tenant-b").insert({ eventType: "selection.changed", actorKind: "user", at: at(0), data: { groupCount: 9 } });
    const all = await ev.list();
    assert.equal(all.length, 5);
    const key = (e: { at: string; _id: string }) => `${e.at}|${e._id}`;
    assert.deepEqual(all.map(key), all.map(key).sort(), "ordered by (at, _id)");
    assert.deepEqual(new Set(all.map((e) => e._id)), new Set(ids));
    const page1 = await ev.list({ limit: 2 });
    const page2 = await ev.list({ limit: 2, afterId: page1[1]!._id });
    const page3 = await ev.list({ limit: 2, afterId: page2[1]!._id });
    assert.deepEqual([...page1, ...page2, ...page3].map((e) => e._id), all.map((e) => e._id));
    assert.deepEqual((await ev.list({ afterId: page1[1]!._id, limit: 2 })).map((e) => e._id), page2.map((e) => e._id), "replay from a cursor returns identical ids");
    assert.equal((await ev.list({ linkId: "6a8d0c692fcc75f0e911b802" })).length, 1);
    await assert.rejects(() => s.events("tenant-b").list({ afterId: ids[0] }), /unknown cursor/);
  } finally { await client.db(name).dropDatabase(); await client.close(); }
});
