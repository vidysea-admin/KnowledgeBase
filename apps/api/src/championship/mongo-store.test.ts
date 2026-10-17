import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createChampionshipEvent, type ChampionshipEvent } from "./model.js";
import { freezeChampionship, addChampionshipTrial } from "./runtime.js";
import { createMongoChampionshipStore } from "./mongo-store.js";

const plan = { title: "Plan", questions: [{ id: "q", text: "Question?", source: { kind: "toc", reference: "turn:1" } }], counsellors: [{ id: "c", name: "Name", evidenceReference: "pending" }], judges: [], rubric: { version: "draft", reference: "pending" }, reviewReference: "pending" };
function fixture(ready = true) {
  const rows = new Map<string, ChampionshipEvent>(); const filters: unknown[] = []; let writes = 0;
  const collection = {
    options: async () => ready ? { validator: { $jsonSchema: { required: ["tenantId", "bankDigest"] } } } : {},
    listIndexes: () => ({ toArray: async () => [{ name: "championship_eval_once", unique: true, key: { tenantId: 1, "trials.evalRunId": 1 }, partialFilterExpression: { "trials.0": { $exists: true } } }] }),
    insertOne: async (row: ChampionshipEvent) => { rows.set(row._id, structuredClone(row)); writes++; },
    findOne: async (filter: {tenantId: string; _id: string; revision?: number}) => {
      filters.push(filter); const row = rows.get(filter._id);
      return row?.tenantId === filter.tenantId && (filter.revision === undefined || row.revision === filter.revision) ? structuredClone(row) : null;
    },
    replaceOne: async (filter: {tenantId: string; _id: string; revision: number}, row: ChampionshipEvent) => {
      const old = rows.get(filter._id); if (!old || old.tenantId !== filter.tenantId || old.revision !== filter.revision) return { modifiedCount: 0 };
      if ([...rows.values()].some(e => e._id !== row._id && e.tenantId === row.tenantId && e.trials.some(t => row.trials.some(n => n.evalRunId === t.evalRunId)))) throw Object.assign(new Error("duplicate"), { code: 11000 });
      rows.set(row._id, structuredClone(row)); writes++; return { modifiedCount: 1 };
    },
  };
  const db = { collection: () => collection } as unknown as Db;
  return { store: createMongoChampionshipStore(db, { verifyEvidence: async () => false }), rows, filters, writes: () => writes };
}
test("durable adapter refuses uninstalled schema before writes", async () => {
  const f = fixture(false), e = createChampionshipEvent("a", plan, "2026-10-14T00:00:00Z");
  await assert.rejects(f.store.create("a", e), /migration must be installed/); assert.equal(f.writes(), 0);
});
test("Mongo seam reloads copies and atomic tenant revision filter refuses mutation of fixed plans", async () => {
  const f = fixture(), e = createChampionshipEvent("a", plan, "2026-10-14T00:00:00Z"); await f.store.create("a", e);
  assert.equal(await f.store.get("b", e._id), null); const copy = await f.store.get("a", e._id); copy!.title = "mutated";
  assert.equal((await f.store.get("a", e._id))!.title, "Plan");
  const frozen = freezeChampionship(e, e.bankDigest, "2026-10-14T00:01:00Z"); assert.equal(await f.store.replace("a", e._id, 0, frozen), true);
  assert.equal(await f.store.replace("a", e._id, 0, frozen), false);
  await assert.rejects(f.store.replace("a", e._id, 1, { ...frozen, revision: 2, title: "changed" }));
  assert.ok(f.filters.every(filter => typeof (filter as {tenantId: unknown}).tenantId === "string"));
});
test("unique eval association duplicate-key is a conflict across distinct event snapshots", async () => {
  const f = fixture();
  for (let n = 0; n < 2; n++) {
    const e = createChampionshipEvent("a", plan, "2026-10-14T00:00:00Z"); await f.store.create("a", e);
    const frozen = freezeChampionship(e, e.bankDigest, "2026-10-14T00:01:00Z"); await f.store.replace("a", e._id, 0, frozen);
    const trial = addChampionshipTrial(frozen, "q", "c", { _id: "shared-run", tenantId: "a", question: "Question?", counsellor: { name: "Name" }, aiAnswer: { text: "AI" }, counsellorAnswer: { text: "Human" },
      score: { ai: 4, counsellor: 3 }, credibility: "internal", createdAt: "2026-10-14T00:02:00Z" }, "2026-10-14T00:03:00Z");
    assert.equal(await f.store.replace("a", e._id, 1, trial), n === 0);
  }
});
test("store refuses construction without the composed verifier (no bare default)", () => {
  const db = { collection: () => ({}) } as unknown as Db;
  assert.throws(() => createMongoChampionshipStore(db, undefined as never), /composed evidence verifier/);
  assert.throws(() => createMongoChampionshipStore(db, {} as never), /composed evidence verifier/);
});
