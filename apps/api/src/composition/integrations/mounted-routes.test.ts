/** w17-wireapi item 4: T-056 answer policy, T-054 transcript review and T-008 vectorless search are reachable
 * through the shared createServer perimeter (requireAuth + rate limit), composed by the real builders, and
 * tenant-scoped. 401 without a key, cross-tenant 404/empty, 200 on the happy path. In-memory doubles only. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, Collection, type Db } from "mongodb";
import { buildTestDeps, fakeKeyStore } from "../../fixtures.js";
import { startTestServer } from "../../testUtils.js";
import { answerTestDb } from "../../answer-policy/answer-testdb.js";
import { memoryDb } from "../../transcript-review/memdb.testsupport.js";
import { seed, SESSION } from "../../transcript-review/persist.testkit.js";
import { buildAnswerIntegrations } from "./answers.js";
import { buildTranscriptIntegrations, type TranscriptIntegrationInput } from "./transcripts.js";
import { createMongoSearchDeps } from "../../search-store.js";
import { buildProductionDeps } from "../production.js";
import { buildCalendarWorkerIntegrations } from "./capture-policy.js";
import { buildUserAccounts } from "./user-accounts.js";
import { COOKIE_NAME_SECURE } from "../../user-accounts/cookie.js";
import { csrfTokenFor } from "../../user-accounts/csrf.js";

const keyStore = fakeKeyStore({
  "a": { tenantId: "tenant-A", scopes: ["sessions", "search", "answer-policy:read", "answer-policy:write"] },
  "b": { tenantId: "tenant-B", scopes: ["sessions", "search", "answer-policy:read", "answer-policy:write"] },
  "a-ask": { tenantId: "tenant-A", scopes: ["ask"] },
});
const routing = { chains: {}, providers: {}, jobWrite: async () => {} };
async function serve(overrides: Parameters<typeof buildTestDeps>[0]) {
  const server = await startTestServer(buildTestDeps({ keyStore, ...overrides }));
  const call = async (method: string, path: string, key: string | null, body?: unknown) => {
    const res = await fetch(server.baseUrl + path, { method, headers: { connection: "close", ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, json: await res.json().catch(() => null) as Record<string, any> | null };
  };
  return { call, close: server.close };
}

test("T-056 answer policies: composed service is mounted behind auth and tenant-scoped", async () => {
  const integrations = buildAnswerIntegrations({ db: answerTestDb("lkb_t056_test").db, env: {}, root: "C:/nonexistent",
    index: undefined as never, ask: {} as never, routing: routing as never });
  assert.ok(integrations.answerPolicyService, "work DB composes the answer policy service");
  const s = await serve({ answerPolicyService: integrations.answerPolicyService });
  try {
    assert.equal((await s.call("GET", "/answer-policies", null)).status, 401);
    assert.equal((await s.call("GET", "/answer-policies", "a-ask")).status, 403);
    const saved = await s.call("PUT", "/answer-policies/fees", "a", { questionClass: "fees", mode: "internal-only", style: "concise", onInsufficient: "review", note: "init" });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    const mine = await s.call("GET", "/answer-policies", "a");
    assert.equal(mine.status, 200); assert.equal(mine.json!.policies.length, 1);
    const theirs = await s.call("GET", "/answer-policies", "b");
    assert.equal(theirs.status, 200); assert.deepEqual(theirs.json!.policies, [], "tenant B never sees tenant A policy");
    const history = await s.call("GET", "/answer-policies/fees/history", "b");
    assert.ok(history.status === 404 || (history.status === 200 && history.json!.history.length === 0), `cross-tenant history leaked: ${history.status}`);
  } finally { await s.close(); }
});

test("T-054 transcript review: composed with the real authorizeSession (knowledge visibility)", async () => {
  const m = memoryDb(); seed(m);
  for (const [tenantId, sessionId] of [["tenant-A", SESSION], ["tenant-B", SESSION], ["tenant-A", "only-a"]] as const)
    m.seed("sources", { _id: `fixture-${tenantId}-${sessionId}`, tenantId, kind: "recording" });
  const db = Object.assign(Object.create(m.db), { databaseName: "lkb_t054_test" }) as Db;
  const { transcriptReview } = buildTranscriptIntegrations({ db, env: {}, root: "C:/nonexistent", index: undefined, ask: {}, routing } as unknown as TranscriptIntegrationInput);
  assert.ok(transcriptReview); assert.equal(typeof transcriptReview!.authorizeSession, "function");
  const s = await serve({ transcriptReview });
  try {
    assert.equal((await s.call("GET", `/sessions/${SESSION}/transcript-review`, null)).status, 401);
    const ok = await s.call("GET", `/sessions/${SESSION}/transcript-review`, "a");
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.ok(ok.json!.turns.length > 0 && ok.json!.turns.every((t: { text: string }) => t.text.startsWith("Alpha")));
    assert.equal((await s.call("GET", "/sessions/only-a/transcript-review", "b")).status, 404, "cross-tenant session is not found");
    m.seed("sources", { _id: `fixture-tenant-A-${SESSION}`, tenantId: "tenant-A", kind: "recording", consent: { given: false } });
    assert.equal((await s.call("GET", `/sessions/${SESSION}/transcript-review`, "a")).status, 404, "consent-withdrawn session is refused by the real perimeter");
  } finally { await s.close(); }
});

/** Minimal Mongo double with the case-insensitive $regex the lexical prefilter sends. */
function searchDb(rows: Record<string, Record<string, unknown>[]>): Db {
  const at = (row: Record<string, unknown>, key: string) => key.split(".").reduce<unknown>((v, k) => v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined, row);
  const match = (row: Record<string, unknown>, filter: Record<string, any>): boolean => Object.entries(filter).every(([k, want]) => {
    if (k === "$or") return (want as Record<string, any>[]).some(f => match(row, f));
    if (k === "$and") return (want as Record<string, any>[]).every(f => match(row, f));
    const got = at(row, k);
    if (want && typeof want === "object" && !Array.isArray(want)) {
      if ("$regex" in want) return typeof got === "string" && new RegExp(want.$regex, want.$options).test(got);
      if ("$in" in want) return (want.$in as unknown[]).some(x => JSON.stringify(x) === JSON.stringify(got));
      if ("$exists" in want) return (got !== undefined) === want.$exists;
      if ("$ne" in want) return JSON.stringify(got) !== JSON.stringify(want.$ne);
    }
    return JSON.stringify(got) === JSON.stringify(want);
  });
  return { databaseName: "lkb_t008_test", collection: (name: string) => ({
    find: (filter: Record<string, any>) => {
      let out = structuredClone((rows[name] ?? []).filter(r => match(r, filter)));
      const cursor = { limit(n: number) { out = out.slice(0, n); return cursor; }, sort() { return cursor; }, project() { return cursor; }, toArray: async () => out };
      return cursor;
    },
    findOne: async (filter: Record<string, any>) => structuredClone((rows[name] ?? []).find(r => match(r, filter)) ?? null),
  }) } as unknown as Db;
}

