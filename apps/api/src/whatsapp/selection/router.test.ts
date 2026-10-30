/**
 * W6 over HTTP: the REAL createServer (requireAuth, the session guards incl. CSRF and viewer read-only) with the selection router
 * mounted at the same post-auth point the composition uses, over the in-memory links store and the in-repo fake archiver reached
 * through the real W3 client. The fake is the CONTRACT's stand-in: nothing here proves archiver-side behaviour.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Users } from "@lkb/core";
import { buildTestDeps, fakeKeyStore } from "../../fixtures.js";
import { createServer } from "../../server.js";
import { COOKIE_NAME_SECURE } from "../../user-accounts/cookie.js";
import { csrfTokenFor } from "../../user-accounts/csrf.js";
import { createSessionAuth } from "../../user-accounts/principal.js";
import { createSessionService } from "../../user-accounts/sessions.js";
import { fakeClock, memorySessionStore, memoryUsers, user } from "../../user-accounts/sessions.testsupport.js";
import { ORIGIN, SECRET, type Who } from "../../user-accounts/admin.testsupport.js";
import { createArchiverClient, type ArchiverClient } from "../archiver/client.js";
import { loadArchiverConfig } from "../archiver/config.js";
import { startFakeArchiver } from "../archiver/fake-archiver.js";
import { memoryLinksStore, seed, type MemStore } from "../links/links.testsupport.js";
import type { LinkRow } from "../links/service.js";
import { createWhatsAppSelectionRouter } from "./router.js";
import { createSelectionService, type SelectionEvent } from "./service.js";

const T1 = "tenant-1";
const U: Users[] = [
  user({ _id: "u-admin", tenantId: T1, role: "admin" }), user({ _id: "u-member", tenantId: T1 }), user({ _id: "u-member2", tenantId: T1 }),
  user({ _id: "u-viewer", tenantId: T1, role: "viewer" }), user({ _id: "u-pending", tenantId: T1, status: "pending" }),
  user({ _id: "t2-admin", tenantId: "tenant-2", role: "admin" }), user({ _id: "t2-member", tenantId: "tenant-2" }),
];
const KEYS = {
  "k-link": { tenantId: T1, scopes: ["whatsapp-link"] }, "k-all": { tenantId: T1, scopes: ["whatsapp-link", "whatsapp-admin"] },
  "k-admin": { tenantId: T1, scopes: ["whatsapp-admin"] }, "k-other": { tenantId: T1, scopes: ["sessions"] },
};
const fake = await startFakeArchiver();
after(async () => { await fake.stop(); });

const JID_A = "120363000000000001@g.us", JID_B = "120363000000000002@g.us", JID_C = "120363000000000003-1600000000@g.us";
const GROUPS = [{ jid: JID_A, subject: "CANARY-SUBJECT-alpha", participantCount: 12 }, { jid: JID_B, subject: "CANARY-SUBJECT-beta", participantCount: 5 }];
const as = (u: string): Who => ({ user: u });
const quiet = { warn: () => {}, error: () => {} };

interface Spy { writes: Array<{ op: string; args: unknown[] }>; client: ArchiverClient }
function spyOn(client: ArchiverClient): Spy {
  const writes: Spy["writes"] = [];
  const wrap = <K extends "setGroupTracking" | "setPeople">(k: K): ArchiverClient[K] => ((...a: unknown[]) => { writes.push({ op: k, args: a }); return (client[k] as (...x: unknown[]) => unknown)(...a); }) as ArchiverClient[K];
  return { writes, client: { ...client, setGroupTracking: wrap("setGroupTracking"), setPeople: wrap("setPeople") } };
}

interface RigOpts { archiver?: "fake" | "none" | "dead"; appendFails?: boolean; users?: Users[] }
async function rig(o: RigOpts = {}) {
  const users = o.users ?? U, clock = fakeClock(), mem = memorySessionStore(), lookup = memoryUsers(users), store: MemStore = memoryLinksStore();
  const sessions = createSessionService({ store: mem.store, users: lookup, now: clock.now });
  const real = createArchiverClient(loadArchiverConfig({
    WHATSAPP_ARCHIVER_API_URL: o.archiver === "dead" ? "http://127.0.0.1:9" : fake.url, WHATSAPP_ARCHIVER_API_TOKEN: fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1",
  })!, { sleep: async () => {} });
  const seeder = createArchiverClient(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: fake.url, WHATSAPP_ARCHIVER_API_TOKEN: fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" })!, { sleep: async () => {} });
  const spy = spyOn(real);
  const events: Array<SelectionEvent & { tenantId: string }> = [], logs: string[] = [];
  const log = { warn: (m: string, f?: unknown) => { logs.push(m + JSON.stringify(f ?? {})); }, error: (m: string, f?: unknown) => { logs.push(m + JSON.stringify(f ?? {})); } };
  const service = createSelectionService({
    links: { get: (t, id) => store.get(t, id) }, archiver: o.archiver === "none" ? null : spy.client, log,
    appendEvent: async (t, e) => { if (o.appendFails) throw new Error("mongo down"); events.push({ ...structuredClone(e), tenantId: t }); },
  });
  const userAccounts = { session: createSessionAuth({ sessions, cookie: { basePath: "", production: true }, csrf: { secret: SECRET, allowedOrigins: [ORIGIN] } }) };
  // The selection router rides the `whatsappReview` slot: mounted post-auth, post-CSRF, exactly where the composition mounts it.
  const app = createServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), userAccounts, whatsappReview: createWhatsAppSelectionRouter({ service }, quiet) }));
  const http = app.listen(0, "127.0.0.1"); await new Promise(r => http.once("listening", r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const live = new Map<string, { token: string; sessionId: string }>();
  for (const u of users) { const { token, session } = await sessions.create(u.tenantId, u._id); live.set(u._id, { token, sessionId: session._id }); }
  let tick = 0;
  async function call(who: Who, method: string, path: string, body?: unknown) {
    fake.control.setNow(Date.now() + ++tick * 61_000); // fresh archiver rate-limit window per request (the fake clock never advances by itself)
    const headers: Record<string, string> = { connection: "close" };
    if (who && "user" in who) {
      const s = live.get(who.user)!; headers.cookie = `${COOKIE_NAME_SECURE}=${s.token}`;
      if (who.origin !== null) headers.origin = who.origin ?? ORIGIN;
      if (who.csrf !== null) headers["x-lkb-csrf"] = who.csrf ?? csrfTokenFor(s.sessionId, SECRET);
    } else if (who && "key" in who) headers.authorization = `Bearer ${who.key}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
    const text = await res.text(); let json: Record<string, any> | null = null;
    try { json = JSON.parse(text) as Record<string, any>; } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  /** An archiver owner with seeded groups plus the link row that points at it. */
  async function link(over: Partial<LinkRow> = {}, groups = GROUPS): Promise<{ row: LinkRow; ownerId: string }> {
    const ref = (await import("node:crypto")).randomBytes(12).toString("hex");
    const { ownerId } = await seeder.ensureOwner(ref);
    fake.control.seedGroups(ownerId, groups);
    const row = seed(store, { tenantId: T1, state: "active", userId: "u-member", archiverOwnerId: ownerId, activatedAt: "2026-10-30T00:00:00.000Z", ...over });
    return { row, ownerId };
  }
  return { call, store, events, logs, spy, link, close: () => new Promise<void>(r => http.close(() => r())) };
}
const put = (id: string, jid: string) => `/whatsapp/links/${id}/groups/${encodeURIComponent(jid)}`;

