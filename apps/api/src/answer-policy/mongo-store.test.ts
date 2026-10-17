// Uses a small stateful in-memory `Db` (same approach as packages/db speaker-suggestions.testdb.ts): no real MongoDB, no network.
// The fake does NOT add tenant scoping or version checks; the real store code has to supply them.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoAnswerPolicyStore, ensureAnswerPolicyIndexes, REVISIONS, ITEMS } from "./mongo-store.js";
import { createAnswerPolicyService, PolicyServiceError } from "./service.js";

type Row = Record<string, unknown>;
function fakeDb(databaseName = "lkb_t056_test") {
  const data = new Map<string, Row[]>(); const uniques = new Map<string, string[][]>(); const calls: string[] = [];
  const rows = (n: string) => { let r = data.get(n); if (!r) { r = []; data.set(n, r); } return r; };
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const match = (r: Row, f: Row) => Object.entries(f).every(([k, v]) => same(r[k], v));
  const dup = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  const collection = (name: string) => ({
    async createIndex(spec: Row, o: { unique?: boolean } = {}) { calls.push(`index:${name}`); if (o.unique) uniques.set(name, [...(uniques.get(name) ?? []), Object.keys(spec)]); },
    find: (f: Row) => { let out = rows(name).filter((r) => match(r, f)).map((r) => structuredClone(r));
      const cur = { sort(spec: Record<string, 1 | -1>) { out = out.sort((a, b) => { for (const [k, d] of Object.entries(spec)) { const x = a[k] as never, y = b[k] as never; if (x !== y) return (x < y ? -1 : 1) * d; } return 0; }); return cur; },
        toArray: async () => out }; return cur; },
    async findOne(f: Row) { await Promise.resolve(); const r = rows(name).find((x) => match(x, f)); return r ? structuredClone(r) : null; },
    async insertOne(doc: Row) {
      calls.push(`insert:${name}`); await Promise.resolve(); // yield so racing writers interleave their reads first
      if (rows(name).some((r) => same(r._id, doc._id) || (uniques.get(name) ?? []).some((cols) => cols.every((c) => r[c] === doc[c])))) throw dup();
      rows(name).push(structuredClone(doc)); return { acknowledged: true };
    },
    async updateOne(f: Row, u: { $set: Row }) {
      calls.push(`update:${name}`); await Promise.resolve();
      const hit = rows(name).find((r) => match(r, f)); if (!hit) return { matchedCount: 0 };
      Object.assign(hit, structuredClone(u.$set)); return { matchedCount: 1 };
    },
  });
  return { db: { databaseName, collection } as unknown as Db, rows, calls };
}
const A = { actor: "api-key:tenant-a" }, B = { actor: "api-key:tenant-b" };
const body = (o: Record<string, unknown> = {}) => ({ questionClass: "fees", mode: "internal-only", style: "concise", onInsufficient: "review", note: "init", ...o });
const mk = (f = fakeDb()) => { const svc = createAnswerPolicyService(createMongoAnswerPolicyStore(f.db)); return { f, svc }; };

