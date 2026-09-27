/**
 * apps/api/src/vector-gap.test.ts — ISS-118. The DURABLE record that a session has no vectors.
 *
 * These tests exist because a `console.warn` was NOT a guarantee: the U1.0b checker disabled the
 * warn on BOTH ingest paths simultaneously and the entire 124-test suite stayed green. A surface
 * nothing asserts is one careless edit away from the silence that let three whole sessions sit
 * outside the vector index while every status field read "done".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexSession } from "./session.js";
import { recordVectorGap } from "./vector-gap.js";
import { fakeDb, completeWith, embedOk, assertUpdateBodyConfined, type Call } from "./testutils.js";

/* ── ISS-118: the DURABLE record of a missing vector index ────────────────────────────────────
 * U1.0b surfaced the skip in a return value and a console.warn. The checker then disabled BOTH
 * ingest paths' warns at once and the whole suite stayed green — so the operator-facing half was
 * unguarded. These tests pin the `gaps` row, which is the surface that actually survives the
 * process and is queryable via GET /gaps.
 */
const gapCalls = (calls: Call[]) => calls.filter((c) => c.coll === "gaps");

test("ISS-118: a session that gets NO vectors writes an OPEN vector-pending gap row", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", {
    complete: completeWith() as never,
    embed: async () => { throw new Error("all providers failed"); },
    db,
  });
  const g = gapCalls(calls);
  assert.equal(g.length, 1, "exactly one gap write");
  const set = (g[0]!.update as Record<string, Record<string, unknown>>).$set!;
  assert.equal(set.kind, "vector-pending");
  assert.equal(set.status, "open");
  assert.equal(set.sourceRef, "s1");
  assert.equal(set.tenantId, "t");
  assert.match(String(set.description), /no embedding vectors/);
});

test("ISS-118: the gap row is UPSERTED on a derived id, so a re-index cannot accumulate duplicates", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", {
    complete: completeWith() as never,
    embed: async () => { throw new Error("down"); },
    db,
  });
  const g = gapCalls(calls)[0]!;
  assert.equal(g.op, "updateOne", "must be an upsert, never an insert that can duplicate");
  assert.equal((g.filter as Record<string, unknown>)._id, "vector-pending:t:s1", "id derived from tenant AND session (ISS-121)");
  assert.deepEqual(g.options, { upsert: true });
});

test("ISS-118: a SUCCESSFUL run resolves a previous gap instead of leaving a stale open one", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, embed: embedOk as never, db });
  const g = gapCalls(calls);
  assert.equal(g.length, 1);
  const set = (g[0]!.update as Record<string, Record<string, unknown>>).$set!;
  assert.equal(set.status, "received", "the gap must be closed when vectors actually land");
  // and it must NOT upsert — a session that never failed must not gain a gap row at all.
  // (`scopedCollection.updateOne` normalises absent options to `{}`, so assert on the FLAG, which
  // is the actual guarantee, rather than on the options object being undefined.)
  assert.notEqual((g[0]!.options as Record<string, unknown> | undefined)?.upsert, true,
    "resolving must not create a gap row for a session that never failed");
  assert.equal((g[0]!.filter as Record<string, unknown>).status, "open", "only an OPEN gap is resolved");
});

test("ISS-118: the gap write is tenant-confined on both filter and body", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", {
    complete: completeWith() as never,
    embed: async () => { throw new Error("down"); },
    db,
  });
  const g = gapCalls(calls)[0]!;
  assertUpdateBodyConfined(g, "t");
});

/* ── ISS-121: the id must be tenant-namespaced, and bookkeeping must never strand a session ────
 * Found live by the U1.0c checker. `_id` was `vector-pending:<sessionId>` — globally unique while
 * the filter around it is tenant-merged — so a second tenant recording a gap for the SAME
 * sessionId got a duplicate-key error rather than its own row. Reachable, not theoretical:
 * whatsapp-store derives sessionId from a sha256 of (groupJid, ownerUserId) with no tenant in it.
 */
