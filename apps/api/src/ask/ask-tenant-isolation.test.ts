/**
 * apps/api/src/ask/ask-tenant-isolation.test.ts - t043-api-ask-tenant-scope-proof.
 *
 * Proves, against a TENANT-BLIND in-memory database that holds BOTH tenants' rows, that what
 * `apps/api` injects into Ask is tenant-filtered: the per-tenant tree load, the per-request
 * candidate arms (`createAskArmsFor`), and the tenant-bound hydrator (`createSourceHydrator`),
 * plus the real HTTP route composed from them.
 *
 * THE FAKE (`BlindDb`) knows nothing about tenants. It is a dumb collection: `find(filter)` /
 * `findOne(filter)` return every stored row that satisfies the filter it is handed, using a
 * generic Mongo-subset matcher (equality, null-matches-missing, `$in`). If production code omits
 * `tenantId` from a query, tenant B's rows come straight back - that is the ISS-078 failure shape,
 * and these tests are built so it is observable. Every query is recorded with the rows it
 * returned. All data below is synthetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexNode } from "@lkb/core";
import { treeIndexRootFilter } from "@lkb/index";
import { BoundedAskError } from "@lkb/ask";
import { createAskArmsFor } from "../ask-arms.js";
import { createSourceHydrator, createSourceRequestDepsFor } from "./source-context.js";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeAskDeps } from "../fixtures.js";
import type { TreeStore } from "../routes/ask/ask.js";

// ---------------------------------------------------------------- tenant-blind fake database
type Row = Record<string, unknown>;
interface Query { coll: string; op: "find" | "findOne"; filter: Record<string, unknown>; returned: number }

function fieldMatches(actual: unknown, want: unknown): boolean {
  if (want !== null && typeof want === "object" && "$in" in (want as object)) {
    return ((want as { $in: unknown[] }).$in).some((w) => fieldMatches(actual, w));
  }
  if (want === undefined || want === null) return actual === undefined || actual === null; // Mongo: null matches missing
  return actual === want;
}
const matches = (row: Row, filter: Record<string, unknown>): boolean =>
  Object.entries(filter).every(([k, v]) => fieldMatches(row[k], v));

class BlindDb {
  readonly queries: Query[] = [];
  constructor(private readonly data: Record<string, Row[]>) {}
  /** Rows of a collection exactly as stored (test-side inspection only). */
  all(coll: string): Row[] { return this.data[coll] ?? []; }
  asDb(): Pick<Db, "collection"> {
    const self = this;
    return { collection: (coll: string) => ({
      find: (filter: Record<string, unknown> = {}) => ({ toArray: async () => {
        const rows = (self.data[coll] ?? []).filter((r) => matches(r, filter));
        self.queries.push({ coll, op: "find", filter: structuredClone(filter), returned: rows.length });
        return structuredClone(rows);
      } }),
      findOne: async (filter: Record<string, unknown> = {}) => {
        const row = (self.data[coll] ?? []).find((r) => matches(r, filter)) ?? null;
        self.queries.push({ coll, op: "findOne", filter: structuredClone(filter), returned: row ? 1 : 0 });
        return row ? structuredClone(row) : null;
      },
    }) } as unknown as Pick<Db, "collection">;
  }
}

// ---------------------------------------------------------------- synthetic two-tenant corpus
const QUERY = "Visa October";
const A = "tA", B = "tB";
const B_MARKERS = ["Zanzibar-B", "b-only-session", "tenant:tB", "b-turn-", "b-chunk-", "tB"];

const sessionNode = (tenant: string, id: string, title: string): TreeIndexNode =>
  ({ node_id: `tenant:${tenant}/session:${id}`, title, level: "session", summary: "stub", evidence: { sessionRef: id }, children: [] });
const root = (tenant: string, children: TreeIndexNode[]): Row =>
  ({ _id: `root-${tenant}`, tenantId: tenant, node_id: `tenant:${tenant}`, title: tenant, level: "tenant", summary: "", children });