test("two concurrent updates with the same expected version: exactly one wins, history stays contiguous", async () => {
  const { f, svc } = mk(); await ensureAnswerPolicyIndexes(f.db);
  await svc.save("tenant-a", "p1", body(), A);
  for (let round = 0; round < 15; round++) {
    const v = (await svc.history("tenant-a", "p1")).length;
    const r = await Promise.allSettled([1, 2, 3, 4].map((i) => svc.save("tenant-a", "p1", body({ expectedVersion: v, note: `r${round}-${i}` }), A)));
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1, `round ${round}`);
    for (const x of r) if (x.status === "rejected") assert.ok(x.reason instanceof PolicyServiceError && x.reason.code === "version_conflict");
  }
  assert.deepEqual((await svc.history("tenant-a", "p1")).map((h) => h.version), Array.from({ length: 16 }, (_, i) => i + 1));
});
test("the winner is decided by the data, not by indexes: it holds with no indexes created", async () => {
  const { svc } = mk();
  await svc.save("tenant-a", "p1", body(), A);
  const r = await Promise.allSettled([1, 2, 3].map((i) => svc.save("tenant-a", "p1", body({ expectedVersion: 1, note: `n${i}` }), A)));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
});
test("restart: a new store and service over the same database reload policies, history, conflicts and queue", async () => {
  const f = fakeDb(); const first = createAnswerPolicyService(createMongoAnswerPolicyStore(f.db));
  await first.save("tenant-a", "p1", body({ claimedBy: "Priya" }), A);
  await first.save("tenant-a", "p2", body({ mode: "internal-and-web" }), A);
  await first.save("tenant-a", "p1", body({ style: "detailed", expectedVersion: 1, note: "longer" }), A);
  const second = createAnswerPolicyService(createMongoAnswerPolicyStore(f.db));
  assert.deepEqual((await second.list("tenant-a")).map((p) => [p.policyId, p.version]), [["p1", 2], ["p2", 1]]);
  const hist = await second.history("tenant-a", "p1");
  assert.deepEqual(hist.map((h) => h.note), ["init", "longer"]); assert.equal(hist[0]!.changedBy.claimedBy, "Priya");
  assert.equal((await second.conflicts("tenant-a")).length, 2);
  const open = await second.queue("tenant-a", "open"); assert.ok(open.length >= 4);
  assert.equal((await second.resolve("tenant-a", open.find((i) => i.kind === "change")!.id, { decision: "approved", note: "ok" }, A)).status, "approved");
  assert.equal((await second.save("tenant-a", "p1", body({ expectedVersion: 2, note: "again" }), A)).revision.version, 3, "versions continue after restart");
  assert.equal((await createAnswerPolicyService(createMongoAnswerPolicyStore(f.db)).queue("tenant-a", "approved")).length, 1);
});
test("cross-tenant: reads return nothing, same policy id is independent, resolve and retire cannot reach another tenant", async () => {
  const { f, svc } = mk();
  await svc.save("tenant-a", "shared", body(), A);
  await svc.save("tenant-a", "p2", body({ mode: "internal-and-web" }), A);
  const a = await svc.queue("tenant-a");
  assert.deepEqual(await svc.list("tenant-b"), []); assert.deepEqual(await svc.history("tenant-b", "shared"), []);
  assert.deepEqual(await svc.conflicts("tenant-b"), []); assert.deepEqual(await svc.queue("tenant-b"), []);
  for (const item of a) await assert.rejects(svc.resolve("tenant-b", item.id, { decision: item.kind === "change" ? "approved" : "dismissed", note: "x" }, B), (e) => (e as PolicyServiceError).code === "not_found");
  await assert.rejects(svc.retire("tenant-b", "p2", { note: "x", expectedVersion: 1 }, B), (e) => (e as PolicyServiceError).code === "not_found");
  assert.equal((await svc.save("tenant-b", "shared", body({ style: "detailed" }), B)).revision.version, 1);
  assert.equal((await svc.history("tenant-a", "shared"))[0]!.style, "concise");
  assert.ok(f.rows(REVISIONS).every((r) => typeof r.tenantId === "string"));
  assert.equal((await svc.queue("tenant-a", "open")).length, a.length, "tenant A's items untouched by B's attempts");
  const store = createMongoAnswerPolicyStore(f.db);
  await assert.rejects(store.latest(undefined as unknown as string), /tenantId is required/);
  await assert.rejects(store.history("", "shared"), /tenantId is required/);
  await assert.rejects(store.history({ $ne: null } as unknown as string, "shared"), /tenantId is required/);
  await assert.rejects(store.appendRevision("tenant-b", (await svc.history("tenant-a", "shared"))[0]!, 0), /tenant mismatch/);
});
test("history is append-only (revisions are only ever inserted) and items close once", async () => {
  const { f, svc } = mk();
  await svc.save("tenant-a", "p1", body(), A);
  await svc.save("tenant-a", "p1", body({ expectedVersion: 1, style: "detailed" }), A);
  await svc.retire("tenant-a", "p1", { note: "bye", expectedVersion: 2 }, A);
  assert.equal(f.calls.filter((c) => c === `update:${REVISIONS}`).length, 0);
  assert.equal(f.rows(REVISIONS).length, 3);
  const item = (await svc.queue("tenant-a", "open"))[0]!;
  const race = await Promise.allSettled([1, 2].map(() => svc.resolve("tenant-a", item.id, { decision: item.kind === "change" ? "approved" : "dismissed", note: "n" }, A)));
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.ok(f.rows(ITEMS).every((r) => r.tenantId === "tenant-a"));
});
test("concurrent saves of two policies do not duplicate the same conflict item", async () => {
  const { svc } = mk();
  await Promise.all([svc.save("tenant-a", "p1", body(), A), svc.save("tenant-a", "p2", body({ mode: "internal-and-web" }), A)]);
  const keys = (await svc.queue("tenant-a")).filter((i) => i.kind === "conflict").map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});