test("C1 owner: marks and unmarks through the archiver; the archiver holds the state", async () => {
  const r = await rig(); try {
    const { row, ownerId } = await r.link();
    const m = await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true });
    assert.deepEqual([m.status, m.json!.changed, m.json!.group.marked, m.headers.get("cache-control")], [200, true, true, "no-store"]);
    assert.deepEqual(fake.control.owner(ownerId)!.tracked, [JID_A]);
    const list = await r.call(as("u-member"), "GET", `/whatsapp/links/${row._id}/groups`);
    assert.deepEqual([list.status, list.json!.view, list.json!.canEdit, list.json!.groups.length, list.json!.markedCount], [200, "owner", true, 2, 1]);
    const un = await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: false });
    assert.deepEqual([un.status, un.json!.changed, fake.control.owner(ownerId)!.tracked], [200, true, []]);
  } finally { await r.close(); }
});

test("C1 refusals: admin, other member, viewer, pending, every key and other tenants cannot change a selection; nothing reaches the archiver", async () => {
  const r = await rig(); try {
    const { row, ownerId } = await r.link();
    const url = put(row._id, JID_A), body = { marked: true };
    const expect: Array<[Who, number]> = [
      [as("u-admin"), 403], [as("u-member2"), 404], [as("u-viewer"), 403], [as("u-pending"), 403], [as("t2-admin"), 404], [as("t2-member"), 404],
      [{ key: "k-link" }, 403], [{ key: "k-all" }, 403], [{ key: "k-admin" }, 403], [{ key: "k-other" }, 403], [null, 401],
    ];
    for (const [who, status] of expect) assert.equal((await r.call(who, "PUT", url, body)).status, status, JSON.stringify(who));
    for (const sub of ["people"]) {
      assert.equal((await r.call(as("u-admin"), "PUT", `${url}/${sub}`, { personIds: [] })).status, 403, "admin may not change people");
      assert.equal((await r.call(as("u-admin"), "GET", `${url}/${sub}`)).status, 403, "admin does not see people");
      assert.equal((await r.call(as("u-member2"), "GET", `${url}/${sub}`)).status, 404);
    }
    assert.deepEqual([fake.control.owner(ownerId)!.tracked, r.spy.writes.length, r.events.length], [[], 0, 0]);
  } finally { await r.close(); }
});