// A has "s-shared" and "s-a2". B shares the id "s-shared" and owns "b-only-session". B's rows
// repeat the query terms so any scorer ranks them above A's.
const A_TREE_SESSIONS = [sessionNode(A, "s-shared", "Visa October forms"), sessionNode(A, "s-a2", "Visa funding")];
const B_TREE_SESSIONS = [sessionNode(B, "s-shared", "Visa October forms bonus Zanzibar-B"), sessionNode(B, "b-only-session", "Visa October Zanzibar-B")];

function corpus(): Record<string, Row[]> {
  return {
    tree_index: [root(A, A_TREE_SESSIONS), root(B, B_TREE_SESSIONS)],
    turns: [
      { _id: "a-turn-1", tenantId: A, sessionId: "s-shared", speakerRef: "spk:0", tStart: 10, tEnd: 20, text: "Visa forms open in October." },
      { _id: "a-turn-2", tenantId: A, sessionId: "s-a2", speakerRef: "spk:1", tStart: 5, tEnd: 9, text: "Funding visa decisions arrive later." },
      { _id: "b-turn-1", tenantId: B, sessionId: "s-shared", speakerRef: "spk:9", tStart: 10, tEnd: 20,
        text: "Visa October visa October Zanzibar-B bursary visa forms open October." },
      { _id: "b-turn-2", tenantId: B, sessionId: "b-only-session", speakerRef: "spk:9", tStart: 1, tEnd: 4,
        text: "Zanzibar-B visa October visa October only for tenant B." },
    ],
    chunks: [
      { _id: "a-chunk-1", tenantId: A, sourceRef: "s-shared", turnRefs: ["a-turn-1"], chunkIndex: 0, vector: [0.6, 0.8], dims: 2, embeddingModel: "offline" },
      { _id: "a-chunk-2", tenantId: A, sourceRef: "s-a2", turnRefs: ["a-turn-2"], chunkIndex: 0, vector: [0, 1], dims: 2, embeddingModel: "offline" },
      { _id: "b-chunk-1", tenantId: B, sourceRef: "s-shared", turnRefs: ["b-turn-1"], chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "offline" },
      { _id: "b-chunk-2", tenantId: B, sourceRef: "b-only-session", turnRefs: ["b-turn-2"], chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "offline" },
    ],
  };
}

const embed = async () => ({ vectors: [[1, 0]], dims: 2, provider: "offline", model: "offline" });
const leaks = (value: unknown): string[] => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return B_MARKERS.filter((m) => text.includes(m));
};
/** Tenant-A tree as a node tree (what tree.load(A) must return). */
const aTree = (): TreeIndexNode => ({ node_id: `tenant:${A}`, title: A, level: "tenant", summary: "", children: structuredClone(A_TREE_SESSIONS) });

/** Replica of `createMongoTreeStore.load` (store.ts:55-62) bound to the blind db. The real store
 * calls the module-global `getDb()` which cannot be injected hermetically; the call site is
 * pinned by tree-index-root-filter-single-source.test.ts. What this exercises for real is
 * `treeIndexRootFilter` (the production filter function) against both tenants' roots. */
const blindTreeStore = (db: BlindDb, loads: string[]): TreeStore => ({
  load: async (tenantId: string) => {
    loads.push(tenantId);
    return (await db.asDb().collection("tree_index").findOne(treeIndexRootFilter(tenantId))) as unknown as TreeIndexNode | null;
  },
});

const unscoped = (qs: Query[], tenant: string) => qs.filter((q) => q.filter.tenantId !== tenant);