test("T-008 vectorless search: composed Mongo search deps are mounted behind auth and tenant-scoped", async () => {
  const db = searchDb({
    sessions: [{ _id: "sa", tenantId: "tenant-A", sourceId: "ra", title: "A", date: "2026-01-01", status: { transcribe: "done", index: "done" } },
      { _id: "sb", tenantId: "tenant-B", sourceId: "rb", title: "B", date: "2026-01-01", status: { transcribe: "done", index: "done" } }],
    sources: [{ _id: "ra", tenantId: "tenant-A", kind: "recording", path: "fixture/a" }, { _id: "rb", tenantId: "tenant-B", kind: "recording", path: "fixture/b" }],
    turns: [{ _id: "ta", tenantId: "tenant-A", sessionId: "sa", speakerRef: "spk:0", tStart: 0, tEnd: 5, text: "Zebrafish visa guidance for tenant A" },
      { _id: "tb", tenantId: "tenant-B", sessionId: "sb", speakerRef: "spk:0", tStart: 0, tEnd: 5, text: "Unrelated tenant B content" }],
  });
  const s = await serve({ search: createMongoSearchDeps({ db }) });
  try {
    assert.equal((await s.call("GET", "/search?q=zebrafish", null)).status, 401);
    assert.equal((await s.call("GET", "/search?q=zebrafish", "a-ask")).status, 403);
    const mine = await s.call("GET", "/search?q=zebrafish", "a");
    assert.equal(mine.status, 200, JSON.stringify(mine.json));
    assert.deepEqual(mine.json!.hits.map((h: { turnId: string }) => h.turnId), ["ta"]);
    const theirs = await s.call("GET", "/search?q=zebrafish", "b");
    assert.equal(theirs.status, 200); assert.deepEqual(theirs.json!.hits, [], "tenant B never sees tenant A turn");
  } finally { await s.close(); }
});

