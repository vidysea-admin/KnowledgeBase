/**
 * apps/api/src/route/route-index-persist.test.ts - D-208 item 2: the /route index is persisted in the `route_index` collection.
 * Falsifiable properties: the persisted index is served when its visibility stamp matches; a stale one is rebuilt and
 * OVERWRITTEN (never served); tenant A never reads tenant B's index; a failing/hanging route_index read degrades to the
 * in-memory build inside the deadline; the upsert is idempotent; the in-memory layer stays the hot layer. In-memory Mongo
 * fake only; no database or provider is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRouteDeps, type PersistEvent } from "./route-store.js";
import { buildRouteIndex, routeIndexFromDoc, routeIndexToDoc, routeStepA } from "./bm25-router.js";
import { NATURAL_QUESTIONS, fakeRouteDb, syntheticTree } from "./route.testsupport.js";

const far = () => ({ deadlineAt: Date.now() + 60_000 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200 && !ok(); i++) await sleep(5);
  assert.ok(ok(), `timed out waiting for ${what}`);
}
function setup(o: Parameters<typeof fakeRouteDb>[0] = {}, extra: Partial<Parameters<typeof createRouteDeps>[0]> = {}) {
  const f = fakeRouteDb(o), events: PersistEvent[] = [], loads: string[] = [];
  const trees: Record<string, ReturnType<typeof syntheticTree>> = { toc: syntheticTree({ tenantId: "toc" }), other: syntheticTree({ tenantId: "other" }) };
  /** A fresh process over the SAME database: nothing in memory, only what was persisted. */
  const boot = (more: Partial<Parameters<typeof createRouteDeps>[0]> = {}) => createRouteDeps({
    db: f.db, tree: { load: async (t) => { loads.push(t); return trees[t] ?? null; } }, onPersist: (e) => events.push(e), ...extra, ...more });
  return { ...f, boot, events, loads, trees, deps: boot() };
}
const rows = (f: { data: Record<string, Record<string, unknown>[]> }) => f.data.route_index!;
const writes = (f: { calls: { coll: string; op?: string; filter: Record<string, unknown> }[] }) => f.calls.filter((c) => c.coll === "route_index" && c.op === "replaceOne");

test("the first request builds from the tree and persists one tenant-scoped route_index document", async () => {
  const f = setup();
  const hits = await f.deps.route("toc", "visa requirements for Germany", 3, far());
  assert.ok(hits.length > 0);
  await until(() => f.events.includes("written"), "the write");
  assert.deepEqual(f.loads, ["toc"]);
  assert.equal(rows(f).length, 1);
  const doc = rows(f)[0]!;
  assert.equal(doc._id, "toc");
  assert.equal(doc.tenantId, "toc");
  assert.equal(doc.schemaVersion, 1);
  assert.match(String(doc.fingerprint), /^[a-f0-9]{64}$/);
  assert.equal((doc.docs as unknown[]).length, 22 * 6, "22 session nodes + 110 topic nodes");
  for (const c of writes(f)) assert.equal(c.filter.tenantId, "toc");
});

test("a cold start (new process) serves the persisted index when the stamp matches: the tree is not read", async () => {
  const f = setup();
  await f.deps.route("toc", "visa requirements for Germany", 3, far());
  await until(() => f.events.includes("written"), "the write");
  const loadsBefore = f.loads.length;
  const restarted = f.boot();
  for (const { q, session } of NATURAL_QUESTIONS) {
    const hits = await restarted.route("toc", q, 5, far());
    assert.equal(hits[0]?.sessionId, session, q);
  }
  assert.equal(f.loads.length, loadsBefore, "no tree read after restart");
  assert.ok(f.events.includes("persisted-hit"));
  assert.equal(writes(f).length, 1, "a hit writes nothing");
});

test("a persisted index routes exactly like a freshly built one (step A parity)", () => {
  const tree = syntheticTree({ tenantId: "toc" }), built = buildRouteIndex(tree, "toc", 1);
  const stamp = { fingerprint: "a".repeat(64), treeRevision: 3 };
  const wire = structuredClone(routeIndexToDoc(built, "toc", stamp)); // what Mongo would hand back
  const back = routeIndexFromDoc(wire, "toc", stamp, 99)!;
  assert.ok(back);
  assert.equal(back.builtAt, 99);
  for (const { q } of NATURAL_QUESTIONS) {
    const x = routeStepA(built, q), y = routeStepA(back, q);
    assert.deepEqual(y.sessions, x.sessions, q);
    assert.equal(y.confident, x.confident);
  }
  assert.deepEqual(back.docs.map((d) => d.nodeId), built.docs.map((d) => d.nodeId));
});