test("C1 admin reads the marked list (marked groups only) but cannot change it (R-20); a key with whatsapp-admin may read, a plain key may not", async () => {
  const r = await rig(); try {
    const { row } = await r.link();
    await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true });
    const a = await r.call(as("u-admin"), "GET", `/whatsapp/links/${row._id}/groups`);
    assert.deepEqual([a.status, a.json!.view, a.json!.canEdit, a.json!.groups.map((g: any) => g.jid), a.json!.markedCount], [200, "admin", false, [JID_A], 1]);
    assert.equal((await r.call({ key: "k-admin" }, "GET", `/whatsapp/links/${row._id}/groups`)).status, 200);
    assert.equal((await r.call({ key: "k-other" }, "GET", `/whatsapp/links/${row._id}/groups`)).status, 403);
    assert.equal((await r.call(as("u-member2"), "GET", `/whatsapp/links/${row._id}/groups`)).status, 404, "another member");
    assert.equal((await r.call(as("t2-admin"), "GET", `/whatsapp/links/${row._id}/groups`)).status, 404, "another tenant's admin");
    assert.equal((await r.call(as("u-viewer"), "GET", `/whatsapp/links/${row._id}/groups`)).status, 403);
  } finally { await r.close(); }
});

test("C1 gate wa-revoked-link-read-access: only an ACTIVE link gives its owner selection access; an admin still passes", async () => {
  const r = await rig(); try {
    for (const state of ["requested", "approved", "suspended", "rejected", "unlinked", "revoked"] as const) {
      const { row } = await r.link({ state });
      const g = await r.call(as("u-member"), "GET", `/whatsapp/links/${row._id}/groups`);
      const w = await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true });
      const p = await r.call(as("u-member"), "GET", `${put(row._id, JID_A)}/people`);
      assert.deepEqual([g.status, g.json!.error, w.status, w.json!.error, p.status], [409, "link_not_active", 409, "link_not_active", 409], state);
      if (state === "suspended") assert.equal((await r.call(as("u-admin"), "GET", `/whatsapp/links/${row._id}/groups`)).status, 200, "admin passes on a suspended link");
      assert.equal((await r.call(as("u-admin"), "PUT", put(row._id, JID_A), { marked: true })).status, 403);
    }
    assert.equal(r.spy.writes.length, 0);
    const { row: noOwner } = await r.link({ state: "active" }); delete noOwner.archiverOwnerId;
    const x = await r.call(as("u-member"), "GET", `/whatsapp/links/${noOwner._id}/groups`);
    assert.deepEqual([x.status, x.json!.error], [409, "not_connected"]);
  } finally { await r.close(); }
});