// ---------------------------------------------------------------- fixture sanity (fake is blind)
test("sanity: the fake is tenant-blind and the bait outscores the real row (a missing filter WOULD leak)", async () => {
  const db = new BlindDb(corpus());
  const rows = await db.asDb().collection("turns").find({ sessionId: { $in: ["s-shared"] } } as never).toArray() as unknown as Row[];
  assert.deepEqual(rows.map((r) => r.tenantId).sort(), [A, B], "an unscoped query returns BOTH tenants - the fake adds no protection");
  const bait = await createSourceHydrator(B, { db: db.asDb(), embed })(QUERY, [sessionNode(B, "s-shared", "x")]);
  const own = await createSourceHydrator(A, { db: db.asDb(), embed })(QUERY, [sessionNode(A, "s-shared", "x")]);
  const quoteOf = (r: typeof bait) => (r.nodes[0]!.evidence!.sourceQuotes as { quote: string }[]).map((q) => q.quote).join("|");
  assert.match(quoteOf(bait), /Zanzibar-B/);
  assert.doesNotMatch(quoteOf(own), /Zanzibar-B/);
});

// ---------------------------------------------------------------- seam 1: tree load
test("tree load: tenant A gets A's root, never B's, with every query carrying A's filter", async () => {
  const db = new BlindDb(corpus());
  const loads: string[] = [];
  const store = blindTreeStore(db, loads);
  const tree = (await store.load(A)) as unknown as Row;
  assert.equal(tree.tenantId, A);
  assert.equal(tree.node_id, "tenant:tA");
  assert.deepEqual(leaks(tree), []);
  assert.equal(db.queries.length, 1);
  assert.deepEqual(db.queries[0]!.filter, { node_id: "tenant:tA", level: "tenant", tenantId: A });
  // Both roots exist; B's is reachable only by B's own filter.
  assert.equal(((await store.load(B)) as unknown as Row).tenantId, B);
});

test("tree load: empty / undefined tenant matches no root and returns null", async () => {
  for (const bad of ["", undefined as unknown as string]) {
    const db = new BlindDb(corpus());
    assert.equal(await blindTreeStore(db, []).load(bad), null, `tenant ${JSON.stringify(bad)}`);
    assert.equal(db.queries[0]!.returned, 0);
  }
});

// ---------------------------------------------------------------- seam 2: candidate arms
test("arms: tenant A's vector + lexical arms return only A's nodes, in A-only order, though B outscores A on shared session ids", async () => {
  const db = new BlindDb(corpus());
  const tree = aTree();
  const res = await createAskArmsFor({ embed: embed as never, db: db.asDb() })(A)(QUERY, tree);
  const ids = res.arms.map((arm) => arm.map((n) => n.node_id));
  assert.equal(res.degraded, null);
  assert.equal(ids.length, 2, "vector and lexical arms both ran");
  // Returned ids alone cannot expose a leak here (B's s-shared maps onto A's own node and B's
  // b-only-session is dropped as a ghost), so the load-bearing assertions are the recorded
  // queries and per-query returned-row counts below.
  assert.deepEqual(ids[0], ["tenant:tA/session:s-shared", "tenant:tA/session:s-a2"]);
  assert.deepEqual(ids[1], ["tenant:tA/session:s-shared", "tenant:tA/session:s-a2"]);
  for (const arm of res.arms) for (const n of arm) assert.ok(n.node_id.startsWith("tenant:tA/"), n.node_id);
  assert.deepEqual(leaks(res), []);
  // THE ISS-078 assertion: every query the arms issued carries tenant A's filter and nothing else's rows came back.
  assert.ok(db.queries.length >= 2);
  assert.deepEqual(unscoped(db.queries, A), []);
  for (const q of db.queries) assert.equal(q.filter.tenantId, A);
  assert.equal(db.queries.find((q) => q.coll === "chunks")!.returned, 2, "only A's two chunks, not B's");
  assert.equal(db.queries.find((q) => q.coll === "turns")!.returned, 2, "only A's two turns, not B's");
});