test("visibility change (a consent withdrawal) -> the stored stamp is stale: rebuilt and OVERWRITTEN, never served", async () => {
  const f = setup();
  await f.deps.route("toc", "cost of living in Toronto for students", 3, far());
  await until(() => f.events.includes("written"), "the first write");
  const first = String(rows(f)[0]!.fingerprint);
  const source = f.data.sources!.find((s) => s.tenantId === "toc" && s._id === "src-toc:s01")!;
  source.consent = { given: false };
  f.events.length = 0;
  const restarted = f.boot(), loadsBefore = f.loads.length;
  await restarted.route("toc", "cost of living in Toronto for students", 3, far());
  assert.equal(f.loads.length, loadsBefore + 1, "stale persisted index is not served: the tree is rebuilt");
  assert.ok(f.events.includes("persisted-stale") && !f.events.includes("persisted-hit"));
  await until(() => f.events.includes("written"), "the overwrite");
  assert.equal(rows(f).length, 1, "overwritten in place, not appended");
  assert.notEqual(String(rows(f)[0]!.fingerprint), first);
  // and the new one is served on the next cold start
  f.events.length = 0;
  await f.boot().route("toc", "cost of living in Toronto for students", 3, far());
  assert.ok(f.events.includes("persisted-hit"));
});

test("a tree rewrite (indexRevision bump) with the visibility fingerprint unchanged also invalidates the persisted index", async () => {
  const f = setup({ extra: { tree_index: [{ _id: "root-toc", tenantId: "toc", node_id: "tenant:toc", level: "tenant", indexRevision: 4 }] } });
  await f.deps.route("toc", "visa requirements for Germany", 3, far());
  await until(() => f.events.includes("written"), "the write");
  assert.equal(rows(f)[0]!.treeRevision, 4);
  f.data.tree_index![0]!.indexRevision = 5;
  f.events.length = 0;
  const loadsBefore = f.loads.length;
  await f.boot().route("toc", "visa requirements for Germany", 3, far());
  assert.equal(f.loads.length, loadsBefore + 1);
  assert.ok(f.events.includes("persisted-stale"));
  await until(() => f.events.includes("written"), "the overwrite");
  assert.equal(rows(f)[0]!.treeRevision, 5);
});

test("tenancy: tenant A never reads tenant B's persisted index, and every route_index call carries the tenant", async () => {
  const f = setup();
  await f.deps.route("other", "visa requirements for Germany", 3, far());
  await until(() => f.events.includes("written"), "tenant other's write");
  assert.equal(rows(f).length, 1);
  const otherDoc = rows(f)[0]!;
  otherDoc.docs = (otherDoc.docs as { title: string }[]).map((d) => ({ ...d, title: "OTHER-TENANT-SECRET" }));
  f.events.length = 0;
  f.calls.length = 0;
  const hits = await f.boot().route("toc", "visa requirements for Germany", 3, far());
  assert.ok(hits.length > 0 && hits.every((h) => h.turn?.tenantId === "toc"));
  assert.ok(f.events.includes("persisted-miss"), "toc has no persisted index of its own: miss, not tenant other's");
  assert.ok(!f.events.includes("persisted-hit"));
  const ri = f.calls.filter((c) => c.coll === "route_index");
  assert.ok(ri.length >= 2);
  for (const c of ri) assert.equal(c.filter.tenantId, "toc", JSON.stringify(c));
  await until(() => rows(f).length === 2, "toc's own document");
  assert.deepEqual(rows(f).map((d) => d._id).sort(), ["other", "toc"]);
  assert.ok(!JSON.stringify(rows(f).find((d) => d._id === "toc")).includes("OTHER-TENANT-SECRET"));
});

test("a stored document whose nodes belong to another tenant is rejected and rebuilt", async () => {
  const f = setup();
  await f.deps.route("toc", "visa requirements for Germany", 3, far());
  await until(() => f.events.includes("written"), "the write");
  (rows(f)[0]!.docs as { node: { tenantId?: string } }[])[0]!.node.tenantId = "other"; // forged node
  f.events.length = 0;
  const loadsBefore = f.loads.length;
  await f.boot().route("toc", "visa requirements for Germany", 3, far());
  assert.ok(f.events.includes("persisted-invalid"));
  assert.equal(f.loads.length, loadsBefore + 1);
});

test("a document stored under the right _id but stamped for another tenant is not served", () => {
  const built = buildRouteIndex(syntheticTree({ tenantId: "toc" }), "toc", 1), stamp = { fingerprint: "b".repeat(64), treeRevision: null };
  const doc = routeIndexToDoc(built, "toc", stamp);
  assert.ok(routeIndexFromDoc(structuredClone(doc), "toc", stamp, 2));
  assert.equal(routeIndexFromDoc({ ...structuredClone(doc), tenantId: "other" }, "toc", stamp, 2), null);
  assert.equal(routeIndexFromDoc({ ...structuredClone(doc), _id: "other" }, "toc", stamp, 2), null);
  assert.equal(routeIndexFromDoc(structuredClone(doc), "other", stamp, 2), null);
});

