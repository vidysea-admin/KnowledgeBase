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
import { NATURAL_QUESTIONS, WA_DEAD_LINKS, fakeRouteDb, sessionIdOf, setWaLink, syntheticTree } from "./route.testsupport.js";
import { queryFacetTokens } from "./facets.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";

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

// ---- ISS-421 abort / ISS-427 maxTimeMS ------------------------------------------------------------------------------------
test("ISS-421 step B: the model call receives an AbortSignal that fires when the step B budget runs out", async () => {
  let signal: AbortSignal | undefined;
  const { deps, stats } = setup({}, { complete: (job) => { signal = (job as Job & { signal?: AbortSignal }).signal; return new Promise<CompleteResult>(() => undefined); }, stepBTimeoutMs: 40 });
  await deps.route("toc", "orientation panel counsellor", 5, far());
  assert.ok(signal, "the job carries a signal");
  assert.equal(signal!.aborted, true, "the pending model call was aborted when step B gave up");
  assert.ok(stats[0]!.llmFailed);
});

test("ISS-421 deadline: aborting the request signal mid step B aborts the model call and rejects with RouteTimeout", async () => {
  let signal: AbortSignal | undefined;
  const ctl = new AbortController();
  const { deps } = setup({}, { complete: (job) => { signal = (job as Job & { signal?: AbortSignal }).signal; setTimeout(() => ctl.abort(new RouteTimeout()), 20); return new Promise<CompleteResult>(() => undefined); }, stepBTimeoutMs: 5_000 });
  const t0 = Date.now();
  await assert.rejects(deps.route("toc", "orientation panel counsellor", 5, { deadlineAt: Date.now() + 60_000, signal: ctl.signal }), RouteTimeout);
  assert.ok(Date.now() - t0 < 1500, "did not wait for the 5 s step B budget");
  assert.equal(signal!.aborted, true);
});

test("ISS-421 deadline: an already-aborted signal stops before any read", async () => {
  const { deps, calls } = setup();
  const ctl = new AbortController(); ctl.abort(new RouteTimeout());
  await assert.rejects(deps.route("toc", "visa requirements for Germany", 5, { deadlineAt: Date.now() + 60_000, signal: ctl.signal }), RouteTimeout);
  assert.ok(!calls.some((c) => c.coll === "turns"));
});

test("ISS-427 every Mongo read of a /route call carries maxTimeMS derived from the deadline", async () => {
  const { deps, calls } = setup();
  await deps.route("toc", "visa requirements for Germany", 5, { deadlineAt: Date.now() + 900 });
  assert.ok(calls.some((c) => c.coll === "turns") && calls.some((c) => c.coll === "sessions"));
  for (const c of calls.filter((x) => x.op !== "replaceOne")) { // reads only: the D-208 route_index write-through is a write, bounded by its own timer
    const ms = c.options?.maxTimeMS as number | undefined;
    assert.ok(typeof ms === "number" && ms >= 1 && ms <= 900, `${c.coll} maxTimeMS=${ms}`);
  }
});

