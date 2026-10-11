/**
 * apps/api/src/ask/ask-tenant-hostile.test.ts - auth-require-tenant-on-key, fix cycles 1-2 (ISS-AUTHTENANT-001, -004, -005).
 *
 * Cycle 0 changed one assertion in ask-tenant-isolation.test.ts from 404 to 401 for an empty tenant, because
 * requireAuth now refuses first. That made the route/tree-store protection unasserted: with auth bypassed or
 * changed, nothing would notice. These tests restore the DEEPER layer WITHOUT auth: they mount the real
 * `createAskRouter` behind a stub middleware that sets `req.auth` directly (no production bypass switch), and
 * push one shared table of hostile tenants through every tenant-scoped read level: tree store, route, arms,
 * hydrator, and (relative import of THIS lane's source) the scoped accessor.
 *
 * GUARD NOTE: in a lane worktree `@lkb/db` resolves to the MAIN tree (old `!tenantId` guard); after merge it is
 * the new throwing guard. Everything below holds under both, except cases that need the new guard to refuse an
 * OPERATOR object, which are skipped (loudly) when the resolved guard still lets one through.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { TreeIndexNode } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { createAskArmsFor } from "../ask-arms.js";
import { createSourceHydrator, createSourceRequestDepsFor } from "./source-context.js";
import { createAskRouter, type TreeStore } from "../routes/ask/ask.js";
import { BlindDb, realTreeStore, type Row } from "./tenant-test-kit.js";
import { fakeAskDeps } from "../fixtures.js";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";

// ---------------------------------------------------------------- two real tenants with unique sentinels
const QUERY = "Visa October";
const A = "tA", B = "tB", NONE = "tNone";
const SENT_A = "SENT-A-ALPHA-7f3", SENT_B = "SENT-B-BRAVO-9c1";
const SENTINELS = [SENT_A, SENT_B, "tenant:tB", "b-turn-", "b-chunk-"];
const sess = (t: string, id: string, title: string): TreeIndexNode =>
  ({ node_id: `tenant:${t}/session:${id}`, title, level: "session", summary: "stub", evidence: { sessionRef: id }, children: [] });
const root = (t: string, kids: TreeIndexNode[]): Row => ({ _id: `root-${t}`, tenantId: t, node_id: `tenant:${t}`, title: t, level: "tenant", summary: "", children: kids });
const A_KIDS = [sess(A, "s-shared", `Visa October forms ${SENT_A}`)];
const B_KIDS = [sess(B, "s-shared", `Visa October forms bonus ${SENT_B}`)];
const corpus = (): Record<string, Row[]> => ({
  tree_index: [root(A, A_KIDS), root(B, B_KIDS)],
  turns: [
    { _id: "a-turn-1", tenantId: A, sessionId: "s-shared", speakerRef: "spk:0", tStart: 10, tEnd: 20, text: `Visa forms open in October ${SENT_A}.` },
    { _id: "b-turn-1", tenantId: B, sessionId: "s-shared", speakerRef: "spk:9", tStart: 10, tEnd: 20, text: `Visa October visa October ${SENT_B} bursary.` },
  ],
  chunks: [
    { _id: "a-chunk-1", tenantId: A, sourceRef: "s-shared", turnRefs: ["a-turn-1"], chunkIndex: 0, vector: [0.6, 0.8], dims: 2, embeddingModel: "offline" },
    { _id: "b-chunk-1", tenantId: B, sourceRef: "s-shared", turnRefs: ["b-turn-1"], chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "offline" },
  ],
});
const embed = async () => ({ vectors: [[1, 0]], dims: 2, provider: "offline", model: "offline" });
const aTree = (): TreeIndexNode => ({ node_id: `tenant:${A}`, title: A, level: "tenant", summary: "", children: structuredClone(A_KIDS) });
const found = (value: unknown, needles = SENTINELS) => { const t = typeof value === "string" ? value : JSON.stringify(value) ?? ""; return needles.filter((n) => t.includes(n)); };

// ---------------------------------------------------------------- the shared hostile-tenant table
const HOSTILE: ReadonlyArray<readonly [label: string, value: unknown]> = [
  ["empty string", ""], ["whitespace-only", "   "], ["undefined", undefined], ["null", null], ["number", 5],
  ["{$ne:null}", { $ne: null }], ["{$gt:''}", { $gt: "" }], ["{$in:[A,B]}", { $in: [A, B] }], ["{$regex:'.*'}", { $regex: ".*" }],
  ["array [A]", [A]], ["\" tA\" (leading space)", " tA"], ["\"tA \" (trailing space)", "tA "], ["valid tenant with NO data", NONE],
];
const label = (l: string) => `tenant ${l}`;
const isOperatorShaped = (v: unknown) => v !== null && typeof v === "object";

/** True when the resolved `@lkb/db` accessor refuses an operator object (the new guard). Probe: a collection that must never be reached. */
const guardRefusesObjects = (() => {
  try { scopedCollection({ collection: () => ({ find: () => ({}) }) } as never, "turns")({ $ne: null } as never); return false; } catch { return true; }
})();
const needsNewGuard = (v: unknown) => isOperatorShaped(v) && !guardRefusesObjects;
const SKIP_OLD = "resolved @lkb/db is the pre-fix guard (lane junction to main): re-run after merge";

