/** w17-wireapi item 4: T-056 answer policy, T-054 transcript review and T-008 vectorless search are reachable
 * through the shared createServer perimeter (requireAuth + rate limit), composed by the real builders, and
 * tenant-scoped. 401 without a key, cross-tenant 404/empty, 200 on the happy path. In-memory doubles only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { buildTestDeps, fakeKeyStore } from "../../fixtures.js";
import { startTestServer } from "../../testUtils.js";
import { answerTestDb } from "../../answer-policy/answer-testdb.js";
import { memoryDb } from "../../transcript-review/memdb.testsupport.js";
import { seed, SESSION } from "../../transcript-review/persist.testkit.js";
import { buildAnswerIntegrations } from "./answers.js";
import { buildTranscriptIntegrations, type TranscriptIntegrationInput } from "./transcripts.js";
import { createMongoSearchDeps } from "../../search-store.js";

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