test("database guard: protected and unsafe names are refused unless explicitly production", () => {
  for (const name of ["lkb", "LKB", "global_university_db", "lkb_staging", ""]) assert.throws(() => createMongoAnswerPolicyStore(fakeDb(name).db), /refuses database/);
  assert.doesNotThrow(() => createMongoAnswerPolicyStore(fakeDb("lkb_t056_test").db));
  assert.doesNotThrow(() => createMongoAnswerPolicyStore(fakeDb("lkb").db, { production: true }));
});
test("ensureAnswerPolicyIndexes creates tenant-leading unique indexes", async () => {
  const f = fakeDb(); await ensureAnswerPolicyIndexes(f.db);
  assert.deepEqual(f.calls, [`index:${REVISIONS}`, `index:${ITEMS}`, `index:${ITEMS}`]);
});

// ---- fix cycle 1 ----
import { createInMemoryAnswerPolicyStore, type AnswerPolicyStore } from "./store.js";
import type { PolicyRevision, ReviewItem } from "./types.js";
const rev = (tenantId: string, policyId: string, version: number, over: Partial<PolicyRevision> = {}): PolicyRevision => ({ tenantId, policyId, version, action: "save", retired: false,
  questionClass: "fees", mode: "internal-only", style: "concise", onInsufficient: "review", citations: "required", changedBy: { actor: "x" }, changedAt: "2026-10-14T00:00:00.000Z", note: "n", previousVersion: version > 1 ? version - 1 : null, ...over });
const item = (tenantId: string, key: string): ReviewItem => ({ id: "i", tenantId, kind: "change", status: "open", createdAt: "2026-10-14T00:00:00.000Z", key, summary: "s" });
const stores: [string, () => AnswerPolicyStore][] = [["mongo", () => createMongoAnswerPolicyStore(fakeDb().db)], ["in-memory", () => createInMemoryAnswerPolicyStore()]];