test("cycle1 disabled Compose defaults preserve native integrations", async () => {
  const db = {collection() { throw new Error("must be lazy"); }} as unknown as Db;
  for (const bindings of [undefined, "", "   "]) assert.equal(buildCalendarWorkerIntegrations({db, env: {LKB_CALENDAR_WORKER_ENABLED: "0", LKB_CALENDAR_WORKER_BINDINGS: bindings}}), undefined);
  const names = ["LKB_CALENDAR_WORKER_ENABLED", "LKB_CALENDAR_WORKER_BINDINGS", "LKB_JOIN_RULES_ENABLED", "LKB_JOIN_RULES_STATE_DIR"] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]])), {connect, close} = await import("@lkb/db");
  const connection = mock.method(MongoClient.prototype, "connect", async function(this: MongoClient) {return this;}); let reads = 0;
  const rows = mock.method(Collection.prototype, "find", function(this: Collection, filter: unknown) {
    assert.equal(this.namespace, "calendar_default_policy.meeting_candidates"); assert.deepEqual(filter, {tenantId: "toc"}); reads++;
    return {sort: () => ({toArray: async () => []})} as any;
  });
  try {
    await connect("mongodb://127.0.0.1:1", "calendar_default_policy");
    for (const configured of [false, true]) {
      for (const name of names) delete process.env[name];
      if (configured) Object.assign(process.env, {LKB_CALENDAR_WORKER_ENABLED: "0", LKB_CALENDAR_WORKER_BINDINGS: "", LKB_JOIN_RULES_ENABLED: "0"});
      const production = buildProductionDeps();
      const server = await startTestServer(buildTestDeps({meetingCandidates: production.meetingCandidates, keyStore: fakeKeyStore({operator: {tenantId: "toc", keyId: "operator", scopes: ["gmail"]}})}));
      try {const response = await fetch(server.baseUrl + "/meeting-candidates", {headers: {Authorization: "Bearer operator"}}); assert.equal(response.status, 200); assert.deepEqual(await response.json(), {candidates: []});} finally {await server.close();}
    }
    assert.equal(reads, 2);
    Object.assign(process.env, {LKB_JOIN_RULES_ENABLED: "1", LKB_JOIN_RULES_STATE_DIR: "relative/rules"});
    await assert.rejects(buildProductionDeps().meetingCandidates!.listCandidates("toc"), /Candidate policy unavailable/);
    Object.assign(process.env, {LKB_JOIN_RULES_ENABLED: "0", LKB_CALENDAR_WORKER_ENABLED: "1", LKB_CALENDAR_WORKER_BINDINGS: "invalid"});
    await assert.rejects(buildProductionDeps().meetingCandidates!.listCandidates("toc"), /Candidate policy unavailable/); assert.equal(reads, 2);
  } finally {await close(); rows.mock.restore(); connection.mock.restore(); for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];}
});

/** ua-production-enable P-2/P-3: the /admin perimeter as buildUserAccounts composes it, through createServer, over an in-memory Db (no Mongo). */
type Doc = Record<string, any>;
function matchesDoc(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return (v as Doc[]).some((f) => matchesDoc(doc, f));
    const d = doc[k];
    if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).some((x) => x.startsWith("$"))) {
      return Object.entries(v as Doc).every(([op, arg]) => op === "$exists" ? (d !== undefined) === arg : op === "$ne" ? d !== arg : op === "$gt" ? d > arg : op === "$gte" ? d >= arg : op === "$lt" ? d < arg : (() => { throw new Error(`unsupported ${op}`); })());
    }
    return JSON.stringify(d) === JSON.stringify(v);
  });
}
function accountsDb() {
  const store = new Map<string, Doc[]>();
  const rows = (n: string): Doc[] => { let r = store.get(n); if (!r) store.set(n, r = []); return r; };
  const db = { collection: (name: string) => ({
    findOne: async (f: Doc) => rows(name).find((d) => matchesDoc(d, f)) ?? null,
    insertOne: async (d: Doc) => { rows(name).push({ ...d }); return { insertedId: d._id }; },
    updateOne: async (f: Doc, u: Doc) => { const d = rows(name).find((x) => matchesDoc(x, f)); if (!d) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(d, u.$set ?? {}); for (const k of Object.keys(u.$unset ?? {})) delete d[k]; return { matchedCount: 1, modifiedCount: 1 }; },
    deleteMany: async (f: Doc) => { const before = rows(name).length; store.set(name, rows(name).filter((d) => !matchesDoc(d, f))); return { deletedCount: before - rows(name).length }; },
    countDocuments: async (f: Doc) => rows(name).filter((d) => matchesDoc(d, f)).length,
    bulkWrite: async (ops: Doc[]) => { let modifiedCount = 0;
      for (const { updateMany } of ops) for (const d of rows(name).filter((x) => matchesDoc(x, updateMany.filter))) { Object.assign(d, updateMany.update.$set ?? {}); modifiedCount++; }
      return { modifiedCount }; },
  }) } as unknown as Db;
  return { db, rows };
}

