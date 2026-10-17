/** D-180 ruling 1: registration-link approval store (tenant predicate, expiry, revocation, every hash) and
 * POST /registration-approvals behind the shared requireAuth perimeter, the dedicated scope and a human identity.
 * In-memory doubles only: no Mongo, no network beyond the localhost test server. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import { createReviewPolicyResolver } from "../review-authority/policy.js";
import { createRegistrationApprovalStore, type ApprovalMatch, type RegistrationApprovalRow } from "./store.js";
import { canonicalRegistrationLink, createHumanApproverLookup } from "./router.js";

type Row = Record<string, unknown>;
/** Faithful-enough Mongo filter semantics for the operators the store uses: equality, null (missing or null) and $gt. */
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, want]) => {
    const have = row[key];
    if (want === null) return have === null || have === undefined;
    if (want && typeof want === "object" && "$gt" in want) return typeof have === "string" && have > (want as { $gt: string }).$gt;
    return have === want;
  });
}
function fakeDb() {
  const rows: Row[] = [], filters: Row[] = [];
  const collection = {
    async findOne(filter: Row) { filters.push(filter); return rows.find(r => matches(r, filter)) ?? null; },
    async insertOne(row: Row) { if (rows.some(r => r._id === row._id)) throw new Error("duplicate"); rows.push(structuredClone(row)); },
    async updateOne(filter: Row, update: { $set: Row }) {
      filters.push(filter); const row = rows.find(r => matches(r, filter)); if (!row) return { modifiedCount: 0 };
      Object.assign(row, update.$set); return { modifiedCount: 1 };
    },
  };
  return { db: { collection: () => collection } as unknown as Pick<Db, "collection">, rows, filters };
}
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const LINK = hex("https://b64wc.r.a.d.sendibm1.com/tracked/FIXTURE"), SCOPE = hex("scope"), POLICY = hex("policy");
const BINDING = hex("binding"), HOSTS = hex("hosts");
const NOW = new Date("2026-10-17T10:00:00.000Z");
function row(over: Partial<RegistrationApprovalRow> = {}): RegistrationApprovalRow {
  const decisionId = over.decisionId ?? "0b6f1c52-8a43-4f5e-9d2a-3c1e7b9a0f11";
  return { _id: decisionId, tenantId: "tenant-A", decisionId, linkHash: LINK, scopeHash: SCOPE, policyHash: POLICY,
    bindingHash: BINDING, policyRevision: 2, hostScopeHash: HOSTS, approvedBy: "reviewer:alice",
    approvedAt: "2026-10-16T10:00:00.000Z", expiresAt: "2026-11-15T10:00:00.000Z", ...over };
}
const linkMatch: ApprovalMatch = { kind: "link", linkHash: LINK, scopeHash: SCOPE, policyHash: POLICY };
const proofMatch: ApprovalMatch = { kind: "proof", bindingHash: BINDING, policyHash: POLICY, policyRevision: 2, hostScopeHash: HOSTS };