test("ISS-001: delimiter-bearing tenant ids cannot collide with, or be denied by, another tenant's rows", async () => {
  const f = fakeDb(); const store = createMongoAnswerPolicyStore(f.db); const svc = createAnswerPolicyService(store);
  assert.equal(await store.appendRevision("t|a", rev("t|a", "1", 1), 0), true);
  // checker reproduction: tenant "t" + policy "a|1" is now rejected as an invalid id (not a false version_conflict)
  await assert.rejects(store.appendRevision("t", rev("t", "a|1", 1), 0), /invalid policy id/);
  await assert.rejects(svc.save("t", "a|1", body(), A), (e) => (e as PolicyServiceError).code === "invalid_policy");
  // and every VALID neighbour of the old ambiguous encoding writes independently
  for (const [t, p] of [["t", "a-1"], ["t|a|1", "1"], ["t|a", "1b"], ["t", "1"]] as const) assert.equal(await store.appendRevision(t, rev(t, p, 1), 0), true, `${t}/${p}`);
  assert.equal((await store.history("t|a", "1")).length, 1); assert.deepEqual(await store.history("t", "a"), []);
  assert.equal((await svc.save("t|a", "pol", body(), A)).revision.version, 1);
  assert.deepEqual((await svc.list("t")).map((p) => p.policyId), ["1", "a-1"]);
  await assert.rejects(svc.history("t", "a|1"), (e) => (e as PolicyServiceError).code === "invalid_policy");
  await assert.rejects(svc.list(" bad"), (e) => (e as PolicyServiceError).code === "invalid_policy");
  assert.ok(f.rows(REVISIONS).every((r) => typeof r._id === "object" && (r._id as Row).tenantId === r.tenantId));
});
test("ISS-002: a crash between the revision write and the change-item write is repaired from history", async () => {
  const f = fakeDb(); const real = createMongoAnswerPolicyStore(f.db); let crash = true;
  const flaky: AnswerPolicyStore = { ...real, addItemIfAbsent: async (t, i) => { if (crash && i.kind === "change") { crash = false; throw new Error("simulated crash"); } return real.addItemIfAbsent(t, i); } };
  const svc = createAnswerPolicyService(flaky);
  await assert.rejects(svc.save("tenant-a", "p1", body(), A), /simulated crash/);
  assert.equal((await real.history("tenant-a", "p1")).length, 1, "revision persisted");
  assert.equal((await real.items("tenant-a")).length, 0, "item missing right after the crash");
  const q = await createAnswerPolicyService(real).queue("tenant-a");
  assert.deepEqual(q.map((i) => [i.kind, i.key, i.change?.changedFields]), [["change", "p1@1", ["created"]]]);
  assert.equal((await createAnswerPolicyService(real).queue("tenant-a")).length, 1, "repair is idempotent");
  await createAnswerPolicyService(real).save("tenant-a", "p1", body({ expectedVersion: 1, style: "detailed", note: "v2" }), A);
  assert.deepEqual((await createAnswerPolicyService(real).queue("tenant-a")).map((i) => i.key).sort(), ["p1@1", "p1@2"]);
  const done = (await createAnswerPolicyService(real).queue("tenant-a"))[0]!;
  await createAnswerPolicyService(real).resolve("tenant-a", done.id, { decision: "approved", note: "ok" }, A);
  assert.equal((await createAnswerPolicyService(real).queue("tenant-a", "approved")).length, 1, "repair does not reopen a resolved item");
});
for (const [name, make] of stores) {
  test(`ISS-003 (${name}): closeItem cannot cross tenants; appendRevision refuses version gaps`, async () => {
    const store = make();
    const { item: a } = await store.addItemIfAbsent("tenant-a", item("tenant-a", "k"));
    const foreign: ReviewItem = { ...a, tenantId: "tenant-b", status: "approved", resolution: { decision: "approved", note: "steal", by: { actor: "b" }, at: "t" } };
    assert.equal(await store.closeItem("tenant-b", a.id, foreign), false, "M1: tenant B cannot close tenant A's item");
    assert.equal((await store.getItem("tenant-a", a.id))?.status, "open");
    assert.equal(await store.getItem("tenant-b", a.id), null);
    assert.equal(await store.closeItem("tenant-a", a.id, { ...a, status: "dismissed" }), true);
    assert.equal(await store.appendRevision("tenant-a", rev("tenant-a", "p", 1), 0), true);
    assert.equal(await store.appendRevision("tenant-a", rev("tenant-a", "p", 3), 1), false, "M9: v1 then v3 refused (version != expected+1)");
    assert.equal(await store.appendRevision("tenant-a", rev("tenant-a", "p", 3), 2), false, "M8: expected 2 refused while v2 does not exist");
    assert.equal(await store.appendRevision("tenant-a", rev("tenant-a", "p", 2), 1), true);
    assert.equal(await store.appendRevision("tenant-a", rev("tenant-a", "p", 2), 1), false, "duplicate version refused");
    assert.deepEqual((await store.history("tenant-a", "p")).map((r) => r.version), [1, 2]);
  });
}
