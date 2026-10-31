/**
 * W12 (R-40) GET /whatsapp/events over the REAL server (requireAuth, session guards and the integrated-workflow mount run), with the
 * in-memory EventsFeed double that mirrors the Mongo accessor (tenant-scoped, `_id` order, unknown cursor throws).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { user } from "../../user-accounts/sessions.testsupport.js";
import { linksRig } from "./links.rig.testsupport.js";
import { memoryEventsFeed } from "./links.testsupport.js";

const U = [
  user({ _id: "u-admin", tenantId: "tenant-1", role: "admin" }), user({ _id: "u-member", tenantId: "tenant-1" }),
  user({ _id: "u-viewer", tenantId: "tenant-1", role: "viewer" }), user({ _id: "t2-admin", tenantId: "tenant-2", role: "admin" }),
];
const KEYS = {
  "k-admin": { tenantId: "tenant-1", keyId: "key-admin", scopes: ["whatsapp-admin"] }, "k-link": { tenantId: "tenant-1", keyId: "key-link", scopes: ["whatsapp-link"] },
  "k-other": { tenantId: "tenant-1", keyId: "key-other", scopes: ["sessions"] }, "k-t2": { tenantId: "tenant-2", keyId: "key-t2", scopes: ["whatsapp-admin"] },
};
const L1 = "a".repeat(24);
async function setup(seed = 7, o: { noEvents?: boolean } = {}) {
  const feed = memoryEventsFeed();
  for (let i = 0; i < seed; i++) feed.add("tenant-1", { eventType: "sync.completed", linkId: L1, data: { groupCount: i, fetched: i } });
  feed.add("tenant-2", { eventType: "link.requested", linkId: "b".repeat(24), data: { toState: "requested" } });
  const rig = await linksRig({ users: U, keys: KEYS, ...(o.noEvents ? {} : { events: feed }) });
  for (const u of U) await rig.login(u._id, u.tenantId);
  return { rig, feed };
}
const ids = (r: { json: Record<string, any> | null }): string[] => (r.json!.events as Array<{ id: string }>).map(e => e.id);

test("C2 auth: no credential 401; a member, a viewer, a link-scope key and an unrelated key are refused; an admin session and an admin key read", async () => {
  const { rig } = await setup(); try {
    assert.equal((await rig.call(null, "GET", "/whatsapp/events")).status, 401);
    for (const who of [{ user: "u-member" }, { user: "u-viewer" }, { key: "k-link" }, { key: "k-other" }] as const) {
      const r = await rig.call(who, "GET", "/whatsapp/events");
      assert.equal(r.status, 403, JSON.stringify(who)); assert.equal(r.json!.events, undefined, "a refusal leaks no events");
    }
    assert.equal((await rig.call({ user: "u-admin" }, "GET", "/whatsapp/events")).status, 200);
    assert.equal((await rig.call({ key: "k-admin" }, "GET", "/whatsapp/events")).status, 200);
  } finally { await rig.close(); }
});

test("C2 read-only surface: no write verb on /whatsapp/events answers 2xx (R-40: no push, no registry)", async () => {
  const { rig, feed } = await setup(); const before = feed.rows.length; try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const who of [{ key: "k-admin" }, { user: "u-admin" }] as const) {
        const r = await rig.call(who, method, "/whatsapp/events", method === "DELETE" ? undefined : {});
        assert.ok(r.status >= 400, `${method} ${JSON.stringify(who)} -> ${r.status}`);
      }
    }
    assert.equal(feed.rows.length, before);
  } finally { await rig.close(); }
});

test("C2 cursor paging: pages chain without gap or overlap, only this tenant's events appear, and replaying a cursor returns identical ids", async () => {
  const { rig, feed } = await setup(7); try {
    const all = feed.rows.filter(r => r.tenantId === "tenant-1").map(r => r._id);
    const seen: string[] = []; let after: string | null = null; let pages = 0;
    for (;;) {
      const r: Awaited<ReturnType<typeof rig.call>> = await rig.call({ key: "k-admin" }, "GET", `/whatsapp/events?limit=3${after ? `&after=${after}` : ""}`);
      assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store");
      const page = ids(r); if (page.length === 0) { assert.equal(r.json!.nextCursor, null); break; }
      assert.ok(page.length <= 3); seen.push(...page); pages++; after = r.json!.nextCursor as string;
      assert.equal(after, page[page.length - 1], "the cursor is the last id of the page");
    }
    assert.deepEqual(seen, all, "every tenant-1 event exactly once, in order"); assert.equal(pages, 3);
    assert.ok(seen.every(id => feed.rows.find(r => r._id === id)!.tenantId === "tenant-1"), "tenant-2's event never appears");
    const first = await rig.call({ key: "k-admin" }, "GET", `/whatsapp/events?after=${all[1]}&limit=100`);
    const again = await rig.call({ user: "u-admin" }, "GET", `/whatsapp/events?after=${all[1]}&limit=100`);
    assert.deepEqual(ids(first), all.slice(2)); assert.deepEqual(ids(again), ids(first), "replay from a cursor returns identical ids");
    feed.add("tenant-1", { eventType: "sync.failed", linkId: L1, data: { errorCode: "unknown" } });
    const grown = await rig.call({ key: "k-admin" }, "GET", `/whatsapp/events?after=${all[1]}&limit=100`);
    assert.deepEqual(ids(grown).slice(0, ids(first).length), ids(first), "new events only extend the tail");
    const t2 = await rig.call({ key: "k-t2" }, "GET", "/whatsapp/events");
    assert.deepEqual(t2.json!.events.map((e: any) => e.eventType), ["link.requested"]);
  } finally { await rig.close(); }
});

test("C1 a second writer's event with an earlier `at` committed after the consumer read is still returned from its cursor (ISS-WAEF-001), and an unknown cursor is still 400", async () => {
  const { rig, feed } = await setup(2); try {
    const mine = feed.rows.filter(r => r.tenantId === "tenant-1").map(r => r._id);
    const get = (q: string) => rig.call({ key: "k-admin" }, "GET", `/whatsapp/events${q}`);
    const first = await get(`?limit=100`); assert.deepEqual(ids(first), mine); const cursor = first.json!.nextCursor as string;
    const late = feed.add("tenant-1", { eventType: "sync.failed", linkId: L1, at: "2000-01-01T00:00:00.000Z", data: { errorCode: "unknown" } });
    assert.deepEqual(ids(await get(`?after=${cursor}`)), [late._id], "delivered although its `at` is older than every event already read");
    assert.deepEqual(ids(await get(`?after=${mine[0]}`)), [...mine.slice(1), late._id]);
    assert.equal((await get(`?after=ffffffffffffffffffffffff`)).json!.error, "unknown_cursor");
  } finally { await rig.close(); }
});

test("C2 query validation: a malformed or foreign cursor and a bad limit are 400 (nothing is guessed); the tenant never comes from the query", async () => {
  const { rig, feed } = await setup(3); try {
    const t2Id = feed.rows.find(r => r.tenantId === "tenant-2")!._id;
    const get = (q: string) => rig.call({ key: "k-admin" }, "GET", `/whatsapp/events${q}`);
    for (const q of ["?after=nope", "?after=", "?after=a&after=b", `?after=${"f".repeat(24)}`, `?after=${t2Id}`]) {
      const r = await get(q); assert.equal(r.status, 400, q); assert.match(String(r.json!.error), /^(invalid_cursor|unknown_cursor)$/, q);
    }
    for (const q of ["?limit=0", "?limit=-1", "?limit=abc", "?limit=1.5", "?limit=501", "?limit=1&limit=2", "?limit="]) assert.equal((await get(q)).status, 400, q);
    assert.equal((await get("?limit=500")).status, 200);
    assert.deepEqual(ids(await get("?tenantId=tenant-2")), feed.rows.filter(r => r.tenantId === "tenant-1").map(r => r._id), "a tenantId in the query is ignored");
    assert.equal((await get("?limit=2")).json!.events.length, 2); assert.equal((await get("")).json!.events.length, 3, "default limit covers a small feed");
  } finally { await rig.close(); }
});

test("C1/C2 the response is an allowlist projection: tenant id, unknown stored fields and non-contract data keys never leave the process", async () => {
  const { rig, feed } = await setup(0); try {
    feed.add("tenant-1", { eventType: "link.connected", linkId: L1, actorKind: "user", actorId: "user:u-member", data: { fromState: "approved", toState: "active", jid: "999@g.us", groupSubject: "CANARY-SUBJECT", reason: "relinked" }, secret: "CANARY-SECRET", archiverOwnerId: "c".repeat(24) });
    const r = await rig.call({ key: "k-admin" }, "GET", "/whatsapp/events");
    assert.deepEqual(Object.keys(r.json!).sort(), ["events", "nextCursor"]);
    const ev = r.json!.events[0];
    assert.deepEqual(Object.keys(ev).sort(), ["actorId", "actorKind", "at", "data", "eventType", "id", "linkId"]);
    assert.deepEqual(ev.data, { fromState: "approved", toState: "active", reason: "relinked" });
    assert.ok(!/CANARY|tenant-1|999@g\.us/.test(r.text), r.text);
  } finally { await rig.close(); }
});

test("C2 without a wired feed the route answers 503 to an admin and still 403 to a member (fails closed)", async () => {
  const { rig } = await setup(1, { noEvents: true }); try {
    assert.equal((await rig.call({ key: "k-admin" }, "GET", "/whatsapp/events")).status, 503);
    assert.equal((await rig.call({ user: "u-member" }, "GET", "/whatsapp/events")).status, 403);
  } finally { await rig.close(); }
});

test("C2 a feed failure is a generic 503 with no driver text", async () => {
  const { rig, feed } = await setup(1); try {
    feed.list = async () => { throw new Error("mongodb://secret-host:27018 exploded"); };
    const r = await rig.call({ key: "k-admin" }, "GET", "/whatsapp/events");
    assert.equal(r.status, 503); assert.ok(!/secret-host|exploded/.test(r.text));
  } finally { await rig.close(); }
});

test("C3 the router file registers exactly one GET route and nothing that pushes, registers or calls out", () => {
  const src = readFileSync(new URL("./events-router.ts", import.meta.url), "utf8");
  assert.deepEqual([...src.matchAll(/router\.(get|post|put|patch|delete|all|use)\(/g)].map(m => m[1]), ["use", "get"], "one header middleware, one GET");
  assert.ok(!/router\.(post|put|patch|delete|all)\(/.test(src));
});

after(() => undefined);