test("ISS-121: two tenants recording a gap for the same sessionId use DIFFERENT ids", async () => {
  const a = fakeDb();
  const b = fakeDb();
  const failing = async () => { throw new Error("down"); };
  await indexSession("tenant-a", "s1", { complete: completeWith() as never, embed: failing, db: a.db });
  await indexSession("tenant-b", "s1", { complete: completeWith() as never, embed: failing, db: b.db });
  const idA = (a.calls.find((c) => c.coll === "gaps")!.filter as Record<string, unknown>)._id;
  const idB = (b.calls.find((c) => c.coll === "gaps")!.filter as Record<string, unknown>)._id;
  assert.notEqual(idA, idB, "a globally-unique id makes the second tenant's write a duplicate-key error");
  assert.equal(idA, "vector-pending:tenant-a:s1");
  assert.equal(idB, "vector-pending:tenant-b:s1");
});

test("ISS-121: a FAILING gap write must not strand the session — the tree and status flip still run", async () => {
  // This is the half that actually bit. recordVectorGap runs BEFORE the tree_index update and the
  // status.index flip, so a throw left the session "pending" forever while ingest returned 201 —
  // a silent indexing failure created by the unit meant to END silent indexing failures.
  const { db, calls } = fakeDb();
  const exploding = {
    collection(name: string) {
      const real = (db as unknown as { collection: (n: string) => Record<string, unknown> }).collection(name);
      if (name !== "gaps") return real;
      return { ...real, updateOne: async () => { throw new Error("E11000 duplicate key"); } };
    },
  } as never;
  const res = await indexSession("t", "s1", {
    complete: completeWith() as never,
    embed: async () => { throw new Error("down"); },
    db: exploding,
  });
  assert.ok(calls.some((c) => c.coll === "tree_index"), "the tree must still be updated");
  const flip = calls.find((c) => c.coll === "sessions" && c.op === "updateOne");
  assert.ok(flip, "status.index must still be flipped — a stranded session is worse than a missing gap row");
  // ISS-122: the strand-prevention above is only half safe. Nothing distinguished THIS run (no
  // vectors AND a gap-write fault) from a normal "no vectors, gap recorded fine" run until this
  // field existed — `indexSession`'s return is the honest surface, threaded all the way from
  // `recordVectorGap`'s own catch.
  assert.equal(res.gapRecorded, false, "the caller must be able to see that the gap bookkeeping itself faulted");
});

/* ── ISS-122: recordVectorGap's own catch had no durable, testable surface ─────────────────────
 * ISS-118's fix made a missing-vectors session observable via a `gaps` row; ISS-121 made the
 * bookkeeping itself degrade-safe (never strand a session). But the bookkeeping's OWN failure was
 * still only a `console.warn` — exactly the surface ISS-118 proved is not a guarantee (the U1.0b
 * checker disabled that class of warn on both ingest paths at once and the suite stayed green).
 * These tests call `recordVectorGap` directly — the real seam, not `indexSession`'s aggregate
 * result — so a mutation that makes the return value lie (e.g. hard-coding `true`) is caught here
 * even if every higher-level assertion happens to still pass.
 */
test("ISS-122: recordVectorGap returns true when the OPEN gap-write lands", async () => {
  const { db } = fakeDb();
  const ok = await recordVectorGap("t", "s1", { written: 0, skipped: "embedding-failed" }, db);
  assert.equal(ok, true);
});

test("ISS-122: recordVectorGap returns true when the RESOLVED gap-write lands", async () => {
  const { db } = fakeDb();
  const ok = await recordVectorGap("t", "s1", { written: 3, skipped: null }, db);
  assert.equal(ok, true);
});

test("ISS-122: recordVectorGap returns false when the OPEN gap-write THROWS", async () => {
  const exploding = {
    collection: () => ({ updateOne: async () => { throw new Error("E11000 duplicate key"); } }),
  } as never;
  const ok = await recordVectorGap("t", "s1", { written: 0, skipped: "embedding-failed" }, exploding);
  assert.equal(ok, false);
});

test("ISS-122: recordVectorGap returns false when the RESOLVE gap-write THROWS", async () => {
  const exploding = {
    collection: () => ({ updateOne: async () => { throw new Error("network blip"); } }),
  } as never;
  const ok = await recordVectorGap("t", "s1", { written: 3, skipped: null }, exploding);
  assert.equal(ok, false);
});