test("arms: the ranking is the A-only ranking even when B's rows would reorder it (B score would win unscoped)", async () => {
  // A's own best vector is s-a2 (cos 1.0, listed second in the tree). B's bait chunk on s-shared
  // also has cos 1.0; scoped, only A's data ranks. (Weak on ordering by design - the recorded
  // query filters below are the load-bearing check.)
  const data = corpus();
  (data.chunks!.find((c) => c._id === "a-chunk-2")!).vector = [1, 0];
  const db = new BlindDb(data);
  const res = await createAskArmsFor({ embed: embed as never, db: db.asDb() })(A)(QUERY, aTree());
  assert.equal(res.arms[0]![0]!.node_id, "tenant:tA/session:s-a2", "A's own chunk leads; B's tied/higher chunks did not enter the ranking");
  assert.deepEqual(unscoped(db.queries, A), []);
});

test("arms: a factory bound to tenant B never reads A and vice versa (two arm sets, one db)", async () => {
  const db = new BlindDb(corpus());
  const factory = createAskArmsFor({ embed: embed as never, db: db.asDb() });
  const bTree: TreeIndexNode = { node_id: "tenant:tB", title: B, level: "tenant", summary: "", children: structuredClone(B_TREE_SESSIONS) };
  const bRes = await factory(B)(QUERY, bTree);
  const aRes = await factory(A)(QUERY, aTree());
  assert.ok(bRes.arms.flat().length > 0 && aRes.arms.flat().length > 0, "non-vacuous");
  assert.ok(bRes.arms.flat().every((n) => n.node_id.startsWith("tenant:tB/")));
  assert.ok(aRes.arms.flat().every((n) => n.node_id.startsWith("tenant:tA/")));
  const seq = db.queries.map((q) => q.filter.tenantId);
  assert.deepEqual([...new Set(seq.slice(0, seq.length / 2))], [B]);
  assert.deepEqual([...new Set(seq.slice(seq.length / 2))], [A]);
});

test("arms: empty / undefined tenant issues NO query (both arms degrade, nothing is read unscoped)", async () => {
  for (const bad of ["", undefined as unknown as string]) {
    const db = new BlindDb(corpus());
    const res = await createAskArmsFor({ embed: embed as never, db: db.asDb() })(bad)(QUERY, aTree());
    assert.equal(db.queries.length, 0, `tenant ${JSON.stringify(bad)} must not reach the db`);
    assert.deepEqual(res.arms.flat(), []);
    assert.match(res.degraded ?? "", /tenantId is required/);
  }
});

// ---------------------------------------------------------------- seam 3: hydrator
test("hydrator: tenant A's quotes only, though B has the same sessionId with higher-scoring text and chunks", async () => {
  const db = new BlindDb(corpus());
  const admitted = [sessionNode(A, "s-shared", "Visa October forms")];
  const out = await createSourceHydrator(A, { db: db.asDb(), embed })(QUERY, admitted);
  const quotes = out.nodes[0]!.evidence!.sourceQuotes as { turnId: string; quote: string; sessionRef: string }[];
  assert.deepEqual(quotes.map((q) => q.turnId), ["a-turn-1"]);
  assert.equal(quotes[0]!.quote, "Visa forms open in October.");
  assert.deepEqual(leaks(out), []);
  assert.deepEqual(unscoped(db.queries, A), []);
  assert.deepEqual(db.queries.map((q) => [q.coll, q.returned]), [["turns", 1], ["chunks", 1]], "turns and chunks each returned only A's single row");
});

test("hydrator: asked for a session that exists only for B it refuses (no source rows) and leaks nothing", async () => {
  const db = new BlindDb(corpus());
  await assert.rejects(
    createSourceHydrator(A, { db: db.asDb(), embed })(QUERY, [sessionNode(A, "b-only-session", "x")]),
    (e: unknown) => e instanceof BoundedAskError && /no source rows/.test(e.message) && leaks((e as Error).message).length === 0,
  );
  assert.deepEqual(unscoped(db.queries, A), []);
  assert.ok(db.queries.every((q) => q.returned === 0), "B's rows were never returned to A");
});

