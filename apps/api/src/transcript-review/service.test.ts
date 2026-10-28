/**
 * T-054 service-level atomicity. HTTP calls on an in-memory Db run as one microtask chain and never truly interleave, so the
 * compare-and-set is pinned here with a store wrapper that yields a macrotask before every write: both writers then read the
 * same head before either writes, which is the real race window.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./memdb.testsupport.js";
import { seed, SESSION } from "./persist.testkit.js";
import { baseRevision, commitReview, loadReview, ReviewServiceError } from "./service.js";
import { createMongoReviewStore, type ReviewStore } from "./store.js";

const A0 = `tenant-A-${SESSION}-t0`;
const tick = () => new Promise<void>((r) => setImmediate(r));
function slowStore(m: ReturnType<typeof memoryDb>): ReviewStore {
  const s = createMongoReviewStore(m.db);
  return {
    ...s,
    head: async (t, id) => { const h = await s.head(t, id); await tick(); return h; },
    insertHead: async (t, h) => { await tick(); return s.insertHead(t, h); },
    replaceHead: async (t, e, n) => { await tick(); return s.replaceHead(t, e, n); },
  };
}
const input = (revision: string, text: string) => ({
  tenantId: "tenant-A", sessionId: SESSION, actorRef: "apikey:tenant-A", now: "2026-10-14T09:00:00.000Z",
  request: { expectedRevision: revision, reason: "Fix transcription error", corrections: [{ turnId: A0, text }] },
});

for (const later of [false, true]) {
  test(`racing writers (${later ? "replaceHead CAS" : "insertHead unique _id"}): exactly one commit, the loser gets a conflict, no lost update`, async () => {
    for (let round = 0; round < 20; round++) {
      const m = memoryDb();
      seed(m);
      const store = slowStore(m);
      let base = (await loadReview(store, "tenant-A", SESSION)).snapshot.revision;
      if (later) base = (await commitReview(store, input(base, "seed"))).revision;
      const out = await Promise.allSettled([commitReview(store, input(base, "one")), commitReview(store, input(base, "two"))]);
      const ok = out.filter((o) => o.status === "fulfilled");
      const bad = out.filter((o): o is PromiseRejectedResult => o.status === "rejected");
      assert.equal(ok.length, 1, `round ${round}: ${out.map((o) => o.status).join(",")}`);
      assert.ok(bad[0]!.reason instanceof ReviewServiceError && bad[0]!.reason.code === "conflict", `round ${round}`);
      assert.equal(m.rows("transcript_reviews").length, 1);
      const head = m.rows("transcript_reviews")[0] as { revision: string };
      assert.equal(head.revision, (ok[0] as PromiseFulfilledResult<{ revision: string }>).value.revision, "the stored head is the winner's");
    }
  });
}

test("revision of an untouched transcript changes when the source turns change; a committed head no longer depends on them", async () => {
  const m = memoryDb();
  seed(m);
  const store = createMongoReviewStore(m.db);
  const before = (await loadReview(store, "tenant-A", SESSION)).snapshot;
  assert.equal(before.revision, baseRevision("tenant-A", SESSION, before.turns));
  const receipt = await commitReview(store, input(before.revision, "kept"));
  (m.rows("turns").find((t) => t._id === A0) as { text: string }).text = "re-ingested text";
  const after = (await loadReview(store, "tenant-A", SESSION)).snapshot;
  assert.equal(after.revision, receipt.revision);
  assert.equal(after.turns[0]!.text, "kept", "the human correction survives a re-ingest of the same turn id");
});

test("an overlay entry for a turn that no longer exists is ignored, not an error", async () => {
  const m = memoryDb();
  seed(m);
  const store = createMongoReviewStore(m.db);
  const r0 = (await loadReview(store, "tenant-A", SESSION)).snapshot.revision;
  await commitReview(store, input(r0, "kept"));
  m.rows("turns").splice(m.rows("turns").findIndex((t) => t._id === A0), 1);
  const after = (await loadReview(store, "tenant-A", SESSION)).snapshot;
  assert.equal(after.turns.length, 3);
  assert.equal(after.turns.some((t) => t._id === A0), false);
});

for (const later of [false, true]) test(`snapshot/head re-read race (${later ? "reviewed" : "initial"}): stale writer cannot CAS a newer head`, async () => {
  const m = memoryDb(); seed(m);
  const original = createMongoReviewStore(m.db);
  let revision = (await loadReview(original, "tenant-A", SESSION)).snapshot.revision;
  if (later) revision = (await commitReview(original, input(revision, "seed"))).revision;
  let intercept = true;
  let winningRevision: string | undefined;
  const store: ReviewStore = { ...original, head: async (tenant, id) => {
    const captured = await original.head(tenant, id);
    if (intercept) { intercept = false; winningRevision = (await commitReview(original, input(revision, "winning correction"))).revision; }
    return captured;
  } };
  await assert.rejects(commitReview(store, input(revision, "stale overwrite")), (e: unknown) => e instanceof ReviewServiceError && e.code === "conflict");
  assert.equal((await loadReview(original, "tenant-A", SESSION)).snapshot.turns[0]!.text, "winning correction");
  const history = await original.listRevisions("tenant-A", SESSION);
  assert.equal(history.length, later ? 2 : 1);
  // Both fixture commits use the same reviewedAt, so history's hash tie-break is not
  // causal order. Check the competing receipt's actual audit row, not its list position.
  assert.ok(winningRevision);
  const winningAudit = history.find((row) => row.revision === winningRevision);
  assert.ok(winningAudit);
  assert.equal(winningAudit.parentRevision, revision);
  assert.equal(winningAudit.changes[0]!.after.text, "winning correction");
  assert.equal(history.some((row) => row.changes.some((change) => change.after.text === "stale overwrite")), false);
});
