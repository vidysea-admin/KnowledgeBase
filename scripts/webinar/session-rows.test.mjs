/**
 * scripts/webinar/session-rows.test.mjs — ISS-291 (safe swap, injected failing write) and
 * ISS-294 (derived session files). Runner: `node --test` (wired into package.json `test:lint`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceSessionRows, buildSessionFiles } from "./session-rows.mjs";

/** In-memory stand-in for a packages/db coll(tenantId) accessor: equality + `$ne` filters,
 * `$set` upserts. `failOnUpsert` makes the n-th upsert throw, like a network blip mid-loop. */
function fakeColl(rows, { failOnUpsert = -1 } = {}) {
  const store = new Map(rows.map((r) => [r._id, { ...r }]));
  let upserts = 0;
  const matches = (doc, filter) =>
    Object.entries(filter).every(([k, v]) =>
      v && typeof v === "object" && "$ne" in v ? doc[k] !== v.$ne : doc[k] === v);
  return {
    store,
    async updateOne(filter, update, options) {
      if (upserts++ === failOnUpsert) throw new Error("injected write failure");
      const cur = store.get(filter._id);
      if (!cur && !options?.upsert) return { matchedCount: 0 };
      store.set(filter._id, { ...(cur ?? { _id: filter._id }), ...update.$set });
      return { matchedCount: cur ? 1 : 0 };
    },
    async deleteMany(filter) {
      let n = 0;
      for (const [id, doc] of store) if (matches(doc, filter)) { store.delete(id); n++; }
      return { deletedCount: n };
    },
  };
}

const oldTurns = [1, 2, 3, 4].map((i) => ({ _id: `s-t00${i}`, sessionId: "s", text: `old ${i}`, syncGen: "g0" }));
const otherSession = { _id: "x-t001", sessionId: "x", text: "other session", syncGen: "g0" };
const newTurns = [1, 2, 3].map((i) => ({ _id: `s-t00${i}`, sessionId: "s", text: `new ${i}` }));

test("safe swap: a successful run replaces the session's rows and removes stale ones only", async () => {
  const c = fakeColl([...oldTurns, otherSession]);
  const res = await replaceSessionRows(c, { sessionId: "s" }, newTurns, "g1");
  assert.deepEqual(res, { upserted: 3, removedStale: 1 });
  assert.deepEqual([...c.store.values()].filter((d) => d.sessionId === "s").map((d) => d.text), ["new 1", "new 2", "new 3"]);
  assert.equal(c.store.get("x-t001").text, "other session", "another session's row must survive");
});

test("safe swap: an injected failing write mid-run deletes NOTHING — the session stays complete", async () => {
  const c = fakeColl([...oldTurns, otherSession], { failOnUpsert: 1 });
  await assert.rejects(replaceSessionRows(c, { sessionId: "s" }, newTurns, "g1"), /injected write failure/);
  const left = [...c.store.values()].filter((d) => d.sessionId === "s");
  assert.equal(left.length, 4, "all 4 rows of the session must still exist after a failed run");
  assert.deepEqual(left.map((d) => d.text), ["new 1", "old 2", "old 3", "old 4"]);
  // A re-run converges to exactly the new set.
  const c2 = fakeColl([...c.store.values()]);
  await replaceSessionRows(c2, { sessionId: "s" }, newTurns, "g2");
  assert.deepEqual([...c2.store.values()].filter((d) => d.sessionId === "s").map((d) => d.text), ["new 1", "new 2", "new 3"]);
});

test("session files are derived from the webinar's own meta/source/turns (ISS-294)", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "toc-migrated",
    "2026-09-24-zoho-next-european-study-destinations");
  const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const meta = load("meta.json");
  const turns = load("turns.json");
  const sessionDoc = { sourceId: load("source.json")._id, title: meta.title, date: meta.date, org: "o",
    status: { transcribe: "done", index: "pending" } };
  const f = buildSessionFiles({ sessionId: meta.sessionId, tenantId: "toc", sessionDoc, meta, turns });
  assert.equal(f.session._id, meta.sessionId);
  assert.equal(f.sessionPage.sessionId, meta.sessionId);
  const ids = new Set(turns.map((t) => t._id));
  assert.ok(f.sessionPage.evidence.length > 0);
  for (const e of f.sessionPage.evidence) assert.ok(ids.has(e.turnId), `evidence ${e.turnId} must be a real turn`);
  assert.deepEqual(f.claims, []);
  // The committed files on disk are exactly what the generator emits (no hand edits).
  assert.deepEqual(load("session_page.json").evidence, f.sessionPage.evidence);
});