test("store: valid record matches for both resolver and proof lookups, every query carries the tenant", async () => {
  const f = fakeDb(), store = createRegistrationApprovalStore(f.db);
  await store.create(row());
  assert.equal((await store.findMatching("tenant-A", linkMatch, NOW))?.decisionId, row().decisionId);
  assert.equal((await store.findMatching("tenant-A", proofMatch, NOW))?.decisionId, row().decisionId);
  assert.equal((await store.get("tenant-A", row().decisionId))?.approvedBy, "reviewer:alice");
  assert.ok(f.filters.length >= 3 && f.filters.every(q => q.tenantId === "tenant-A"), JSON.stringify(f.filters));
});
test("store: no record, expired, revoked and cross-tenant are refused", async () => {
  const f = fakeDb(), store = createRegistrationApprovalStore(f.db);
  assert.equal(await store.findMatching("tenant-A", linkMatch, NOW), null, "no record");
  await store.create(row({ tenantId: "tenant-B" }));
  assert.equal(await store.findMatching("tenant-A", linkMatch, NOW), null, "cross-tenant link");
  assert.equal(await store.findMatching("tenant-A", proofMatch, NOW), null, "cross-tenant proof");
  assert.equal(await store.get("tenant-A", row().decisionId), null, "cross-tenant get");
  assert.equal(await store.revoke("tenant-A", row().decisionId, NOW), false, "cross-tenant revoke");
  const expired = fakeDb(), s2 = createRegistrationApprovalStore(expired.db);
  await s2.create(row({ approvedAt: "2026-09-18T10:00:00.000Z", expiresAt: "2026-10-17T09:59:59.999Z" }));
  assert.equal(await s2.findMatching("tenant-A", linkMatch, NOW), null, "expired");
  const revoked = fakeDb(), s3 = createRegistrationApprovalStore(revoked.db);
  await s3.create(row());
  assert.equal(await s3.revoke("tenant-A", row().decisionId, NOW), true);
  assert.equal(await s3.revoke("tenant-A", row().decisionId, NOW), false, "revoke is one-shot");
  assert.equal(await s3.findMatching("tenant-A", linkMatch, NOW), null, "revoked link");
  assert.equal(await s3.findMatching("tenant-A", proofMatch, NOW), null, "revoked proof");
});
test("store: an unexpired record still matches just before expiry (expiry is a real bound, not a blanket refusal)", async () => {
  const f = fakeDb(), store = createRegistrationApprovalStore(f.db);
  await store.create(row({ approvedAt: "2026-09-18T10:00:00.000Z", expiresAt: "2026-10-17T10:00:00.001Z" }));
  assert.ok(await store.findMatching("tenant-A", linkMatch, NOW));
});
test("store: a mismatch on each hash is refused", async () => {
  const f = fakeDb(), store = createRegistrationApprovalStore(f.db); await store.create(row());
  const other = hex("other");
  for (const m of [{ ...linkMatch, linkHash: other }, { ...linkMatch, scopeHash: other }, { ...linkMatch, policyHash: other },
    { ...proofMatch, bindingHash: other }, { ...proofMatch, policyHash: other }, { ...proofMatch, policyRevision: 3 }, { ...proofMatch, hostScopeHash: other }] as ApprovalMatch[])
    assert.equal(await store.findMatching("tenant-A", m, NOW), null, JSON.stringify(m));
  for (const m of [{ ...linkMatch, linkHash: "x" }, { kind: "other" }, null, { ...proofMatch, policyRevision: 0 }] as unknown as ApprovalMatch[])
    assert.equal(await store.findMatching("tenant-A", m, NOW), null);
  await assert.rejects(store.findMatching({ $ne: null } as unknown as string, linkMatch, NOW));
});
test("store: create refuses a ttl over 30 days, partial Zoom fields and non-canonical timestamps", async () => {
  const store = createRegistrationApprovalStore(fakeDb().db);
  await assert.rejects(store.create(row({ expiresAt: "2026-11-15T10:00:00.001Z" })));
  await assert.rejects(store.create(row({ hostScopeHash: undefined })));
  await assert.rejects(store.create(row({ approvedAt: "2026-10-16" })));
  await assert.rejects(store.create(row({ _id: "other" })));
});

const human = { keyId: "key:human", subject: "reviewer:alice", reviewerKind: "human", canPropose: true, canReview: true, answerActions: [] };
const bot = { keyId: "key:bot", subject: "worker:bot", reviewerKind: "automation", canPropose: true, canReview: false, answerActions: [] };
const resolver = createReviewPolicyResolver(JSON.stringify({ version: 1, tenants: [
  { tenantId: "tenant-A", keys: [human, bot] }, { tenantId: "tenant-B", keys: [{ ...human, keyId: "key:human-b", subject: "reviewer:bob" }] }] }));
