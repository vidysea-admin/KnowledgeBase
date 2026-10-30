// whatsapp-multiuser W1 acceptance 3 and 4: scoped accessors reject a missing/invalid tenant, a cross-tenant
// findOne returns null, and whatsapp_events exposes insert and read only. Real-Mongo paging runs only when
// WA_REVIEW_TEST_MONGO_URL is set (throwaway lkb_test_wa_links_* database; production names are refused).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import { ObjectId } from "mongodb";
import * as mod from "./whatsapp-links.js";
import { EVENT_DATA_KEYS, FORBIDDEN_EVENT_FIELDS, DEFAULT_STUDENT_DATA, createEventIdGenerator, newWhatsAppEventId, whatsAppLinkStores } from "./whatsapp-links.js";

type Row = Record<string, unknown>;
/** Equality plus the two operators the events paging uses ($gt on a string, $or); anything else throws so a new operator is noticed. */
const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([k, v]) => {
  if (k === "$or") return (v as Row[]).some((f) => matches(row, f));
  if (v !== null && typeof v === "object") {
    const ops = Object.entries(v as Row);
    return ops.every(([op, arg]) => { if (op !== "$gt") throw new Error(`fakeDb: operator ${op} not modelled`); return (row[k] as string) > (arg as string); });
  }
  return row[k] === v;
});
/** Equality-only in-memory stand-in for Db: enough to prove the tenant pin, which is what these tests are about. */
function fakeDb() {
  const tables = new Map<string, Row[]>();
  const table = (name: string) => tables.get(name) ?? tables.set(name, []).get(name)!;
  return {
    tables,
    collection: (name: string) => ({
      insertOne: async (doc: Row) => { table(name).push(doc); return { acknowledged: true, insertedId: doc._id }; },
      findOne: async (filter: Row) => table(name).find((r) => matches(r, filter)) ?? null,
      find: (filter: Row) => {
        let sort: Row = {}; let max = Infinity;
        const cursor = {
          sort: (spec: Row) => { sort = spec; return cursor; },
          limit: (n: number) => { max = n; return cursor; },
          toArray: async () => {
            const keys = Object.entries(sort);
            const rows = table(name).filter((r) => matches(r, filter));
            return rows.sort((a, b) => { for (const [k, dir] of keys) { const x = a[k] as string, y = b[k] as string; if (x !== y) return (x < y ? -1 : 1) * (dir as number); } return 0; }).slice(0, max);
          },
        };
        return cursor;
      },
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

const FEED_ID = /^[0-9a-f]{24}$/u;
const event = (at: string, extra: Row = {}) => ({ eventType: "selection.changed" as const, actorKind: "user" as const, at, data: { groupCount: 1 }, ...extra });

// ISS-WAEF-001 (re-run verbatim per D-015): "add e1 at 00:00:05, list, add e2 at 00:00:04, list after e1 -> e2 absent".
test("C1 ISS-WAEF-001 reproduction: an event with an earlier `at` committed after the consumer read is still returned after its cursor", async () => {
  const s = stores(); const ev = s.events("tenant-a");
  const e1 = await ev.insert(event("2026-10-30T00:00:05.000Z"));
  assert.deepEqual((await ev.list()).map((e) => e._id), [e1._id]);
  const e2 = await s.events("tenant-a").insert(event("2026-10-30T00:00:04.000Z"));
  assert.deepEqual((await ev.list({ afterId: e1._id })).map((e) => e._id), [e2._id], "the late, earlier-`at` event is delivered");
  assert.deepEqual((await ev.list()).map((e) => e._id), [e1._id, e2._id], "a full read orders by the commit-order key, not by `at`");
});

test("C1 a second writer (separate store handle, own clock) with an earlier `at` is delivered to a consumer paging from its cursor, page by page", async () => {
  const db = fakeDb(); const api = whatsAppLinkStores(db).events("tenant-a"); const script = whatsAppLinkStores(db).events("tenant-a");
  const first = await api.insert(event("2026-10-30T10:00:09.000Z")); const second = await api.insert(event("2026-10-30T10:00:09.500Z"));
  const page1 = await api.list({ limit: 1 }); assert.deepEqual(page1.map((e) => e._id), [first._id]);
  const late = await script.insert(event("2026-10-30T10:00:01.000Z"));
  const rest = await api.list({ afterId: page1[0]!._id, limit: 10 });
  assert.deepEqual(rest.map((e) => e._id), [second._id, late._id]);
  assert.deepEqual((await api.list({ afterId: second._id })).map((e) => e._id), [late._id]);
});

test("C2 paging is tenant-scoped and an unknown cursor (absent, or another tenant's event) is refused", async () => {
  const s = stores(); const a = s.events("tenant-a"); const b = s.events("tenant-b");
  const a1 = await a.insert(event("2026-10-30T00:00:01.000Z", { linkId: "6a8d0c692fcc75f0e911b801" })); const b1 = await b.insert(event("2026-10-30T00:00:02.000Z"));
  const a2 = await a.insert(event("2026-10-30T00:00:00.000Z", { linkId: "6a8d0c692fcc75f0e911b802" })); const b2 = await b.insert(event("2026-10-30T00:00:00.500Z"));
  assert.deepEqual((await a.list()).map((e) => e._id), [a1._id, a2._id]); assert.deepEqual((await b.list()).map((e) => e._id), [b1._id, b2._id]);
  assert.deepEqual((await a.list({ afterId: a1._id })).map((e) => e._id), [a2._id], "tenant-b rows interleaved by id never appear");
  assert.deepEqual((await a.list({ linkId: "6a8d0c692fcc75f0e911b802", afterId: a1._id })).map((e) => e._id), [a2._id]);
  await assert.rejects(() => b.list({ afterId: a1._id }), /unknown cursor/); await assert.rejects(() => a.list({ afterId: b1._id }), /unknown cursor/);
  await assert.rejects(() => a.list({ afterId: "ffffffffffffffffffffffff" }), /unknown cursor/);
});

test("C1 the default event id is commit-order-keyed: valid ObjectId hex, same-process strictly increasing, and a later millisecond sorts later whatever the writer's random tail", async () => {
  const ids = Array.from({ length: 2000 }, () => newWhatsAppEventId());
  assert.ok(ids.every((id) => FEED_ID.test(id)) && new Set(ids).size === ids.length);
  assert.deepEqual([...ids].sort(), ids, "one process: generation order is id order");
  const T = Date.UTC(2026, 9, 30, 10, 0, 7, 100);
  assert.equal(new ObjectId(createEventIdGenerator(() => T)()).getTimestamp().getTime(), Math.floor(T / 1000) * 1000, "first four bytes stay epoch seconds (ordered with the existing ObjectId ids)");
  for (let i = 0; i < 300; i++) for (const dt of [1, 37, 900, 1000]) {
    assert.ok(createEventIdGenerator(() => T)() < createEventIdGenerator(() => T + dt)(), `fresh generators (own random tail, as two processes) ${dt}ms apart`);
  }
  const t0 = Date.now(); const stored = await stores().events("tenant-a").insert(event("2026-10-30T00:00:00.000Z")); const t1 = Date.now();
  const written = Buffer.from(stored._id, "hex").readUInt32BE(0) * 1000 + Buffer.from(stored._id, "hex").readUInt16BE(4);
  assert.ok(written >= t0 && written <= t1, "insert's default id carries the writer's millisecond (not a stock ObjectId's random bytes)");
  let now = T; const gen = createEventIdGenerator(() => now);
  const before = gen(); now = T - 5000; const after = gen();
  assert.ok(after > before, "a clock stepping backwards cannot make a later id of one process sort earlier");
});

const url = process.env.WA_REVIEW_TEST_MONGO_URL;
test("real Mongo: cursor paging in _id (commit-order key) order, late earlier-`at` delivery, link filter, tenant scoping", { skip: url ? false : "WA_REVIEW_TEST_MONGO_URL not set (needs a test Mongo)" }, async () => {
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
    assert.deepEqual(all.map((e) => e._id), [...ids].sort(), "ordered by _id");
    assert.deepEqual(new Set(all.map((e) => e._id)), new Set(ids));
    const page1 = await ev.list({ limit: 2 });
    const page2 = await ev.list({ limit: 2, afterId: page1[1]!._id });
    const page3 = await ev.list({ limit: 2, afterId: page2[1]!._id });
    assert.deepEqual([...page1, ...page2, ...page3].map((e) => e._id), all.map((e) => e._id));
    assert.deepEqual((await ev.list({ afterId: page1[1]!._id, limit: 2 })).map((e) => e._id), page2.map((e) => e._id), "replay from a cursor returns identical ids");
    assert.equal((await ev.list({ linkId: "6a8d0c692fcc75f0e911b802" })).length, 1);
    await assert.rejects(() => s.events("tenant-b").list({ afterId: ids[0] }), /unknown cursor/);
    const late = await ev.insert({ eventType: "selection.changed", actorKind: "user", at: "2026-10-29T09:00:00.000Z", data: { groupCount: 7 } });
    assert.deepEqual((await ev.list({ afterId: all[4]!._id })).map((e) => e._id), [late._id], "ISS-WAEF-001: a late event with an earlier `at` is delivered after the last-read cursor");
  } finally { await client.db(name).dropDatabase(); await client.close(); }
});
