/**
 * W12 event writers (R-38, R-39): every writer emits exactly once per transition, with ids, counts and codes only; no consumer registry, webhook or
 * outbound call exists on the event surface. The link/selection/admin.raw_read writers predate W12 (service.test.ts, selection/router.test.ts,
 * isolation-read-side.test.ts); this file drives the lifecycle end to end, the W12 candidate writers, and the payload rule over all of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import express from "express";
import type { Db } from "mongodb";
import type { WhatsAppMessage } from "@lkb/ingest";
import { EVENT_DATA_KEYS, FORBIDDEN_EVENT_FIELDS, assertEventPayloadSafe, type NewWhatsAppEvent } from "@lkb/db";
import { requireAuth } from "../auth.js";
import { createLinksService, type ArchiverPort, type Principal } from "./links/service.js";
import { memoryLinkData, memoryLinksStore, NOTICE, T1 } from "./links/links.testsupport.js";
import { createWhatsAppRawAccess } from "./owner-config.js";
import { createWhatsAppReviewWiring } from "./review/compose.js";
import { detectWhatsAppReviewCandidates } from "./review/detection.js";
import { createWhatsAppReviewRouter } from "./review/router.js";
import { createMongoWhatsAppReviewRepository } from "./review/store.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "./review/test-fixtures.js";
import { wireMongoFixture } from "./review/wire-fixtures.js";

const OWNER_ID = "b".repeat(24), CANARIES = ["CANARY-LABEL-NAME", "CANARY-QR-0f1e2d3c", "CANARY-JID-777@g.us", "CANARY-SUBJECT", "CANARY-PHONE-+919999999999", "Scholarship closes Friday", OWNER_ID];
const member = (userId: string): Principal => ({ tenantId: T1, kind: "session", userId, actor: `user:${userId}`, link: true, admin: false });
const admin: Principal = { tenantId: T1, kind: "session", userId: "u-admin", actor: "user:u-admin", link: true, admin: true };
const sinkRows: Array<{ tenantId: string; e: NewWhatsAppEvent }> = [];
const collect = () => { const rows: typeof sinkRows = []; return { rows, sink: async (tenantId: string, e: NewWhatsAppEvent) => { rows.push({ tenantId, e: structuredClone(e) }); } }; };

/** The payload rule as an executable check: every key is in the contract, every value an integer or a short id/code, and no canary appears anywhere. */
function assertPayloadRule(events: readonly NewWhatsAppEvent[]): void {
  const blob = JSON.stringify(events);
  for (const c of CANARIES) assert.ok(!blob.includes(c), `event payload leaked ${c}`);
  for (const e of events) {
    assertEventPayloadSafe(e);
    for (const [k, v] of Object.entries(e.data ?? {})) {
      assert.ok((EVENT_DATA_KEYS as readonly string[]).includes(k), k);
      assert.ok(Number.isInteger(v) || (typeof v === "string" && /^[A-Za-z0-9_.:@-]{1,200}$/.test(v)), `${k} is not an id, code or count`);
    }
  }
}

function lifecycleRig() {
  const store = memoryLinksStore();
  const archiver: ArchiverPort = {
    async ensureOwner() { return { ownerId: OWNER_ID, ownerRef: "x", created: true, state: "active" } as never; },
    async startSession() { return { status: "awaiting_qr" } as never; },
    async getSession() { return { status: "connected", detail: null, updatedAt: "2026-11-01T00:00:00.000Z", accountHint: "CANARY-PHONE-+919999999999" } as never; },
    async getQr() { return { status: "awaiting_qr", qr: "CANARY-QR-0f1e2d3c", expiresAt: "2026-11-01T00:01:00.000Z" } as never; },
    async unlinkSession() { return { ownerId: OWNER_ID, state: "unlinked", status: "closed", captureDisabled: true, unlinkedAt: "2026-11-01T00:00:00.000Z" } as never; },
  };
  let owner = 0;
  const svc = createLinksService({ store, archiver: { ...archiver, ensureOwner: async () => ({ ownerId: (++owner).toString(16).padStart(24, "b"), ownerRef: "x", created: true, state: "active" }) as never }, data: memoryLinkData(), notice: () => NOTICE,
    countActiveAdmins: async () => 2, userStatus: async () => ({ status: "active", role: "member" }) });
  const ok = (r: { ok: boolean }): any => { assert.equal(r.ok, true, JSON.stringify(r)); return (r as any).value; };
  const request = async (u: string) => ok(await svc.request(member(u), { label: "CANARY-LABEL-NAME", noticeVersion: NOTICE.version })).link.id as string;
  return { svc, store, ok, request };
}
const count = (store: { events: Array<{ eventType: string }> }) => { const m: Record<string, number> = {}; for (const e of store.events) m[e.eventType] = (m[e.eventType] ?? 0) + 1; return m; };