const keyStore = fakeKeyStore({
  human: { tenantId: "tenant-A", keyId: "key:human", scopes: ["registration:approve"] },
  "human-noscope": { tenantId: "tenant-A", keyId: "key:human", scopes: ["sessions"] },
  bot: { tenantId: "tenant-A", keyId: "key:bot", scopes: ["registration:approve"] },
  service: { tenantId: "tenant-A", keyId: "key:service-unlisted", scopes: ["registration:approve", "*", "admin"] },
  "no-keyid": { tenantId: "tenant-A", scopes: ["registration:approve"] },
  "human-b": { tenantId: "tenant-B", keyId: "key:human-b", scopes: ["registration:approve"] },
});
async function serve(withRoute = true) {
  const f = fakeDb(), store = createRegistrationApprovalStore(f.db);
  const server = await startTestServer(buildTestDeps({ keyStore, ...(withRoute ? { registrationApprovals: { store, humanFor: createHumanApproverLookup(resolver),
    now: () => NOW, newId: () => "0b6f1c52-8a43-4f5e-9d2a-3c1e7b9a0f11" } } : {}) }));
  const call = async (path: string, key: string | null, body?: unknown) => {
    const res = await fetch(server.baseUrl + path, { method: "POST", headers: { connection: "close", ...(key ? { authorization: `Bearer ${key}` } : {}),
      "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    return { status: res.status, json: await res.json().catch(() => null) as Record<string, any> | null };
  };
  return { call, close: server.close, f, store };
}
const body = { link: "https://b64wc.r.a.d.sendibm1.com/tracked/FIXTURE", scopeHash: SCOPE, policyHash: POLICY };

test("route: bot, unlisted service key, missing scope, missing key id and no key cannot create", async () => {
  const s = await serve();
  try {
    assert.equal((await s.call("/registration-approvals", null, body)).status, 401);
    assert.equal((await s.call("/registration-approvals", "human-noscope", body)).status, 403);
    for (const [key, status] of [["bot", 403], ["service", 403], ["no-keyid", 401]] as const) {
      const r = await s.call("/registration-approvals", key, body);
      assert.equal(r.status, status, key); if (status === 403) assert.equal(r.json?.error, "human_approver_required", key);
    }
    assert.equal(s.f.rows.length, 0, "no record was written by a non-human");
  } finally { await s.close(); }
});
test("route: human creates a tenant-pinned 30-day record; body cannot pick tenant, approver or expiry beyond 30 days", async () => {
  const s = await serve();
  try {
    const forged = await s.call("/registration-approvals", "human", { ...body, tenantId: "tenant-B", approvedBy: "worker:bot" });
    assert.equal(forged.status, 400);
    assert.equal((await s.call("/registration-approvals", "human", { ...body, ttlDays: 31 })).status, 400);
    assert.equal((await s.call("/registration-approvals", "human", { ...body, link: "http://zoom.us/x" })).status, 400);
    assert.equal((await s.call("/registration-approvals", "human", { ...body, zoom: { bindingHash: BINDING } })).status, 400);
    const ok = await s.call("/registration-approvals", "human", { ...body, zoom: { bindingHash: BINDING, policyRevision: 2, hostScopeHash: HOSTS } });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.deepEqual(ok.json!.approval, { decisionId: "0b6f1c52-8a43-4f5e-9d2a-3c1e7b9a0f11", linkHash: LINK, approvedBy: "reviewer:alice",
      approvedAt: NOW.toISOString(), expiresAt: "2026-11-16T10:00:00.000Z" });
    assert.equal(s.f.rows.length, 1); const stored = s.f.rows[0]!;
    assert.equal(stored.tenantId, "tenant-A"); assert.equal(stored.approvedBy, "reviewer:alice"); assert.equal(stored.revokedAt, null);
    assert.ok(!JSON.stringify(stored).includes("tracked/FIXTURE"), "raw link is never stored");
    assert.ok(await s.store.findMatching("tenant-A", proofMatch, NOW));
    assert.equal(await s.store.findMatching("tenant-B", linkMatch, NOW), null);
    assert.equal((await s.call("/registration-approvals/0b6f1c52-8a43-4f5e-9d2a-3c1e7b9a0f11/revoke", "human-b")).status, 404, "other tenant cannot revoke");
    assert.equal((await s.call("/registration-approvals/0b6f1c52-8a43-4f5e-9d2a-3c1e7b9a0f11/revoke", "bot")).status, 403, "bot cannot revoke");
    assert.equal((await s.call("/registration-approvals/0b6f1c52-8a43-4f5e-9d2a-3c1e7b9a0f11/revoke", "human")).status, 200);
    assert.equal(await s.store.findMatching("tenant-A", linkMatch, NOW), null);
  } finally { await s.close(); }
});
test("route: unconfigured deployment answers 503 behind auth and scope", async () => {
  const s = await serve(false);
  try {
    assert.equal((await s.call("/registration-approvals", null, body)).status, 401);
    assert.equal((await s.call("/registration-approvals", "human-noscope", body)).status, 403);
    assert.equal((await s.call("/registration-approvals", "human", body)).status, 503);
  } finally { await s.close(); }
});
test("human lookup: only a configured human key of the same tenant yields a subject", async () => {
  const lookup = createHumanApproverLookup(resolver);
  assert.deepEqual(await lookup({ tenantId: "tenant-A", keyId: "key:human", scopes: [] }), { subject: "reviewer:alice" });
  assert.equal(await lookup({ tenantId: "tenant-A", keyId: "key:bot", scopes: ["registration:approve"] }), null);
  assert.equal(await lookup({ tenantId: "tenant-B", keyId: "key:human", scopes: [] }), null);
  assert.equal(await lookup({ tenantId: "tenant-A", keyId: "key:unknown", scopes: ["*"] }), null);
  assert.equal(canonicalRegistrationLink("https://ZOOM.us/a#frag"), null);
  assert.equal(canonicalRegistrationLink("https://ZOOM.us/a"), "https://zoom.us/a");
});

test("route: non-canonical forms of an approved link store the CANONICAL hash or are refused, never a raw-link hash", async () => {
  const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
  const accepted = ["https://B64WC.R.A.D.SENDIBM1.COM/tracked/FIXTURE", "https://b64wc.r.a.d.sendibm1.com:443/tracked/FIXTURE",
    "https://b64wc.r.a.d.sendibm1.com/other/../tracked/FIXTURE", "https://b64wc.r.a.d.sendibm1.com/./tracked/FIXTURE"];
  for (const raw of accepted) {
    assert.notEqual(sha256(raw), LINK, `${raw} differs from the canonical hash when hashed raw`);
    const s = await serve();
    try {
      const r = await s.call("/registration-approvals", "human", { ...body, link: raw });
      assert.equal(r.status, 201, raw);
      assert.equal(s.f.rows[0]!.linkHash, LINK, `stored hash is the canonical hash for ${raw}`);
      assert.equal(r.json!.approval.linkHash, LINK, raw);
      assert.ok(await s.store.findMatching("tenant-A", linkMatch, NOW), "canonical form matches");
      assert.equal(await s.store.findMatching("tenant-A", { ...linkMatch, linkHash: sha256(raw) } as ApprovalMatch, NOW), null, `raw hash of ${raw} never matches`);
    } finally { await s.close(); }
  }
  for (const raw of [body.link + " ", " " + body.link, body.link + "\n", "https://b64wc.r.a.d.sendibm1.com:8443/tracked/FIXTURE", "https://u:p@b64wc.r.a.d.sendibm1.com/tracked/FIXTURE", body.link + "#frag"]) {
    const s = await serve();
    try {
      assert.equal((await s.call("/registration-approvals", "human", { ...body, link: raw })).status, 400, JSON.stringify(raw));
      assert.equal(s.f.rows.length, 0);
    } finally { await s.close(); }
  }
});