test("C1 CSRF: a cookie principal without the token, with a forged one or a foreign origin is refused on every unsafe route; a GET needs no token", async () => {
  const r = await rig(); try {
    const { row, ownerId } = await r.link();
    const routes: Array<[string, unknown]> = [[put(row._id, JID_A), { marked: true }], [`${put(row._id, JID_A)}/people`, { personIds: [] }]];
    for (const [path, body] of routes) for (const bad of [{ user: "u-member", csrf: null }, { user: "u-member", csrf: "forged" }, { user: "u-member", origin: "https://evil.example" }, { user: "u-member", origin: null }] as const)
      assert.equal((await r.call(bad, "PUT", path, body)).status, 403, `${path} ${JSON.stringify(bad)}`);
    assert.deepEqual([fake.control.owner(ownerId)!.tracked, r.spy.writes.length, r.events.length], [[], 0, 0]);
    assert.equal((await r.call({ user: "u-member", csrf: null, origin: null }, "GET", `/whatsapp/links/${row._id}/groups`)).status, 200);
  } finally { await r.close(); }
});

test("C1/C3 validation: strict body (unknown/mass-assignment fields), types, malformed ids; nothing reaches the archiver", async () => {
  const r = await rig(); try {
    const { row } = await r.link();
    const id = row._id;
    for (const body of [{}, { marked: "yes" }, { marked: true, trackAllSenders: "no" }, { marked: true, tenantId: "tenant-2" }, { marked: true, archiverOwnerId: "a".repeat(24) }, { marked: true, jid: JID_B }, [], "str"])
      assert.equal((await r.call(as("u-member"), "PUT", put(id, JID_A), body)).status, 400, JSON.stringify(body));
    for (const jid of ["123@g.us.evil", "abc@g.us", "123@s.whatsapp.net", "..%2f..%2fowners", "1".repeat(60) + "@g.us", "12345@g.us%00"]) {
      const res = await r.call(as("u-member"), "PUT", `/whatsapp/links/${id}/groups/${jid.includes("%") ? jid : encodeURIComponent(jid)}`, { marked: true });
      assert.ok([400, 404].includes(res.status), `${jid} -> ${res.status}`);
    }
    for (const bad of ["zz", "f".repeat(23), "nope"]) assert.equal((await r.call(as("u-member"), "GET", `/whatsapp/links/${bad}/groups`)).status, 404);
    const people = `${put(id, JID_A)}/people`;
    for (const body of [{}, { personIds: "a" }, { personIds: [5] }, { personIds: ["nope"] }, { personIds: ["a".repeat(24), "a".repeat(24)] }, { personIds: Array.from({ length: 1001 }, (_, i) => i.toString(16).padStart(24, "0")) }, { personIds: [], extra: 1 }])
      assert.equal((await r.call(as("u-member"), "PUT", people, body)).status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(r.spy.writes.length, 0);
  } finally { await r.close(); }
});

test("C3 a jid that is not in THIS owner's group list is 404 (including another owner's group in the same tenant); a link id of another person is 404", async () => {
  const r = await rig(); try {
    const mine = await r.link({}, GROUPS);
    const theirs = await r.link({ userId: "u-member2" }, [{ jid: JID_C, subject: "CANARY-SUBJECT-theirs", participantCount: 3 }]);
    const x = await r.call(as("u-member"), "PUT", put(mine.row._id, JID_C), { marked: true });
    assert.deepEqual([x.status, x.json!.error], [404, "group_not_found"]);
    assert.equal((await r.call(as("u-member"), "PUT", put(theirs.row._id, JID_C), { marked: true })).status, 404, "their link id");
    assert.equal((await r.call(as("u-member"), "GET", `/whatsapp/links/${theirs.row._id}/groups`)).status, 404);
    assert.equal((await r.call(as("u-member"), "PUT", `${put(mine.row._id, JID_C)}/people`, { personIds: [] })).status, 404);
    assert.deepEqual([fake.control.owner(theirs.ownerId)!.tracked, r.spy.writes.length], [[], 0]);
  } finally { await r.close(); }
});

test("C3 people: owner lists and chooses people of a MARKED group; an unknown person is 404; an unmarked group is 409", async () => {
  const r = await rig(); try {
    const { row, ownerId } = await r.link();
    const [p1, p2] = fake.control.seedPeople(ownerId, JID_A, [{ displayName: "Asha" }, { displayName: "Ravi" }]) as [string, string];
    const url = `${put(row._id, JID_A)}/people`;
    const un = await r.call(as("u-member"), "PUT", url, { personIds: [p1] });
    assert.deepEqual([un.status, un.json!.error], [409, "group_not_marked"]);
    await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true, trackAllSenders: false });
    const list = await r.call(as("u-member"), "GET", url);
    assert.deepEqual([list.status, list.json!.people.length, list.json!.people.every((x: any) => x.selected === false)], [200, 2, true]);
    const set = await r.call(as("u-member"), "PUT", url, { personIds: [p1, p2] });
    assert.deepEqual([set.status, set.json!.changed, set.json!.count, set.json!.capture], [200, true, 2, "selected"]);
    const again = await r.call(as("u-member"), "PUT", url, { personIds: [p2, p1] });
    assert.deepEqual([again.status, again.json!.changed], [200, false]);
    const ghost = await r.call(as("u-member"), "PUT", url, { personIds: ["e".repeat(24)] });
    assert.deepEqual([ghost.status, ghost.json!.error], [404, "person_not_found"]);
  } finally { await r.close(); }
});