test("ISS-427 the fingerprint read is also deadline-bounded and tenant-confined", async () => {
  const { deps, calls } = setup();
  const state = await deps.fingerprint!("toc", { deadlineAt: Date.now() + 700 });
  assert.match(state.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(calls.length === 4 && calls.every((c) => c.filter.tenantId === "toc" && typeof c.options?.maxTimeMS === "number" && (c.options.maxTimeMS as number) <= 700));
});

test("cycle 1 (C6 low): a request abort that lands while the step B frontier is being gated never starts the model call", async () => {
  const f = fakeRouteDb(), ctl = new AbortController(), real = createKnowledgeVisibility(f.db);
  let started = 0;
  const visibility = { ...real, sessionVisible: async (t: string, id: string) => { ctl.abort(new RouteTimeout()); return real.sessionVisible(t, id); } };
  const deps = createRouteDeps({ db: f.db, tree: { load: async (t) => syntheticTree({ tenantId: t }) }, visibility, complete: async () => { started++; return reply([]); } });
  await assert.rejects(deps.route("toc", "campus orientation panel", 5, { deadlineAt: Date.now() + 60_000, signal: ctl.signal }), RouteTimeout);
  assert.equal(started, 0, "the model call must not start for an already-aborted request");
});

// ISS-WARLG-001 / gate H-14: step B is the only /route step that sends text to an external model. Its frontier must drop every session whose
// WhatsApp link is not live, not suspended and studentData "no", re-checked on EVERY request, whatever index (fresh build, warm cache) served it.
const WA = sessionIdOf(4), WA_NODE = sessionNode("toc", 4), STEP_B_QUERY = "campus orientation panel";
/** The /route link-blind gate B described: `sessionVisible` ignores link state for the WhatsApp session; every other check is the real one. */
function linkBlind(db: Parameters<typeof createKnowledgeVisibility>[0]) {
  const real = createKnowledgeVisibility(db);
  return { ...real, sessionVisible: async (t: string, id: string) => id === WA || real.sessionVisible(t, id) };
}
function linkWorld(kind: Parameters<typeof setWaLink>[2]) {
  const f = fakeRouteDb(), jobs: Job[] = [], loads: string[] = [];
  setWaLink(f.data as never, WA, kind);
  const boot = () => createRouteDeps({ db: f.db, tree: { load: async (t) => { loads.push(t); return syntheticTree({ tenantId: t }); } }, visibility: linkBlind(f.db), persist: false,
    complete: async (j) => { jobs.push(j); return reply([]); } });
  const inJob = (i: number) => JSON.stringify(jobs[i]!.messages).includes(WA_NODE);
  return { ...f, boot, jobs, loads, inJob };
}

test("ISS-WARLG-001 C2: a live eligible link keeps its WhatsApp node in the step B job; non-WhatsApp nodes are in it too", async () => {
  const w = linkWorld("live");
  await w.boot().route("toc", STEP_B_QUERY, 5, far());
  assert.ok(w.inJob(0), "live link: node reaches step B as before");
  assert.ok(JSON.stringify(w.jobs[0]!.messages).includes(sessionNode("toc", 5)), "a non-WhatsApp session is unaffected");
});

for (const dead of WA_DEAD_LINKS) {
  test(`ISS-WARLG-001 C1: link ${dead} -> WhatsApp node is not in the step B job (fresh deps over the same db, and warm deps inside the TTL)`, async () => {
    const warm = linkWorld("live");
    const deps = warm.boot();
    await deps.route("toc", STEP_B_QUERY, 5, far());
    assert.ok(warm.inJob(0), "precondition: live link reaches step B");
    setWaLink(warm.data as never, WA, dead);
    await deps.route("toc", STEP_B_QUERY, 5, far()); // same deps: in-process index still warm
    assert.equal(warm.loads.length, 1, "the second request was served from the warm in-process index");
    assert.equal(warm.jobs.length, 2);
    assert.ok(!warm.inJob(1), `warm index, link ${dead}: node must not reach step B`);
    assert.ok(JSON.stringify(warm.jobs[1]!.messages).includes(sessionNode("toc", 5)), "non-WhatsApp nodes still reach step B");
    await warm.boot().route("toc", STEP_B_QUERY, 5, far()); // fresh deps (empty cache) over the same db
    assert.ok(!warm.inJob(2), `fresh deps, link ${dead}: node must not reach step B`);
  });
}

test("ISS-WARLG-001 C3: a link read error fails closed (the WhatsApp node never reaches step B)", async () => {
  const w = linkWorld("live"), real = w.db as { collection(n: string): unknown };
  const broken = { collection: (n: string) => n === "whatsapp_links" ? { findOne: async () => { throw new Error("links read failed"); }, find: () => { throw new Error("links read failed"); } } : real.collection(n) };
  const deps = createRouteDeps({ db: broken as never, tree: { load: async (t) => syntheticTree({ tenantId: t }) }, persist: false, visibility: linkBlind(w.db), complete: async (j) => { w.jobs.push(j); return reply([]); } });
  await deps.route("toc", STEP_B_QUERY, 5, far());
  assert.ok(w.jobs.length === 1 && !w.inJob(0), "read error: the WhatsApp node is withheld");
  assert.ok(JSON.stringify(w.jobs[0]!.messages).includes(sessionNode("toc", 5)), "the failure is scoped to the unverifiable session");
});

test("ISS-WARLG-001 C3: a link read that never answers is cut at half the remaining budget and fails closed", async () => {
  const w = linkWorld("live"), real = w.db as { collection(n: string): unknown };
  const hang = { collection: (n: string) => n === "whatsapp_links" ? { findOne: () => new Promise<never>(() => undefined), find: () => ({ toArray: () => new Promise<never>(() => undefined) }) } : real.collection(n) };
  const deps = createRouteDeps({ db: hang as never, tree: { load: async (t) => syntheticTree({ tenantId: t }) }, persist: false, visibility: linkBlind(hang as never), complete: async (j) => { w.jobs.push(j); return reply([]); } });
  const t0 = Date.now();
  await deps.route("toc", STEP_B_QUERY, 5, { deadlineAt: t0 + 1500 });
  assert.ok(Date.now() - t0 < 1500, "answered inside the deadline instead of hanging on the link read");
  assert.equal(w.jobs.length, 1);
  assert.ok(!w.inJob(0), "the unverifiable WhatsApp node was withheld");
  assert.ok(JSON.stringify(w.jobs[0]!.messages).includes(sessionNode("toc", 5)), "other sessions still reached step B");
});