test("C1 link.* : each lifecycle transition emits exactly one event; an idempotent repeat or a refused call emits none", async () => {
  const { svc, store, ok, request } = lifecycleRig();
  const a = await request("u-a");
  ok(await svc.approve(admin, a, {})); assert.equal((await svc.approve(admin, a, {})).ok, false);
  ok(await svc.connect(member("u-a"), a)); ok(await svc.connect(member("u-a"), a));
  ok(await svc.suspend(admin, a, {})); assert.equal((await svc.suspend(admin, a, {})).ok, false);
  ok(await svc.resume(admin, a)); assert.equal((await svc.resume(admin, a)).ok, false);
  ok(await svc.unlink(member("u-a"), a, {})); ok(await svc.unlink(member("u-a"), a, {}));
  const b = await request("u-b"); ok(await svc.reject(admin, b, {}));
  const c = await request("u-c"); ok(await svc.approve(admin, c, {})); ok(await svc.connect(member("u-c"), c)); ok(await svc.revoke(admin, c, {})); ok(await svc.revoke(admin, c, {}));
  assert.deepEqual(count(store), { "link.requested": 3, "link.approved": 2, "link.connected": 2, "link.suspended": 1, "link.resumed": 1, "link.unlinked": 1, "link.rejected": 1, "link.revoked": 1 });
  assert.equal(store.events.length, 12, "twelve transitions, twelve events");
  assertPayloadRule(store.events.map(({ tenantId: _t, ...e }) => e as NewWhatsAppEvent));
});

test("C1 the payload rule rejects every forbidden field and any non-scalar value (the check would fail on a leak)", () => {
  for (const key of FORBIDDEN_EVENT_FIELDS) assert.throws(() => assertEventPayloadSafe({ eventType: "link.requested", actorKind: "system", data: { [key]: "x" } } as never), /not allowed/, key);
  assert.throws(() => assertEventPayloadSafe({ eventType: "link.requested", actorKind: "system", data: { reason: { text: "hi" } } } as never));
  assert.throws(() => assertPayloadRule([{ eventType: "link.requested", actorKind: "system", data: { reason: "Scholarship closes Friday" } } as never]), /leaked|id, code or count/);
  assert.throws(() => assertPayloadRule([{ eventType: "link.requested", actorKind: "system", data: { requesterId: OWNER_ID } } as never]), /leaked/);
});