test("C4/C6 events: one selection.changed per real change, counts only; an idempotent repeat writes nothing and does not call the archiver to write", async () => {
  const r = await rig(); try {
    const { row, ownerId } = await r.link();
    const body = { marked: true };
    assert.equal((await r.call(as("u-member"), "PUT", put(row._id, JID_A), body)).json!.changed, true);
    assert.equal(r.events.length, 1);
    const rep = await r.call(as("u-member"), "PUT", put(row._id, JID_A), body);
    assert.deepEqual([rep.status, rep.json!.changed, r.events.length, r.spy.writes.length], [200, false, 1, 1], "second mark: 200, no write, no event");
    const un = await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: false });
    const unRep = await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: false });
    assert.deepEqual([un.json!.changed, unRep.status, unRep.json!.changed, r.events.length, r.spy.writes.length], [true, 200, false, 2, 2]);
    await r.call(as("u-member"), "PUT", put(row._id, JID_B), { marked: true });
    const [pid] = fake.control.seedPeople(ownerId, JID_B, [{ displayName: "CANARY-PERSON-Asha", number: "919812345678" }]) as [string];
    await r.call(as("u-member"), "PUT", `${put(row._id, JID_B)}/people`, { personIds: [pid] });
    assert.equal(r.events.length, 4);
    const e = r.events[0]!;
    assert.deepEqual([e.eventType, e.actorKind, e.actorId, e.linkId, e.tenantId, e.data], ["selection.changed", "user", "user:u-member", row._id, T1, { groupCount: 2, markedCount: 1 }]);
    assert.deepEqual(r.events[1]!.data, { groupCount: 2, markedCount: 0 });
    assert.deepEqual(r.events[3]!.data, { groupCount: 2, markedCount: 1, count: 1 });
    for (const ev of r.events) assert.deepEqual(Object.keys(ev.data).filter(k => !["groupCount", "markedCount", "count"].includes(k)), [], "counts only");
    const dump = JSON.stringify([r.events, r.logs]);
    for (const secret of [JID_A, JID_B, "CANARY-SUBJECT", "CANARY-PERSON", "919812345678", pid, ownerId, fake.token]) assert.equal(dump.includes(secret), false, `no ${secret} in events or logs`);
    for (const d of r.events.map(x => x.data)) for (const v of Object.values(d)) assert.equal(Number.isInteger(v), true);
  } finally { await r.close(); }
});