test("hydrator: mixed ask (A's shared id + B-only id) refuses wholesale rather than serving B's session", async () => {
  const db = new BlindDb(corpus());
  await assert.rejects(createSourceHydrator(A, { db: db.asDb(), embed })(QUERY,
    [sessionNode(A, "s-shared", "x"), sessionNode(A, "b-only-session", "y")]), BoundedAskError);
  assert.deepEqual(unscoped(db.queries, A), []);
});

test("hydrator: empty / undefined tenant fails before any query", async () => {
  for (const bad of ["", undefined as unknown as string]) {
    const db = new BlindDb(corpus());
    await assert.rejects(createSourceHydrator(bad, { db: db.asDb(), embed })(QUERY, [sessionNode(A, "s-shared", "x")]), /tenantId is required/);
    assert.equal(db.queries.length, 0);
  }
});

// ---------------------------------------------------------------- the real HTTP route
function completion(json: unknown) {
  return { text: JSON.stringify(json), json, provider: "offline", model: "test", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } };
}

async function runRoute(opts: { db: BlindDb; key?: string; tenantOfKey?: string | undefined; body?: Record<string, unknown>; path?: string; headers?: Record<string, string> }) {
  const { db } = opts;
  const loads: string[] = [], prompts: string[] = [], writes: unknown[] = [], logs: string[] = [], requestTenants: string[] = [];
  const keys = { "k": { tenantId: opts.tenantOfKey as string, scopes: ["ask"] } };
  const base = buildTestDeps({ keyStore: fakeKeyStore(keys) });
  base.ask.tree = blindTreeStore(db, loads);
  const factory = createSourceRequestDepsFor({
    db: db.asDb(), embed: embed as never, write: async (j) => { writes.push(j); },
    treeSearchFn: (rootNode, ids) => {
      const out: TreeIndexNode[] = []; const walk = (n: TreeIndexNode) => { if (ids.includes(n.node_id)) out.push(n); n.children.forEach(walk); };
      walk(rootNode); return out;
    },
    dispatch: async (job, tenantId) => {
      requestTenants.push(tenantId);
      prompts.push(JSON.stringify(job.messages));
      if (job.kind === "ask.select_nodes") return completion({ node_ids: [] });
      if (job.kind === "evaluator") return completion({ score: 0.9, reason: "ok" });
      if (job.kind === "ask.answer_grounding") return completion({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const context = JSON.parse(job.messages[1]!.content).context;
      return completion({ sentences: [{ text: "Forms open in October.", sourceIds: [context.sources[0].sourceId] }] });
    },
  });
  base.ask.requestDepsFor = (tenantId) => { return factory(tenantId); };
  const server = await startTestServer(base);
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
  try {
    const reply = await fetch(server.baseUrl + (opts.path ?? "/ask"), { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + (opts.key ?? "k"), ...(opts.headers ?? {}) },
      body: JSON.stringify(opts.body ?? { query: QUERY }) });
    const text = await reply.text();
    return { status: reply.status, text, loads, prompts, writes, logs, requestTenants };
  } finally { Object.assign(console, orig); await server.close(); }
}

test("HTTP /ask as tenant A: tree is A's, quotes are A's, nothing of B in body / prompts / job rows / logs, every query carries tA", async () => {
  const db = new BlindDb(corpus());
  const r = await runRoute({ db, tenantOfKey: A });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.loads, [A], "only A's tree was loaded");
  const body = JSON.parse(r.text) as { sources: { internal: { node_id: string; evidence: { sourceQuotes: { turnId: string }[] } }[] } };
  assert.ok(body.sources.internal.length > 0, "non-vacuous: A got a cited answer");
  assert.deepEqual(body.sources.internal.map((s) => s.node_id).filter((id) => !id.startsWith("tenant:tA/")), []);
  assert.deepEqual(body.sources.internal.flatMap((s) => s.evidence.sourceQuotes.map((q) => q.turnId)).filter((t) => t !== "a-turn-1" && t !== "a-turn-2"), []);
  assert.deepEqual(leaks(r.text), [], "response body");
  assert.deepEqual(leaks(r.prompts), [], "prompts sent to the model");
  assert.deepEqual(leaks(r.writes), [], "job rows");
  assert.deepEqual(leaks(r.logs), [], "console output");
  assert.ok(r.requestTenants.length > 0 && r.requestTenants.every((t) => t === A));
  assert.ok(db.queries.some((q) => q.coll === "turns") && db.queries.some((q) => q.coll === "chunks") && db.queries.some((q) => q.coll === "tree_index"), "tree, turns and chunks were all read");
  assert.deepEqual(unscoped(db.queries, A), [], "every query the route issued carries tenantId=tA");
  assert.ok(r.writes.every((w) => (w as { tenantId?: string }).tenantId === undefined || (w as { tenantId?: string }).tenantId === A));
});