const UA_ENV = { AUTH_CSRF_SECRET: "s".repeat(48), USER_SIGNUP_TENANT: "toc", APP_PUBLIC_ORIGIN: "https://kb.example.org", APP_BASE_PATH: "/knowledgebase", NODE_ENV: "production" };

async function adminRig() {
  const { db, rows } = accountsDb();
  const ua = buildUserAccounts(UA_ENV, db, { warn: () => {} });
  assert.ok(ua?.adminRouter && ua.auth, "user accounts composed");
  const now = new Date().toISOString(), base = { tenantId: "toc", createdAt: now, updatedAt: now, displayName: "x", statusChangedAt: now };
  rows("users").push({ ...base, _id: "admin1", emailNormalized: "admin@example.org", status: "active", role: "admin" });
  rows("users").push({ ...base, _id: "target1", emailNormalized: "t@example.org", status: "active", role: "member" });
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore({ "key-ua": { tenantId: "toc", scopes: ["user-admin", "ask"] } }), corsOrigins: [UA_ENV.APP_PUBLIC_ORIGIN], userAccounts: ua }));
  const { token, session } = await ua.sessions.create("toc", "admin1");
  const post = async (path: string, o: { bearer?: string; session?: boolean; body?: unknown } = {}) => {
    const headers: Record<string, string> = { connection: "close", "content-type": "application/json" };
    if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
    if (o.session) Object.assign(headers, { cookie: `${COOKIE_NAME_SECURE}=${token}`, origin: UA_ENV.APP_PUBLIC_ORIGIN, "x-lkb-csrf": csrfTokenFor(session._id, UA_ENV.AUTH_CSRF_SECRET) });
    const res = await fetch(server.baseUrl + path, { method: "POST", headers, body: JSON.stringify(o.body ?? {}) });
    return { status: res.status, json: await res.json().catch(() => null) as Doc | null };
  };
  return { ua, rows, post, close: server.close };
}

test("P-2 /admin mount through createServer: anonymous 401, API-key mutation 403, admin session mutation 200", async () => {
  const r = await adminRig();
  try {
    assert.equal((await r.post("/admin/users/target1/unlock")).status, 401, "anonymous");
    const key = await r.post("/admin/users/target1/unlock", { bearer: "key-ua" });
    assert.equal(key.status, 403, "an API key never mutates, even one holding user-admin"); assert.equal(key.json!.error, "admin_session_required");
    const ok = await r.post("/admin/users/target1/unlock", { session: true });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
  } finally { await r.close(); }
});

test("P-3 ISS-UAADMIN-005: A4 failed logins lock an address; the buildUserAccounts admin router unlocks exactly that throttle row; issue links use APP_PUBLIC_ORIGIN + APP_BASE_PATH", async () => {
  const r = await adminRig();
  try {
    for (let i = 0; i < 8; i++) await r.ua.auth.login("toc", { email: "t@example.org", password: "wrong-password-123" });
    const throttles = r.rows("auth_throttles");
    assert.equal(throttles.length, 1, "A4 login failures wrote exactly one throttle row");
    assert.equal(throttles[0]!.subjectHash, r.ua.auth.subjectHash("toc", "t@example.org"), "keyed by the auth service's own subjectHash");
    assert.ok(throttles[0]!.lockedUntil !== undefined, "the address is locked");
    const unlock = await r.post("/admin/users/target1/unlock", { session: true });
    assert.equal(unlock.status, 200, JSON.stringify(unlock.json)); assert.equal(unlock.json!.cleared, true);
    assert.equal(r.rows("auth_throttles").length, 0, "the A4 throttle row is gone");
    assert.ok(r.rows("auth_events").some((e) => e.type === "unlocked"), "unlock is audited");
    const link = await r.post("/admin/users/target1/issue-link", { session: true, body: { purpose: "password_reset" } });
    assert.equal(link.status, 200, JSON.stringify(link.json));
    assert.ok(String(link.json!.link).startsWith("https://kb.example.org/knowledgebase/"), `link origin + base path: ${String(link.json!.link).replace(/#.*/, "")}`);
  } finally { await r.close(); }
});
