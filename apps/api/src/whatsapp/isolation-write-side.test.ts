/**
 * whatsapp-multiuser W7 (R-25, R-28, R-30): route narrowing and error mapping, the stable 502 (ISS-API-003), the cross-owner duplicate flag,
 * the `sourceMeta.whatsappLinkId` stamp and the repair path's scope.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { MongoNetworkError, MongoServerSelectionError } from "mongodb";
import type { WhatsAppMessage } from "@lkb/ingest";
import type { VerifiedKey } from "../auth.js";
import { classifyIngestFailure, createWhatsAppRouter, WHATSAPP_INGEST_FAILURE_CODES, type WhatsAppRouteDeps } from "../routes/whatsapp.js";
import { createMongoWhatsAppDeps } from "./store.js";
import { WhatsAppAmbiguousLinkError, WhatsAppGroupNotFoundError, type WhatsAppCaller, type WhatsAppOwnerGrant, type WhatsAppResolveScope } from "./owner-config.js";
import { createWhatsAppReviewWiring } from "./review/compose.js";
import { SnapshotShrinkError, WHATSAPP_REVIEW_LOG, whatsAppLogId } from "./review/invalidate.js";
import { wireMongoFixture } from "./review/wire-fixtures.js";

const LA = "a".repeat(24), LB = "b".repeat(24), OA = "1".repeat(24), OB = "2".repeat(24);
const PRINCIPALS: Record<string, VerifiedKey> = {
  member: { tenantId: "tenant-a", principal: "session", userId: "uA", scopes: ["whatsapp"] },
  admin: { tenantId: "tenant-a", principal: "session", userId: "boss", scopes: ["whatsapp", "whatsapp-admin"] },
  key: { tenantId: "tenant-a", keyId: "key-1", scopes: ["whatsapp"] },
};
async function routeServer(deps: WhatsAppRouteDeps) {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { const p = PRINCIPALS[String(req.header("x-p"))]; if (!p) { res.status(401).json({ error: "unauthorized" }); return; } req.auth = structuredClone(p); next(); });
  app.use(createWhatsAppRouter(deps));
  const server: Server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  return { url, post: (who: string, body: unknown) => fetch(`${url}/whatsapp/ingest`, { method: "POST", headers: { "x-p": who, "content-type": "application/json" }, body: JSON.stringify(body) }),
    get: (who: string, query = "") => fetch(`${url}/whatsapp/groups${query}`, { headers: { "x-p": who } }),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
function spyDeps(overrides: Partial<WhatsAppRouteDeps> = {}) {
  const seen: { op: string; args: unknown[] }[] = [];
  const deps: WhatsAppRouteDeps = {
    async listGroups(...args) { seen.push({ op: "list", args }); return [{ groupJid: "g@g.us", ownerUserId: OA, linkId: LA, subject: "G", trackedPersonCount: 1 }]; },
    async ingestGroup(...args) { seen.push({ op: "ingest", args }); return { sessionId: "s", sourceId: "src", turnCount: 1 }; },
    ...overrides,
  };
  return { deps, seen };
}

// ---- R-25 narrowing at the route ----
test("W7 route: the caller comes from the verified principal and linkId is validated; a malformed linkId never reaches the store", async () => {
  const { deps, seen } = spyDeps(); const s = await routeServer(deps);
  try {
    assert.equal((await s.get("member")).status, 200);
    assert.deepEqual(seen.at(-1)!.args, ["tenant-a", { caller: { kind: "session", userId: "uA", admin: false } }]);
    assert.equal((await s.get("admin", `?linkId=${LB}`)).status, 200);
    assert.deepEqual(seen.at(-1)!.args, ["tenant-a", { caller: { kind: "session", userId: "boss", admin: true }, linkId: LB }]);
    assert.equal((await s.get("key")).status, 200);
    assert.deepEqual(seen.at(-1)!.args, ["tenant-a", { caller: { kind: "key", admin: false } }]);
    const calls = seen.length;
    for (const bad of ["?linkId=", "?linkId=short", `?linkId=${LA.toUpperCase()}`, `?linkId=${LA}&linkId=${LB}`, `?linkId=${LA}%00`]) assert.equal((await s.get("admin", bad)).status, 400, bad);
    for (const bad of [null, 7, "", "x", [LA], { $ne: null }, LA.toUpperCase()]) assert.equal((await s.post("admin", { groupJid: "g@g.us", linkId: bad })).status, 400, JSON.stringify(bad));
    assert.equal(seen.length, calls, "ISS-WAOWNER-005: a null or malformed linkId is refused before the store");
    assert.equal((await s.post("member", { groupJid: "g@g.us", linkId: LA })).status, 201);
    assert.deepEqual(seen.at(-1)!.args, ["tenant-a", "g@g.us", { caller: { kind: "session", userId: "uA", admin: false }, linkId: LA }]);
  } finally { await s.close(); }
});

test("W7 route: ownerUserId is shown to admins only; a client ownerUserId in the body or query reaches nothing", async () => {
  const { deps, seen } = spyDeps(); const s = await routeServer(deps);
  try {
    const admin = (await (await s.get("admin")).json() as { groups: Record<string, unknown>[] }).groups[0]!; assert.equal(admin.ownerUserId, OA);
    const member = (await (await s.get("member", `?ownerUserId=${OB}`)).json() as { groups: Record<string, unknown>[] }).groups[0]!;
    assert.equal("ownerUserId" in member, false); assert.equal(member.linkId, LA);
    assert.equal((await s.post("member", { groupJid: "g@g.us", ownerUserId: OB })).status, 201);
    assert.ok(!JSON.stringify(seen.at(-1)!.args).includes(OB));
  } finally { await s.close(); }
});

test("W7 route: ambiguous jid is 409 ambiguous_link; an absent or not-permitted group is a 404 that never echoes upstream text", async () => {
  let mode: "ambiguous" | "absent" = "ambiguous";
  const { deps } = spyDeps({ ingestGroup: async () => { throw mode === "ambiguous" ? new WhatsAppAmbiguousLinkError() : new WhatsAppGroupNotFoundError("secret-jid@g.us"); } });
  const s = await routeServer(deps);
  try {
    const ambiguous = await s.post("admin", { groupJid: "g@g.us" }); assert.equal(ambiguous.status, 409); assert.deepEqual(await ambiguous.json(), { error: "ambiguous_link" });
    mode = "absent";
    const absent = await s.post("member", { groupJid: "secret-jid@g.us" }); assert.equal(absent.status, 404);
    const text = await absent.text(); assert.deepEqual(JSON.parse(text), { error: "not_found" }); assert.ok(!text.includes("secret-jid"));
  } finally { await s.close(); }
});

// ---- ISS-API-003 (D-015): the ledger's recorded reproductions, verbatim, then an authored corpus ----
// Recorded in qa/issues.api.jsonl ISS-API-003: (1) the pinned test's input `new Error("whatsapp_msg Mongo unreachable")` thrown by ingestGroup;
// (2) "a driver error from fetchWhatsAppMessages/getWhatsAppDb ... can carry the archive host:port".
const RECORDED: { name: string; run: (s: Awaited<ReturnType<typeof routeServer>>) => Promise<{ status: number; text: string; leak: RegExp }> }[] = [
  { name: "recorded-1 pinned test input (ingestGroup throws a plain Error)", async run(s) {
    const r = await s.post("key", { groupJid: "g1@g.us" }); return { status: r.status, text: await r.text(), leak: /Mongo unreachable|whatsapp_msg/ }; } },
];
test("ISS-API-003: recorded reproduction 1 (plain upstream Error) is refused to echo", async () => {
  const { deps } = spyDeps({ ingestGroup: async () => { throw new Error("whatsapp_msg Mongo unreachable"); } }); const s = await routeServer(deps);
  try {
    const r = await RECORDED[0]!.run(s);
    assert.equal(r.status, 502); assert.deepEqual(JSON.parse(r.text), { error: "whatsapp_ingest_failed", code: "unknown", linkId: null }); assert.ok(!r.leak.test(r.text));
  } finally { await s.close(); }
});
test("ISS-API-003: recorded reproduction 2 (driver error with host:port from the fetch path) is not echoed and is not a 5xx body with text", async () => {
  for (const error of [new MongoNetworkError("connect ECONNREFUSED 10.9.8.7:27017"), Object.assign(Object.create(MongoServerSelectionError.prototype) as Error, { message: "getaddrinfo ENOTFOUND archive.internal.example:27017" })]) {
    const deps = createMongoWhatsAppDeps(undefined, { resolveOwners: async () => [{ linkId: LA, ownerUserId: OA }], appDb: () => wireMongoFixture().db,
      listGroups: async owner => [{ groupJid: "g@g.us", ownerUserId: owner, subject: "G", trackedPersonCount: 1 }], fetchMessages: async () => { throw error; } });
    const s = await routeServer(deps);
    try {
      const r = await s.post("member", { groupJid: "g@g.us" }); const text = await r.text();
      assert.ok([502, 503].includes(r.status)); assert.ok(!/10\.9\.8\.7|27017|archive\.internal|ECONNREFUSED|ENOTFOUND/.test(text), text);
    } finally { await s.close(); }
  }
});
test("ISS-API-003 authored corpus: no upstream text of any shape reaches the 502 body, which is always {error, code, linkId}", async () => {
  const corpus: unknown[] = [
    new Error("mongodb://svc:p4ss@10.0.0.1:27017/whatsapp_msg?authSource=admin failed"), new Error("ENOENT: /etc/secrets/archive.pem"), "plain string thrown",
    Object.assign(new Error("boom 192.168.1.1"), { name: "MongoServerError" }), new SnapshotShrinkError(10, 9, 1), { message: "object with message 10.1.1.1" }, null, undefined,
    Object.assign(new Error("replica set member not found 10.2.2.2"), { name: "MongoServerError" }),
  ];
  let ok = 0;
  for (const thrown of corpus) {
    const { deps } = spyDeps({ ingestGroup: async () => { throw thrown; } }); const s = await routeServer(deps);
    try {
      const r = await s.post("admin", { groupJid: "g@g.us", linkId: LB }); const text = await r.text();
      const body = JSON.parse(text) as Record<string, unknown>;
      assert.equal(r.status, 502); assert.deepEqual(Object.keys(body).sort(), ["code", "error", "linkId"]); assert.equal(body.linkId, LB);
      assert.ok((WHATSAPP_INGEST_FAILURE_CODES as readonly string[]).includes(body.code as string));
      assert.ok(!/p4ss|10\.\d|192\.168|archive\.pem|plain string|object with message|boom/.test(text), text); ok++;
    } finally { await s.close(); }
  }
  assert.equal(ok, corpus.length);
  assert.equal(classifyIngestFailure(new SnapshotShrinkError(1, 1, 0)), "snapshot_shrink_refused");
  assert.equal(classifyIngestFailure(Object.assign(new Error("x"), { name: "MongoNetworkError" })), "archive_unreachable");
});

// ---- store + ingest wiring over the in-memory Mongo ----
function setup(texts: Record<string, string[]> = { [OA]: ["Topic: Scholarship opens Monday"], [OB]: ["Topic: Scholarship opens Monday"] }) {
  const fx = wireMongoFixture();
  const grants: WhatsAppOwnerGrant[] = [{ linkId: LA, ownerUserId: OA }, { linkId: LB, ownerUserId: OB }];
  const resolveOwners = async (_tenant: string, caller?: WhatsAppCaller): Promise<WhatsAppOwnerGrant[]> =>
    caller?.admin ? grants : caller?.kind === "session" ? grants.filter(g => g.linkId === (caller.userId === "uA" ? LA : LB)) : [];
  const wiring = createWhatsAppReviewWiring({ appDb: () => fx.db, resolveOwners, now: () => "2026-10-14T11:00:00.000Z",
    listGroups: async owner => [{ groupJid: "g@g.us", ownerUserId: owner, subject: "G", trackedPersonCount: 1 }],
    fetchMessages: async (_group, owner) => (texts[owner] ?? []).map((text, i): WhatsAppMessage => ({ messageId: `m-${owner}-${i}`, personId: "p1", displayName: "Expert", text, ts: new Date(Date.parse("2026-10-14T10:00:00Z") + i * 1000).toISOString() })) });
  const as = (userId: string): WhatsAppResolveScope => ({ caller: { kind: "session", userId, admin: false } });
  return { fx, wiring, as };
}

test("W7 acceptance 4: the same message captured by A then B yields B's own candidates flagged duplicate with a pointer; nothing merged, nothing dropped, A untouched", async () => {
  const { fx, wiring, as } = setup();
  const a = await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", as("uA"));
  const aIds = (await wiring.repository.list("tenant-a")).map(c => c._id).sort();
  const b = await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", as("uB"));
  assert.notEqual(a.sourceId, b.sourceId); assert.notEqual(a.sessionId, b.sessionId);
  const all = fx.rows("whatsapp_candidates") as unknown as { _id: string; sessionId: string; flags: { kind: string; duplicateOf?: string }[]; status: string }[];
  const ofA = all.filter(c => c.sessionId === a.sessionId), ofB = all.filter(c => c.sessionId === b.sessionId);
  assert.equal(ofA.length, 2); assert.equal(ofB.length, 2, "both captures keep their own candidates");
  assert.deepEqual(ofA.map(c => c._id).sort(), aIds);
  assert.ok(ofA.every(c => !c.flags.some(f => f.kind === "duplicate")), "the first capture is never rewritten");
  for (const c of ofB) { const flag = c.flags.find(f => f.kind === "duplicate"); assert.ok(flag, "later candidate flagged"); assert.ok(aIds.includes(flag!.duplicateOf!), "pointer names the earlier capture's candidate"); assert.equal(c.status, "needs-review"); }
  // re-ingesting A after B does not retro-flag A (existing candidate rows are insert-only)
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", as("uA"));
  assert.ok((fx.rows("whatsapp_candidates") as unknown as typeof all).filter(c => c.sessionId === a.sessionId).every(c => !c.flags.some(f => f.kind === "duplicate")));
});

test("W7 duplicates stay inside the tenant: another tenant's identical message is never pointed at", async () => {
  const { fx, wiring, as } = setup();
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", as("uA"));
  const b = await wiring.whatsapp.ingestGroup("tenant-z", "g@g.us", as("uB"));
  const rows = (fx.rows("whatsapp_candidates") as unknown as { sessionId: string; flags: { kind: string }[] }[]).filter(c => c.sessionId === b.sessionId);
  assert.equal(rows.length, 2); assert.ok(rows.every(c => !c.flags.some(f => f.kind === "duplicate")));
});

test("W7 stamp: ingest records sourceMeta.whatsappLinkId once, per link; a legacy ingest (no link id) stamps nothing", async () => {
  const { fx, wiring, as } = setup();
  const a = await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", as("uA")), b = await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", as("uB"));
  const stamp = (id: string) => (fx.rows("sources").find(s => s._id === id) as { sourceMeta?: { whatsappLinkId?: string } }).sourceMeta?.whatsappLinkId;
  assert.equal(stamp(a.sourceId), LA); assert.equal(stamp(b.sourceId), LB);
  await wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", as("uA"));
  assert.equal(stamp(a.sourceId), LA); assert.equal(fx.rows("sources").length, 2);
  const legacy = createWhatsAppReviewWiring({ appDb: () => fx.db, resolveOwners: async () => [{ linkId: null, ownerUserId: OA }], now: () => "2026-10-14T11:00:00.000Z",
    listGroups: async owner => [{ groupJid: "legacy@g.us", ownerUserId: owner, subject: "L", trackedPersonCount: 1 }],
    fetchMessages: async () => [{ messageId: "m", personId: "p", displayName: "E", text: "hello", ts: "2026-10-14T10:00:00.000Z" }] });
  const l = await legacy.whatsapp.ingestGroup("tenant-a", "legacy@g.us");
  assert.equal(stamp(l.sourceId), undefined);
});

test("W7 store narrowing: member reaches own link only; admin all; plain key legacy only; linkId only narrows; foreign/ambiguous cases fail without effects", async () => {
  const { wiring, as } = setup();
  const groups = (scope: WhatsAppResolveScope) => wiring.whatsapp.listGroups("tenant-a", scope);
  assert.deepEqual((await groups(as("uA"))).map(g => g.linkId), [LA]);
  assert.deepEqual((await groups({ caller: { kind: "session", userId: "boss", admin: true } })).map(g => g.linkId).sort(), [LA, LB]);
  assert.deepEqual((await groups({ caller: { kind: "session", userId: "boss", admin: true }, linkId: LB })).map(g => g.linkId), [LB]);
  assert.deepEqual(await groups({ ...as("uA"), linkId: LB }), [], "a member cannot widen to B's link");
  assert.deepEqual(await groups({ ...as("uA"), linkId: null as unknown as string }), [], "ISS-WAOWNER-005: null linkId fails closed");
  await assert.rejects(() => wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", { ...as("uA"), linkId: LB }), WhatsAppGroupNotFoundError);
  await assert.rejects(() => wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", { ...as("uA"), linkId: null as unknown as string }), WhatsAppGroupNotFoundError);
  await assert.rejects(() => wiring.whatsapp.ingestGroup("tenant-a", "not-mine@g.us", as("uA")), WhatsAppGroupNotFoundError);
  await assert.rejects(() => wiring.whatsapp.ingestGroup("tenant-a", "g@g.us", { caller: { kind: "session", userId: "boss", admin: true } }), WhatsAppAmbiguousLinkError);
});

test("W7 repair: pending-invalidation markers re-ingest with an internal admin caller, narrowed by the stored link id; an ambiguous marker stays pending", async () => {
  const { fx, wiring } = setup();
  const marker = (extra: Record<string, unknown>) => fx.put(WHATSAPP_REVIEW_LOG, { _id: whatsAppLogId("tenant-a", "pending-invalidation", "g@g.us"), tenantId: "tenant-a", kind: "pending-invalidation", groupJid: "g@g.us", at: "t", ...extra });
  marker({});
  assert.deepEqual(await wiring.repairPendingInvalidations("tenant-a"), [], "ambiguous across two links: needs an operator");
  assert.equal(fx.rows("sources").length, 0); assert.equal(fx.rows(WHATSAPP_REVIEW_LOG).length, 1);
  fx.rows(WHATSAPP_REVIEW_LOG); // marker is keyed by group; replace it with one that names its link
  const clean = wireMongoFixture(); void clean;
  const second = setup(); second.fx.put(WHATSAPP_REVIEW_LOG, { _id: whatsAppLogId("tenant-a", "pending-invalidation", "g@g.us"), tenantId: "tenant-a", kind: "pending-invalidation", groupJid: "g@g.us", at: "t", linkId: LB });
  assert.deepEqual(await second.wiring.repairPendingInvalidations("tenant-a"), ["g@g.us"]);
  const sources = second.fx.rows("sources") as unknown as { sourceMeta?: { whatsappLinkId?: string } }[];
  assert.equal(sources.length, 1); assert.equal(sources[0]!.sourceMeta?.whatsappLinkId, LB);
  assert.equal(second.fx.rows(WHATSAPP_REVIEW_LOG).filter(r => r.kind === "pending-invalidation").length, 0, "marker cleared after the narrowed repair");
});