test("HTTP /ask: tenant-like body fields, query string and headers cannot override the key-derived tenant", async () => {
  const db = new BlindDb(corpus());
  const r = await runRoute({ db, tenantOfKey: A, path: "/ask?tenantId=tB&tenant=tB",
    body: { query: QUERY, tenantId: B, tenant: B, tenant_id: B, scope: { tenantId: B } },
    headers: { "x-tenant-id": B, "x-tenant": B } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.loads, [A]);
  assert.deepEqual(leaks(r.text), []);
  assert.deepEqual(unscoped(db.queries, A), []);
  assert.deepEqual(leaks(r.writes), []);
});

test("HTTP /ask as tenant B is symmetric: B sees B and never A (non-vacuity for the isolation claim)", async () => {
  const db = new BlindDb(corpus());
  const r = await runRoute({ db, tenantOfKey: B });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.loads, [B]);
  assert.match(r.text, /Zanzibar-B/);
  assert.doesNotMatch(r.text, /Visa forms open in October\./);
  assert.deepEqual(unscoped(db.queries, B), []);
});

test("HTTP /ask with an empty or undefined resolved tenant: no tenant data, no turns/chunks query, nothing unscoped", async () => {
  for (const bad of ["", undefined]) {
    const db = new BlindDb(corpus());
    const r = await runRoute({ db, tenantOfKey: bad });
    assert.equal(r.status, 404, `tenant ${JSON.stringify(bad)}: ${r.text}`);
    assert.deepEqual(leaks(r.text), []);
    assert.deepEqual(db.queries.filter((q) => q.coll !== "tree_index"), [], "no turns/chunks read");
    assert.ok(db.queries.every((q) => q.returned === 0), "no row of any tenant returned");
    assert.ok(!r.text.includes("Visa forms open"), "no A text either");
    assert.deepEqual(r.requestTenants, []);
  }
});

test("HTTP /ask legacy arms path (extraCandidateArmsFor): arms are built per request from the key tenant only", async () => {
  const db = new BlindDb(corpus());
  const base = buildTestDeps({ keyStore: fakeKeyStore({ k: { tenantId: A, scopes: ["ask"] } }) });
  const loads: string[] = [], bound: string[] = [];
  base.ask.tree = blindTreeStore(db, loads);
  base.ask.askDeps = fakeAskDeps();
  const arms = createAskArmsFor({ embed: embed as never, db: db.asDb() });
  base.ask.extraCandidateArmsFor = (tenantId) => { bound.push(tenantId); return arms(tenantId); };
  const server = await startTestServer(base);
  try {
    const reply = await fetch(server.baseUrl + "/ask", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer k" },
      body: JSON.stringify({ query: QUERY, tenantId: B }) });
    const text = await reply.text();
    assert.equal(reply.status, 200, text);
    assert.deepEqual(bound, [A]);
    assert.deepEqual(leaks(text), []);
    assert.ok(db.queries.some((q) => q.coll === "turns"), "arms actually queried");
    assert.deepEqual(unscoped(db.queries, A), []);
  } finally { await server.close(); }
});
