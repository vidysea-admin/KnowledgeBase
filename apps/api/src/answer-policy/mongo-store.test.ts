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
  const match = (r: Row, f: Row) => Object.entries(f).every(([k, v]) => r[k] === v);
  const dup = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  const collection = (name: string) => ({
    async createIndex(spec: Row, o: { unique?: boolean } = {}) { calls.push(`index:${name}`); if (o.unique) uniques.set(name, [...(uniques.get(name) ?? []), Object.keys(spec)]); },
    find: (f: Row) => { let out = rows(name).filter((r) => match(r, f)).map((r) => structuredClone(r));
      const cur = { sort(spec: Record<string, 1 | -1>) { out = out.sort((a, b) => { for (const [k, d] of Object.entries(spec)) { const x = a[k] as never, y = b[k] as never; if (x !== y) return (x < y ? -1 : 1) * d; } return 0; }); return cur; },
        toArray: async () => out }; return cur; },
    async findOne(f: Row) { await Promise.resolve(); const r = rows(name).find((x) => match(x, f)); return r ? structuredClone(r) : null; },
    async insertOne(doc: Row) {
      calls.push(`insert:${name}`); await Promise.resolve(); // yield so racing writers interleave their reads first
      if (rows(name).some((r) => r._id === doc._id || (uniques.get(name) ?? []).some((cols) => cols.every((c) => r[c] === doc[c])))) throw dup();
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