// ---------------------------------------------------------------- route harness: stub auth sets req.auth directly
interface RouteRun { status: number; text: string; loads: unknown[]; prompts: string[]; db: BlindDb }
async function runAskWithAuth(authTenant: unknown, opts: { treeFor?: (db: BlindDb, loads: unknown[]) => TreeStore } = {}): Promise<RouteRun> {
  const db = new BlindDb(corpus());
  const loads: unknown[] = [], prompts: string[] = [];
  const factory = createSourceRequestDepsFor({
    db: db.asDb(), embed: embed as never, write: async () => {},
    treeSearchFn: (rootNode, ids) => { const out: TreeIndexNode[] = []; const walk = (n: TreeIndexNode) => { if (ids.includes(n.node_id)) out.push(n); n.children.forEach(walk); }; walk(rootNode); return out; },
    dispatch: async (job) => {
      prompts.push(JSON.stringify(job.messages));
      const done = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "test", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
      if (job.kind === "ask.select_nodes") return done({ node_ids: [] });
      if (job.kind === "evaluator") return done({ score: 0.9, reason: "ok" });
      if (job.kind === "ask.answer_grounding") return done({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const context = JSON.parse(job.messages[1]!.content).context;
      return done({ sentences: [{ text: "Forms open in October.", sourceIds: [context.sources[0].sourceId] }] });
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { tenantId: authTenant as string, scopes: ["ask"] }; next(); }); // test-only stub: requireAuth is deliberately NOT mounted
  app.use(createAskRouter({ tree: (opts.treeFor ?? realTreeStore)(db, loads), askDeps: fakeAskDeps(), requestDepsFor: (t) => factory(t) }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {}; // the default error handler logs stacks; they are asserted on via the body instead
  try {
    const port = (server.address() as { port: number }).port;
    const reply = await fetch(`http://127.0.0.1:${port}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: QUERY }) });
    return { status: reply.status, text: await reply.text(), loads, prompts, db };
  } finally { Object.assign(console, orig); await new Promise<void>((r) => server.close(() => r())); }
}
const noStack = (text: string) => !/\n\s+at |node_modules|\.ts:\d+|Error:/.test(text);

// ---------------------------------------------------------------- positive controls (non-vacuity)
test("hostile route harness, positive control: tenant A gets only A's sentinel, tenant B only B's (stub auth, no requireAuth)", async () => {
  const a = await runAskWithAuth(A), b = await runAskWithAuth(B);
  assert.equal(a.status, 200, a.text); assert.equal(b.status, 200, b.text);
  assert.deepEqual(a.loads, [A]); assert.deepEqual(b.loads, [B]);
  assert.deepEqual(found(a.text), [SENT_A], "A sees exactly A's sentinel");
  assert.deepEqual(found(b.text, [SENT_A, SENT_B]), [SENT_B], "B sees exactly B's sentinel");
  assert.ok(a.db.queries.every((q) => q.filter.tenantId === A), "every query carries tA");
});

// ---------------------------------------------------------------- level 1: the PRODUCTION tree store (createMongoTreeStore().load) over the fake
const rootFilterOf = (t: unknown) => ({ node_id: `tenant:${String(t)}`, level: "tenant", tenantId: t });
for (const [tenant, mine, other] of [[A, SENT_A, SENT_B], [B, SENT_B, SENT_A]] as const) {
  test(`real tree store: tenant ${tenant} gets exactly its own root (own sentinel only), one query with the exact id`, async () => {
    const db = new BlindDb(corpus());
    const tree = await realTreeStore(db, []).load(tenant) as unknown as Row;
    assert.equal(tree.tenantId, tenant); assert.equal(tree.node_id, `tenant:${tenant}`);
    assert.deepEqual(found(tree, [mine, other]), [mine], "own sentinel, never the other tenant's");
    assert.deepEqual(db.queries.map((q) => [q.coll, q.op, q.returned]), [["tree_index", "findOne", 1]]);
    assert.deepEqual(db.queries[0]!.filter, { node_id: `tenant:${tenant}`, level: "tenant", tenantId: tenant }, "filter carries exactly this tenant as plain strings");
  });
}
for (const [name, value] of HOSTILE) {
  test(`real tree store: ${label(name)} returns null; the filter is the plain-string root filter of exactly that value`, async () => {
    const db = new BlindDb(corpus());
    assert.equal(await realTreeStore(db, []).load(value as string), null);
    assert.equal(db.queries.length, 1);
    const f = db.queries[0]!.filter;
    assert.equal(db.queries[0]!.returned, 0, `filter ${JSON.stringify(f)} must match no row`);
    assert.deepEqual(Object.keys(f), ["node_id", "level", "tenantId"], "no operator key spread in, none dropped");
    assert.equal(typeof f.node_id, "string", "node_id is a plain string, never an operator object");
    assert.deepEqual(f, rootFilterOf(value), "tenantId is the value passed in: not hard-coded, not coerced, not trimmed");
    if (typeof value === "string" && value !== A && value !== B) assert.ok(f.node_id !== `tenant:${A}` && f.node_id !== `tenant:${B}`, "never another tenant's root id (an array [tA] stringifies to it but its tenantId conjunct matches no row)");
    if (typeof value === "string") assert.ok(!JSON.stringify(f).includes(`"${A}"`) && !JSON.stringify(f).includes(B), "no other tenant's id inside the filter");
  });
}

// ---------------------------------------------------------------- level 2: the real route, auth bypassed
for (const [name, value] of HOSTILE) {
  test(`route /ask with auth bypassed: ${label(name)} -> 404 no tree, no data, no sentinel, no turns/chunks read, no model call`, async () => {
    const r = await runAskWithAuth(value);
    assert.equal(r.status, 404, r.text);
    assert.deepEqual(found(r.text), [], "neither tenant's sentinel in the body");
    assert.ok(noStack(r.text), `no stack in body: ${r.text}`);
    assert.deepEqual(r.loads, [value], "tree.load got exactly the hostile value (or was not reached)");
    if (value === NONE) assert.deepEqual(r.db.queries.map((q) => [q.coll, q.filter.tenantId]), [["tree_index", NONE]], "valid tenant, no data: one scoped tree query carrying exactly its id, then the no-data 404");
    assert.deepEqual(r.db.queries.filter((q) => q.coll !== "tree_index"), [], "no turns/chunks query");
    assert.ok(r.db.queries.every((q) => q.returned === 0), "no row of any tenant returned");
    assert.deepEqual(r.prompts, [], "no model call");
  });
}

// ---------------------------------------------------------------- level 2b: tree store itself bypassed (returns A's tree for anyone)
for (const [name, value] of HOSTILE) {
  test(`route /ask, tree store returns A's tree for ANY tenant: ${label(name)} still leaks no data and answers cleanly`, { skip: needsNewGuard(value) ? SKIP_OLD : false }, async () => {
    const r = await runAskWithAuth(value, { treeFor: (_db, loads) => ({ load: async (t: string) => { loads.push(t); return aTree(); } }) });
    if (r.status === 200) assert.deepEqual((JSON.parse(r.text) as { sources: { internal: unknown[] } }).sources.internal, [], "a 200 may carry no internal source");
    else assert.ok(r.status >= 400 && r.status < 600, `status ${r.status}: ${r.text.slice(0, 200)}`);
    console.log(`# bypassed-tree ${JSON.stringify(String(value))}: status ${r.status}`);
    if (value === NONE) { // a VALID tenant with no data legitimately queries (checker cycle 1, ISS-AUTHTENANT-005): scoped to exactly its id, nothing returned
      assert.equal(r.status, 200, r.text); assert.ok(r.db.queries.length > 0, "non-vacuous: the valid tenant did query");
      assert.ok(r.db.queries.every((q) => q.filter.tenantId === NONE), "every query carries exactly tNone"); return;
    }
    assert.deepEqual(found(r.text), [], "no sentinel in body");
    assert.ok(noStack(r.text), `no stack/internal path in body: ${r.text.slice(0, 300)}`);
    assert.ok(r.db.queries.every((q) => q.returned === 0), "no row returned by any query");
    if (guardRefusesObjects) assert.deepEqual(r.db.queries, [], "new guard: the accessor throws before any query");
  });
}

// ---------------------------------------------------------------- level 3: arms
for (const [name, value] of HOSTILE) {
  test(`arms: ${label(name)} reads no row (degrades, nothing unscoped)`, { skip: needsNewGuard(value) ? SKIP_OLD : false }, async () => {
    const db = new BlindDb(corpus());
    const res = await createAskArmsFor({ embed: embed as never, db: db.asDb() })(value as string)(QUERY, aTree());
    assert.deepEqual(found(res), [], "no sentinel in arms output");
    assert.ok(db.queries.every((q) => q.returned === 0), "no row returned");
    if (guardRefusesObjects || !isOperatorShaped(value)) assert.deepEqual(res.arms.flat().filter((n) => !n.node_id.startsWith("tenant:tA/")), []);
    if (value === NONE) { assert.ok(db.queries.length > 0, "non-vacuous: the valid tenant did query"); assert.ok(db.queries.every((q) => q.filter.tenantId === NONE), "every query carries exactly tNone"); assert.ok(!res.degraded, "not degraded"); return; }
    if (guardRefusesObjects) { assert.equal(db.queries.length, 0); assert.match(res.degraded ?? "", /tenantId is required/); }
  });
}

// ---------------------------------------------------------------- level 4: hydrator
for (const [name, value] of HOSTILE) {
  test(`hydrator: ${label(name)} returns no source text (refuses or empty) and reads no row`, { skip: needsNewGuard(value) ? SKIP_OLD : false }, async () => {
    const db = new BlindDb(corpus());
    const out = await createSourceHydrator(value as string, { db: db.asDb(), embed })(QUERY, [sess(A, "s-shared", "x")]).then((v) => ({ v }), (e: unknown) => ({ e }));
    const shown = "v" in out ? JSON.stringify(out.v) : String((out.e as Error).message);
    assert.deepEqual(found(shown), [], "no sentinel in result or error message");
    assert.ok(db.queries.every((q) => q.returned === 0), "no row returned");
    if (value === NONE) { assert.ok("e" in out ? /no source/i.test(String((out.e as Error).message)) : true, "valid tenant with no data: refused for lack of source rows (or empty), after its own scoped queries"); assert.ok(db.queries.length > 0, "non-vacuous: the valid tenant did query"); assert.ok(db.queries.every((q) => q.filter.tenantId === NONE), "every query carries exactly tNone"); return; }
    if (guardRefusesObjects) { assert.ok("e" in out, "refused"); assert.equal(db.queries.length, 0); }
  });
}

// ---------------------------------------------------------------- level 5: THIS lane's accessor guard (relative import)
test("accessor guard (this lane's packages/db source, imported by path): every hostile tenant throws, valid ids pass", () => {
  for (const [name, value] of HOSTILE) {
    if (name === "valid tenant with NO data") { assert.doesNotThrow(() => assertValidTenantId(value, "t"), name); continue; }
    assert.throws(() => assertValidTenantId(value, "t"), /tenantId is required/, name);
  }
  for (const ok of [A, B, "toc", "tenant-1", "system"]) assert.doesNotThrow(() => assertValidTenantId(ok, "t"), ok);
});

test("guard probe: reports which @lkb/db guard this run exercised", () => {
  console.log(`# @lkb/db guard refuses operator objects: ${guardRefusesObjects}`);
  assert.equal(typeof guardRefusesObjects, "boolean");
});