async function reviewBoot(sink: ReturnType<typeof collect>["sink"]) {
  const input = reviewInput("Topic: Scholarships"); const fixture = reviewMongoFixture([input]);
  const store = createMongoWhatsAppReviewRepository(fixture.db, { now: () => REVIEW_TIME, materialize: async c => { await fixture.publish(c.candidate, c.session); } });
  const proposals = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME); await store.insert("tenant-a", proposals);
  const app = express(); app.use(express.json());
  app.use(requireAuth({ verify: async key => key === "a" ? { tenantId: "tenant-a", scopes: ["whatsapp", "whatsapp-admin"] } : key === "b" ? { tenantId: "tenant-b", scopes: ["whatsapp", "whatsapp-admin"] } : null }));
  app.use(createWhatsAppReviewRouter(store, createWhatsAppRawAccess(fixture.db as unknown as Db), sink));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (key: string, id: string, verb: string) => fetch(`${url}/whatsapp/review/${id}/${verb}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: "{}" });
  return { proposals, post, close: async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); } };
}

test("C1 candidate.approved / candidate.rejected: one event per winning decision with the candidate id only; repeats, conflicts and refusals emit none", async () => {
  const { rows, sink } = collect(); const rig = await reviewBoot(sink); const [p0, p1] = rig.proposals;
  try {
    assert.equal((await rig.post("a", p0!._id, "approve")).status, 200); assert.equal((await rig.post("a", p0!._id, "approve")).status, 200, "idempotent repeat");
    assert.equal((await rig.post("a", p0!._id, "reject")).status, 409, "opposite decision conflicts");
    assert.equal((await rig.post("b", p1!._id, "reject")).status, 404, "another tenant");
    assert.equal((await rig.post("a", p1!._id, "reject")).status, 200); assert.equal((await rig.post("a", p1!._id, "reject")).status, 200);
    assert.deepEqual(rows.map(r => [r.tenantId, r.e.eventType, r.e.actorKind, r.e.data]), [["tenant-a", "candidate.approved", "key", { candidateId: p0!._id }], ["tenant-a", "candidate.rejected", "key", { candidateId: p1!._id }]]);
    assert.ok(rows.every(r => /^api-key-sha256:[0-9a-f]{64}$/.test(r.e.actorId ?? "")), "the verified actor, never the bearer");
    assertPayloadRule(rows.map(r => r.e));
  } finally { await rig.close(); }
});

test("C1 a failing event write never fails or undoes a committed decision (state is authoritative)", async () => {
  const rig = await reviewBoot(async () => { throw new Error("mongo down"); });
  try { assert.equal((await rig.post("a", rig.proposals[0]!._id, "approve")).status, 200); } finally { await rig.close(); }
});

function ingestRig(sink: ReturnType<typeof collect>["sink"], texts: string[], opts: { fail?: boolean } = {}) {
  const fx = wireMongoFixture(); const T0 = Date.parse("2026-10-14T10:00:00.000Z");
  const messages: WhatsAppMessage[] = texts.map((text, i) => ({ messageId: `m${i}`, personId: "p1", displayName: "CANARY-NAME", text, ts: new Date(T0 + i * 1000).toISOString() }));
  const wiring = createWhatsAppReviewWiring({ appDb: () => fx.db, resolveOwner: async () => "6a8d0c692fcc75f0e911b878", now: () => "2026-10-14T11:00:00.000Z", appendEvent: sink,
    listGroups: async () => [{ groupJid: "CANARY-JID-777@g.us", ownerUserId: "6a8d0c692fcc75f0e911b878", subject: "CANARY-SUBJECT", trackedPersonCount: 1 }],
    fetchMessages: async () => { if (opts.fail) throw new Error("archive down"); return messages; } });
  return { wiring, fx };
}

test("C1 candidate.created: one event per ingest that proposed new candidates, carrying the count only; an unchanged re-ingest and a failed ingest emit none", async () => {
  const { rows, sink } = collect(); const { wiring, fx } = ingestRig(sink, ["Scholarship closes Friday.", "Topic: Visas. We decided to start Monday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "CANARY-JID-777@g.us");
  const made = fx.rows("whatsapp_candidates").length; assert.ok(made >= 2);
  assert.deepEqual(rows.map(r => [r.tenantId, r.e.eventType, r.e.actorKind, r.e.data]), [["tenant-a", "candidate.created", "system", { count: made }]]);
  await wiring.whatsapp.ingestGroup("tenant-a", "CANARY-JID-777@g.us");
  assert.equal(rows.length, 1, "nothing new, nothing emitted");
  assertPayloadRule(rows.map(r => r.e));
  const failing = collect(); const bad = ingestRig(failing.sink, ["x"], { fail: true });
  await assert.rejects(bad.wiring.whatsapp.ingestGroup("tenant-a", "CANARY-JID-777@g.us")); assert.equal(failing.rows.length, 0);
});

test("C1 a failing event sink does not fail the ingest", async () => {
  const { wiring, fx } = ingestRig(async () => { throw new Error("mongo down"); }, ["Scholarship closes Friday."]);
  await wiring.whatsapp.ingestGroup("tenant-a", "CANARY-JID-777@g.us"); assert.ok(fx.rows("whatsapp_candidates").length >= 1);
});

const ROOT = new URL("../../../../", import.meta.url);
const walk = (dir: URL): string[] => readdirSync(dir).flatMap(n => { const u = new URL(n + (statSync(new URL(n, dir)).isDirectory() ? "/" : ""), dir); return u.pathname.endsWith("/") ? walk(u) : [u.pathname.replace(/^\/([A-Za-z]:)/, "$1")]; });
const sources = (rel: string, ext: RegExp): Array<[string, string]> => walk(new URL(rel, ROOT)).filter(f => ext.test(f) && !/\.(test|testsupport)\./.test(f)).map(f => [f, readFileSync(f, "utf8")]);

test("C1 coverage: every event type of the closed R-38 list (plus admin.raw_read) has a writer in non-test source", () => {
  const schema = JSON.parse(readFileSync(new URL("schema/whatsapp_events.schema.json", ROOT), "utf8")) as { properties: { eventType: { enum: string[] } } };
  const code = [...sources("apps/api/src/whatsapp/", /\.ts$/), ...sources("scripts/whatsapp/", /\.mjs$/)].map(([, s]) => s).join("\n");
  assert.equal(schema.properties.eventType.enum.length, 16);
  for (const t of schema.properties.eventType.enum) assert.ok(code.includes(`"${t}"`), `no writer for ${t}`);
});

test("C3 no consumer registry, webhook, subscription or outbound call exists on the event surface (grep-asserted)", () => {
  const surface = ["apps/api/src/whatsapp/links/events-router.ts", "apps/api/src/whatsapp/links/service.ts", "apps/api/src/whatsapp/review/router.ts", "apps/api/src/whatsapp/review/ingest.ts", "apps/api/src/whatsapp/review/compose.ts", "apps/api/src/whatsapp/selection/service.ts", "scripts/whatsapp/sync-links.mjs"];
  const banned = [/webhook/i, /\bsubscri(be|ption)s?\b/i, /\bregisterConsumer|\bconsumers?\b.*(Map|Set|\[\])|consumerRegistry|\bcallbackUrl\b/i, /\bfetch\s*\(/, /\bhttps?\.(request|get)\b/, /\baxios\b/, /\bXMLHttpRequest\b|\bEventSource\b|\bWebSocket\b/, /\bnet\.connect\b|\bsendMessage\b|\bsendMail\b|\bnodemailer\b/, /api\.telegram/i];
  for (const rel of surface) { const src = readFileSync(new URL(rel, ROOT), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1"); for (const re of banned) assert.ok(!re.test(src), `${rel} matches ${re}`); }
  const routes = readFileSync(new URL("apps/api/src/composition/integrations/routes.ts", ROOT), "utf8");
  assert.equal(routes.split("\n").filter(l => /whatsappEvents|whatsapp\/events/.test(l)).filter(l => /\.(post|put|patch|delete)\(/.test(l)).length, 0);
  const everyEventRoute = sources("apps/api/src/", /\.ts$/).flatMap(([f, s]) => [...s.matchAll(/\.(get|post|put|patch|delete|all)\(\s*["'`]\/whatsapp\/events/g)].map(m => `${f}:${m[1]}`));
  assert.equal(everyEventRoute.length, 1); assert.match(everyEventRoute[0]!, /events-router\.ts:get$/);
});

