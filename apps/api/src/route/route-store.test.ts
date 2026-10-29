/**
 * apps/api/src/route/route-store.test.ts - D-206 /route retrieval over an in-memory Mongo handle that applies filters:
 * tenancy, withdrawn / index-failed dropped after selection, hit shape == /search, step B (fakeable, bounded, falls
 * back), the deadline, and the no-LLM latency target. No live provider or database is ever touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompleteResult, Job } from "@lkb/ai";
import { createMongoSearchDeps } from "../search-store.js";
import { createRouteDeps, RouteNoTree, RouteTimeout, type RouteStats } from "./route-store.js";
import { NATURAL_QUESTIONS, fakeRouteDb, sessionIdOf, syntheticTree } from "./route.testsupport.js";
import { queryFacetTokens } from "./facets.js";

const far = () => ({ deadlineAt: Date.now() + 60_000 });
const sessionNode = (tenant: string, i: number) => `${tenant}/year:2026/month:03/session:${sessionIdOf(i)}`;
const reply = (ids: string[]): CompleteResult => ({ text: "", json: { node_ids: ids }, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake" });
function setup(o: Parameters<typeof fakeRouteDb>[0] = {}, extra: Partial<Parameters<typeof createRouteDeps>[0]> = {}) {
  const f = fakeRouteDb(o), stats: RouteStats[] = [];
  const trees: Record<string, ReturnType<typeof syntheticTree>> = { toc: syntheticTree({ tenantId: "toc" }), other: syntheticTree({ tenantId: "other" }) };
  const deps = createRouteDeps({ db: f.db, tree: { load: async (t) => trees[t] ?? null }, observe: (s) => stats.push(s), ...extra });
  return { ...f, deps, stats };
}

test("tests axis: IELTS implies the tests facet and UK implies the uk country", () => {
  assert.deepEqual(queryFacetTokens("IELTS for UK masters").sort(), ["fa:tests", "fc:uk"]);
});

for (const { q, session } of NATURAL_QUESTIONS) {
  test(`"${q}" returns cited turns from ${session} only, without calling a model`, async () => {
    let llm = 0;
    const { deps, stats } = setup({}, { complete: async () => { llm++; return reply([]); } });
    const hits = await deps.route("toc", q, 5, far());
    assert.ok(hits.length > 0 && hits.length <= 5);
    assert.ok(hits[0]!.sessionId === session, `top hit from ${hits[0]?.sessionId}`);
    assert.equal(llm, 0);
    assert.equal(stats[0]!.usedLlm, false);
    assert.ok(hits.every((h) => h.turn?.text && h.turn.sessionId === h.sessionId && h.score > 0 && h.score <= 1));
  });
}

test("hit shape equals /search: same keys on the hit, the turn and the session", async () => {
  const { db, deps } = setup();
  const [mine] = await deps.route("toc", "visa requirements for Germany", 3, far());
  const [theirs] = await createMongoSearchDeps({ db }).search("toc", "blocked account", 3);
  assert.deepEqual(Object.keys(mine!).sort(), Object.keys(theirs!).sort());
  assert.deepEqual(Object.keys(mine!.turn!).sort(), Object.keys(theirs!.turn!).sort());
  assert.deepEqual(Object.keys(mine!.session!).sort(), Object.keys(theirs!.session!).sort());
});

test("tenancy: every db read is tenant-confined and another tenant's rows are never routed or returned", async () => {
  const { deps, calls } = setup();
  const hits = await deps.route("toc", "cost of living in Toronto for students", 20, far());
  assert.ok(hits.length > 0);
  for (const c of calls) assert.equal(c.filter.tenantId, "toc", `${c.coll} read without the tenant: ${JSON.stringify(c.filter)}`);
  assert.ok(hits.every((h) => h.turn?.tenantId === "toc" && String(h.turnId).startsWith("toc-")));
  const other = await deps.route("other", "cost of living in Toronto for students", 20, far());
  assert.ok(other.length > 0 && other.every((h) => h.turn?.tenantId === "other"));
});

test("the per-tenant index cache never serves one tenant's tree to another", async () => {
  const f = fakeRouteDb();
  const a = syntheticTree({ tenantId: "toc" }), b = syntheticTree({ tenantId: "other" });
  b.children[0]!.children[0]!.children[0]!.children[0]!.title = "Other Tenant Secret Webinar"; // tenant "other" has a distinct s01
  b.children[0]!.children[0]!.children[0]!.children[0]!.summary = "unmatched zebrafish genomics";
  const deps = createRouteDeps({ db: f.db, tree: { load: async (t) => (t === "toc" ? a : t === "other" ? b : null) } });
  const mine = await deps.route("toc", "zebrafish genomics", 5, far());
  assert.deepEqual(mine, [], "tenant toc must not see tenant other's routing text");
  assert.ok((await deps.route("other", "zebrafish genomics", 5, far())).length >= 0);
  await assert.rejects(deps.route("ghost", "visa", 5, far()), (e: unknown) => !(e instanceof RouteTimeout));
});

test("withdrawn and index-failed sessions are dropped after selection, even though the tree still lists them", async () => {
  const q = "IELTS requirement for UK masters";
  const base = await setup().deps.route("toc", q, 20, far());
  assert.ok(base.some((h) => h.sessionId === "s02"));
  const w = await setup({ withdrawn: ["s02"] }).deps.route("toc", q, 20, far());
  assert.ok(w.every((h) => h.sessionId !== "s02"), "withdrawn session returned");
  const failed = await setup({ failed: ["s02"] }).deps.route("toc", q, 20, far());
  assert.ok(failed.every((h) => h.sessionId !== "s02"), "index-failed session returned");
});

test("step B runs only when step A is unsure, is one bounded call, and its picks are still visibility-gated", async () => {
  const jobs: Job[] = [];
  const { deps, stats } = setup({ withdrawn: ["s06"] }, { complete: async (j) => { jobs.push(j); return reply([sessionNode("toc", 4), sessionNode("toc", 5)]); } });
  const hits = await deps.route("toc", "campus orientation panel", 5, far());
  assert.equal(jobs.length, 1, "exactly one model round");
  assert.equal(jobs[0]!.kind, "ask.select_nodes");
  assert.ok(stats[0]!.usedLlm && !stats[0]!.llmFailed);
  assert.deepEqual(stats[0]!.selectedSessions, ["s05"]);
  assert.ok(hits.length > 0 && hits.every((h) => h.sessionId === "s05"));
  assert.ok(!JSON.stringify(jobs[0]!.messages).includes(sessionNode("toc", 5)), "a withdrawn session's routing text must not reach the model");
});

test("step B timeout, error and garbage all fall back to step A without hanging", async () => {
  for (const complete of [
    () => new Promise<CompleteResult>(() => undefined),
    async () => { throw new Error("provider down"); },
    async () => ({ ...reply([]), json: undefined, text: "not json" }),
  ]) {
    const { deps, stats } = setup({}, { complete, stepBTimeoutMs: 40 });
    const t0 = Date.now();
    const hits = await deps.route("toc", "orientation panel counsellor", 5, far());
    assert.ok(Date.now() - t0 < 1000);
    assert.ok(stats[0]!.llmFailed && stats[0]!.usedLlm);
    assert.ok(Array.isArray(hits));
  }
});

test("a confident step A never calls the model (no-LLM path) and a missing model disables step B", async () => {
  let n = 0;
  await setup({}, { complete: async () => { n++; return reply([]); } }).deps.route("toc", "visa requirements for Germany", 5, far());
  assert.equal(n, 0);
  const { deps, stats } = setup();
  await deps.route("toc", "campus orientation panel", 5, far());
  assert.equal(stats[0]!.usedLlm, false);
});

test("deadline: an expired budget throws RouteTimeout before any turn read", async () => {
  const { deps, calls } = setup();
  await assert.rejects(deps.route("toc", "visa requirements for Germany", 5, { deadlineAt: Date.now() - 1 }), RouteTimeout);
  assert.ok(!calls.some((c) => c.coll === "turns"));
});

test("a tenant without a tree is reported as no_tree", async () => {
  const f = fakeRouteDb();
  await assert.rejects(createRouteDeps({ db: f.db, tree: { load: async () => null } }).route("toc", "visa", 5, far()), RouteNoTree);
});

test("no-LLM end to end on the synthetic 22-session / 110-topic corpus (warm index) stays under 300 ms; timings reported", async () => {
  const { deps } = setup();
  await deps.route("toc", "warm up the index visa", 5, far());
  const timings: string[] = [];
  for (const { q } of NATURAL_QUESTIONS) {
    const t0 = performance.now();
    await deps.route("toc", q, 5, far());
    const ms = performance.now() - t0;
    timings.push(`${q}: ${ms.toFixed(1)}ms`);
    assert.ok(ms < 300, `${q} took ${ms}ms`);
  }
  console.log("ROUTE-TIMINGS " + timings.join(" | "));
});