test("C4 the change is authoritative: a failing event write is logged by code and does not undo or fail the change", async () => {
  const r = await rig({ appendFails: true }); try {
    const { row, ownerId } = await r.link();
    const m = await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true });
    assert.deepEqual([m.status, m.json!.changed, fake.control.owner(ownerId)!.tracked], [200, true, [JID_A]]);
    assert.ok(r.logs.some(l => l.includes("event_write_failed")));
    assert.equal(JSON.stringify(r.logs).includes("mongo down"), false, "no driver text");
  } finally { await r.close(); }
});

test("C2 the KB keeps no copy of the selection: link rows and the stored state are byte-identical before and after any selection traffic", async () => {
  const r = await rig(); try {
    const { row, ownerId } = await r.link();
    const before = JSON.stringify([...r.store.rows.values()]);
    const [pid] = fake.control.seedPeople(ownerId, JID_A, [{ displayName: "Asha" }]) as [string];
    await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true, trackAllSenders: false });
    await r.call(as("u-member"), "PUT", `${put(row._id, JID_A)}/people`, { personIds: [pid] });
    await r.call(as("u-member"), "GET", `/whatsapp/links/${row._id}/groups`);
    await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: false });
    assert.equal(JSON.stringify([...r.store.rows.values()]), before, "no link field holds or mirrors the selection");
    assert.deepEqual(r.spy.writes.map(w => w.op), ["setGroupTracking", "setPeople", "setGroupTracking"], "every write went through the client");
    assert.equal((r.spy.writes[0]!.args[0]), ownerId, "the owner id is the link row's, never the request's");
  } finally { await r.close(); }
});

test("C2 source assertion: no selection file imports a database driver, names the archiver DB or its collections, or calls a Mongo write", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  assert.deepEqual(files.sort(), ["router.ts", "service.ts"]);
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const f of files) {
    const src = strip(readFileSync(join(dir, f), "utf8"));
    assert.equal(/\b(insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|bulkWrite|findOneAndUpdate|findOneAndReplace|findOneAndDelete|\$set|\$unset)\b/.test(src), false, `${f}: no Mongo write verb`);
    assert.equal(/WHATSAPP_MONGO|whatsapp_msg|MongoClient|\.collection\(|isTracked.*Collection|"groups"|"tracking"/.test(src), false, `${f}: no archiver DB access`);
  }
  const service = strip(readFileSync(join(dir, "service.ts"), "utf8"));
  assert.equal(/from "mongodb"|from "@lkb\/db"/.test(service), false, "the service has no database import at all");
});

test("C5 archiver down: 503 archiver_api_unavailable with no partial local state, no event, no upstream text", async () => {
  const dead = await rig({ archiver: "dead" }); try {
    const { row } = await dead.link();
    const before = JSON.stringify([...dead.store.rows.values()]);
    for (const [m, p, b] of [["GET", `/whatsapp/links/${row._id}/groups`, undefined], ["PUT", put(row._id, JID_A), { marked: true }], ["GET", `${put(row._id, JID_A)}/people`, undefined], ["PUT", `${put(row._id, JID_A)}/people`, { personIds: [] }]] as const) {
      const res = await dead.call(as("u-member"), m, p, b);
      assert.deepEqual([res.status, res.json!.error], [503, "archiver_api_unavailable"], `${m} ${p}`);
    }
    assert.deepEqual([JSON.stringify([...dead.store.rows.values()]), dead.events.length], [before, 0]);
  } finally { await dead.close(); }
  const down = await rig(); try {
    const { row, ownerId } = await down.link();
    fake.control.setStoreDown(true);
    const res = await down.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true });
    fake.control.setStoreDown(false);
    assert.deepEqual([res.status, res.json!.error, down.events.length, fake.control.owner(ownerId)!.tracked], [503, "archiver_api_unavailable", 0, []]);
    assert.equal(/store_unavailable|owner|groups/.test(res.text.replace("archiver_api_unavailable", "")), false, "no upstream detail leaked");
  } finally { await down.close(); }
  const none = await rig({ archiver: "none" }); try {
    const { row } = await none.link();
    assert.equal((await none.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true })).json!.error, "selection_unavailable");
  } finally { await none.close(); }
});