test("a corrupt persisted document is rebuilt, not served and not fatal", async () => {
  const f = setup();
  await f.deps.route("toc", "visa requirements for Germany", 3, far());
  await until(() => f.events.includes("written"), "the write");
  (rows(f)[0]!.bm25 as { lens: number[] }).lens.pop();
  f.events.length = 0;
  const hits = await f.boot().route("toc", "visa requirements for Germany", 3, far());
  assert.ok(hits.length > 0);
  assert.ok(f.events.includes("persisted-invalid"));
});

test("a failing route_index read falls back to the in-memory build and still answers", async () => {
  const f = setup({ routeIndex: { read: "fail" } });
  const hits = await f.deps.route("toc", "visa requirements for Germany", 3, far());
  assert.equal(hits[0]?.sessionId, "s04");
  assert.deepEqual(f.loads, ["toc"]);
  assert.ok(f.events.includes("read-failed"));
});

test("a HANGING route_index read cannot hang the request: it is abandoned at half the budget and the build answers inside the deadline", async () => {
  const f = setup({ routeIndex: { read: "hang" } });
  const t0 = Date.now(), deadlineAt = t0 + 1500;
  const guard = sleep(1400).then((): never => { throw new Error("route() was still waiting on the hung route_index read at 1400 ms"); }); // fail by assertion, not by suite timeout
  const hits = await Promise.race([f.deps.route("toc", "visa requirements for Germany", 3, { deadlineAt }), guard]);
  const took = Date.now() - t0;
  assert.ok(hits.length > 0);
  assert.ok(took < 1500, `answered in ${took} ms, inside the 1500 ms deadline`);
  assert.ok(f.events.includes("read-failed"));
  assert.deepEqual(f.loads, ["toc"]);
});

test("a failing route_index WRITE never fails the request", async () => {
  const f = setup({ routeIndex: { write: "fail" } });
  const hits = await f.deps.route("toc", "visa requirements for Germany", 3, far());
  assert.ok(hits.length > 0);
  await until(() => f.events.includes("write-failed"), "the failed write to be reported");
});

test("a tenant without a tree is still no_tree, and nothing is written for it", async () => {
  const f = setup();
  await assert.rejects(f.deps.route("ghost", "visa", 3, far()), (e: Error) => e.message === "no_tree");
  await sleep(20);
  assert.equal(writes(f).length, 0);
});

test("the upsert is idempotent: persisting the same state twice leaves one equal document", async () => {
  const f = setup();
  await f.deps.route("toc", "visa requirements for Germany", 3, far());
  await until(() => f.events.includes("written"), "the first write");
  const strip = (d: Record<string, unknown>) => JSON.stringify({ ...d, builtAt: 0 });
  const first = strip(rows(f)[0]!);
  // force a second persist of the same state: a second cold process whose read misses (hang) but whose writes work
  f.faults.read = "hang";
  const again = f.boot();
  await again.route("toc", "visa requirements for Germany", 3, { deadlineAt: Date.now() + 800 });
  await until(() => writes(f).length === 2, "the second write");
  assert.equal(rows(f).length, 1);
  assert.equal(strip(rows(f)[0]!), first);
});

test("the in-memory layer stays the hot layer: a warm index touches neither route_index nor the tree", async () => {
  const f = setup();
  await f.deps.route("toc", "visa requirements for Germany", 3, far());
  await until(() => f.events.includes("written"), "the write");
  f.calls.length = 0;
  const loadsBefore = f.loads.length;
  await f.deps.route("toc", "IELTS requirement for UK masters", 3, far());
  assert.equal(f.calls.filter((c) => c.coll === "route_index" || c.coll === "tree_index").length, 0);
  assert.equal(f.loads.length, loadsBefore);
});

test("an expired in-memory index refreshes from the persisted one (cheap reads), not a tree rebuild", async () => {
  let clock = 1_000_000;
  const f = setup({}, { now: () => clock, indexTtlMs: 1000 });
  await f.deps.route("toc", "visa requirements for Germany", 3, { deadlineAt: clock + 60_000 });
  await until(() => f.events.includes("written"), "the write");
  const loadsBefore = f.loads.length;
  clock += 5000;
  await f.deps.route("toc", "visa requirements for Germany", 3, { deadlineAt: clock + 60_000 });
  await sleep(30);
  assert.equal(f.loads.length, loadsBefore, "the refresh did not rebuild from the tree");
});

test("persist:false disables the route_index store entirely (no reads, no writes)", async () => {
  const f = setup({}, { persist: false });
  await f.deps.route("toc", "visa requirements for Germany", 3, far());
  await sleep(20);
  assert.equal(f.calls.filter((c) => c.coll === "route_index").length, 0);
});

test("an oversize index is not written (BSON 16 MB cap) and the request is unaffected", async () => {
  const f = setup({}, { maxDocBytes: 100 });
  const hits = await f.deps.route("toc", "visa requirements for Germany", 3, far());
  assert.ok(hits.length > 0);
  await until(() => f.events.includes("skipped-oversize"), "the oversize skip");
  assert.equal(writes(f).length, 0);
});