test("C4 docs/whatsapp/events.md states the payload contract (R-39), the read contract (R-40), the R-41 hard line, and lists every closed data key and event type", () => {
  const doc = readFileSync(new URL("docs/whatsapp/events.md", ROOT), "utf8");
  for (const needle of ["R-41 hard line", "No hook may call WhatsApp", "No hook may export raw message text", "GET /whatsapp/events", "ids, counts and codes only", "At-least-once"]) assert.ok(doc.includes(needle), needle);
  for (const key of EVENT_DATA_KEYS) assert.ok(doc.includes(`\`${key}\``), `doc lists data key ${key}`);
  for (const type of ["link.needs_relink", "sync.completed", "sync.failed", "candidate.created", "candidate.approved", "candidate.rejected", "selection.changed", "admin.raw_read"]) assert.ok(doc.includes(type), type);
});

test("C3 (wa-events-cursor) docs/whatsapp/events.md states the delivery guarantee the code provides: paged by event id not `at`, the dedupe rule, and the residual window with its mitigation", () => {
  const doc = readFileSync(new URL("docs/whatsapp/events.md", ROOT), "utf8");
  const src = readFileSync(new URL("packages/db/src/collections/whatsapp-links.ts", ROOT), "utf8");
  assert.ok(/\.sort\(\{ _id: 1 \}\)/.test(src) && !/sort\(\{ at:/.test(src) && /filter\._id = \{ \$gt: cursor\._id \}/.test(src), "the code pages by _id only");
  assert.ok(!/ordered by `\(at, id\)`/.test(doc) && !/\(at, id\)/.test(doc), "the stale (at, id) ordering claim is gone");
  for (const needle of ["## Delivery guarantee", "ordered by `id`", "`at` is the writer's own timestamp", "not monotonic", "dedupe on `id`", "settle", "unknown_cursor"]) assert.ok(doc.includes(needle), needle);
  assert.ok(/[Nn]ot exactly-once/.test(doc) && /in flight/.test(doc) && /clock/.test(doc), "the residual window (in-flight insert, host clocks) is named, not hidden");
  assert.ok(!/never skip|cannot miss|guaranteed delivery|exactly once delivery/i.test(doc), "no over-claim");
});