test("an unlinked archiver owner maps to 409 archiver_owner_unavailable (no upstream text)", async () => {
  const r = await rig(); try {
    const { row, ownerId } = await r.link();
    const { createArchiverClient: mk } = await import("../archiver/client.js");
    await mk(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: fake.url, WHATSAPP_ARCHIVER_API_TOKEN: fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" })!).unlinkSession(ownerId);
    const res = await r.call(as("u-member"), "PUT", put(row._id, JID_A), { marked: true });
    assert.deepEqual([res.status, res.json!.error], [409, "archiver_owner_unavailable"]);
  } finally { await r.close(); }
});

test("unwired router (no deps) answers a stable 503 selection_unavailable after the scope check and never reaches an archiver", async () => {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const k = req.header("x-test-scopes"); (req as any).auth = { tenantId: T1, principal: "key", scopes: k ? k.split(",") : [] }; next(); });
  app.use(createWhatsAppSelectionRouter());
  const http = app.listen(0, "127.0.0.1"); await new Promise(r => http.once("listening", r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  try {
    const id = "a".repeat(24);
    const go = (m: string, p: string, scopes: string) => fetch(base + p, { method: m, headers: { "x-test-scopes": scopes, "content-type": "application/json" }, body: m === "GET" ? undefined : "{}" });
    for (const [m, p] of [["GET", `/whatsapp/links/${id}/groups`], ["PUT", put(id, JID_A)], ["GET", `${put(id, JID_A)}/people`], ["PUT", `${put(id, JID_A)}/people`]] as const) {
      const ok = await go(m, p, "whatsapp-link");
      assert.deepEqual([ok.status, ((await ok.json()) as any).error], [503, "selection_unavailable"], `${m} ${p}`);
      assert.equal((await go(m, p, "sessions")).status, 403);
    }
  } finally { await new Promise<void>(r => http.close(() => r())); }
});

test("C1 an admin who OWNS a non-active link is still refused a write (the owner gate applies to admins too), but may read", async () => {
  const r = await rig(); try {
    const { row } = await r.link({ state: "suspended", userId: "u-admin" });
    const w = await r.call(as("u-admin"), "PUT", put(row._id, JID_A), { marked: true });
    assert.deepEqual([w.status, w.json!.error, r.spy.writes.length], [409, "link_not_active", 0]);
    const g = await r.call(as("u-admin"), "GET", `/whatsapp/links/${row._id}/groups`);
    assert.deepEqual([g.status, g.json!.view, g.json!.canEdit], [200, "admin", false]);
  } finally { await r.close(); }
});

test("C4 service: a write the archiver reports as unchanged (a race with another change) writes no event", async () => {
  const store = memoryLinksStore(); const row = seed(store, { tenantId: T1, state: "active", userId: "u-member", archiverOwnerId: "a".repeat(24) });
  const events: unknown[] = [];
  const g = { jid: JID_A, subject: "s", participantCount: 1, isTracked: false, trackAllSenders: false, membersSyncedAt: null };
  const service = createSelectionService({
    links: { get: (t, id) => store.get(t, id) }, appendEvent: async (_t, e) => { events.push(e); },
    archiver: {
      listGroups: async () => ({ source: "cache", refreshedAt: null, truncated: false, groups: [g] }),
      setGroupTracking: async () => ({ jid: JID_A, isTracked: true, trackAllSenders: true, capture: "all", changed: false }),
      listPeople: async () => ({ source: "cache", people: [] }), setPeople: async () => ({ jid: JID_A, count: 0, capture: "none", changed: false }),
    },
  });
  const p = { tenantId: T1, kind: "session" as const, userId: "u-member", actor: "user:u-member", link: true, admin: false };
  const res = await service.setGroup(p, row._id, JID_A, { marked: true });
  assert.deepEqual([res.ok, (res as any).value.changed, events.length], [true, false, 0]);
});
