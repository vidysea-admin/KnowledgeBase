/**
 * apps/api/src/indexing.test.ts — the WRITE decisions of `indexSession`, with an injected fake db.
 *
 * Exists because of ISS-056 and, more pointedly, because the first attempt at fixing it was
 * untestable: the guard sat behind a module-singleton `getDb()`, so reverting it left every test
 * green. That is the fourth time in this project a guard has shipped with nothing pinning it, so
 * the db became injectable rather than the gap being disclosed again.
 *
 * The bug being pinned: the claims `deleteMany` was UNCONDITIONAL while the `insertMany` was
 * conditional, and a failed provider call returned an empty array indistinguishable from "this
 * transcript has no claims". So a transient outage during a re-index deleted every previously
 * extracted real claim for that session and wrote nothing back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { indexSession, writeSessionChunks } from "./session.js";
import { fakeDb, completeWith, embedOk, assertUpdateBodyConfined, type Call } from "./testutils.js";

const claimOps = (calls: Call[]) => calls.filter((c) => c.coll === "claims").map((c) => c.op);

test("a DEGRADED claims extraction must NOT delete the session's existing claims", async () => {
  // The regression that matters: before the fix this deleted everything and inserted nothing.
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith({ claimsFails: true }) as never, db });
  assert.deepEqual(claimOps(calls), [], "no claims write of any kind may happen on a degraded run");
});

test("a SUCCESSFUL extraction still replaces the session's claims (delete then insert)", async () => {
  // The other half — a guard that never lets claims be replaced would be just as broken, because
  // stale claims would then live forever.
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, db });
  const ops = claimOps(calls);
  assert.ok(ops.includes("deleteMany"), "a real extraction must replace the prior claims");
  assert.equal(ops[0], "deleteMany", "delete must precede insert so re-indexing never duplicates");
});

/**
 * Asserts EVERY call `indexSession` issued is confined to `tenantId` — both the read/delete side
 * (the filter) and the write side (the inserted documents). ISS-061: the first version of this
 * check only looked at `call.filter` and skipped every call with none, which is exactly how
 * inserts are shaped — `insertOne`/`insertMany` carry documents, not a filter. A raw, untenanted
 * `insertOne` added anywhere inside `indexSession` passed the whole suite and typechecked clean
 * under that version. Checking documents closes the exact gap the checker demonstrated live.
 */
function assertAllCallsConfined(calls: Call[], tenantId: string) {
  for (const call of calls) {
    if (call.coll === "tree_index") {
      // ISS-062: tree_index's root document now carries a REAL tenantId field, so
      // treeIndexRootFilter's returned filter — and the document indexing.ts writes via
      // replaceOne — are both checked on tenantId too now, not just the node_id prefix
      // (contract criterion 3a's convention, kept as defense-in-depth for pre-migration rows).
      if (call.filter) {
        assert.equal(call.filter.node_id, `tenant:${tenantId}`, `${call.coll}.${call.op} must target this tenant's root node`);
        assert.equal(call.filter.tenantId, tenantId, `${call.coll}.${call.op}'s filter must match on the real tenantId field too (ISS-062)`);
      }
      for (const doc of call.docs ?? []) {
        assert.equal(doc.tenantId, tenantId, `${call.coll}.${call.op} wrote a root document with no real tenantId field (ISS-062)`);
      }
      continue;
    }
    if (call.filter) {
      assert.equal(call.filter.tenantId, tenantId, `${call.coll}.${call.op} issued a query with no tenantId — it can reach another tenant's rows`);
    }
    for (const doc of call.docs ?? []) {
      assert.equal(doc.tenantId, tenantId, `${call.coll}.${call.op} wrote a document with no tenantId — it can be written into another tenant's data (ISS-061)`);
    }
    if (call.update) assertUpdateBodyConfined(call, tenantId);
  }
}

test("EVERY query AND every write indexSession issues is confined to its own tenant (ISS-060, ISS-061)", async () => {
  // The checker's unlisted mutation: drop `tenantId` from the claims deleteMany. It survived the
  // whole suite and typecheck, and live it took TWO scratch tenants from 1 -> 0 — one of them a
  // tenant that had nothing to do with the re-index. Op names alone could never catch it.
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, db });

  const writes = calls.filter((c) => ["deleteMany", "insertMany", "insertOne", "replaceOne", "updateOne"].includes(c.op));
  assert.ok(writes.length >= 4, `expected the real write set, got ${writes.length}`);
  const inserts = calls.filter((c) => c.op === "insertOne" || c.op === "insertMany");
  assert.ok(inserts.some((c) => (c.docs?.length ?? 0) > 0), "a healthy run must actually insert at least one document — otherwise this test checks nothing on the write side");

  assertAllCallsConfined(calls, "t");
});

test("a DEGRADED run's writes are tenant-scoped too — the guard must not be a bypass", async () => {
  // The degraded path takes a different branch through the same function; scoping it only on the
  // healthy path would leave the exact conditions of the ISS-056 outage unprotected.
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith({ claimsFails: true }) as never, db });
  assertAllCallsConfined(calls, "t");
});

test("session_pages are still written on a degraded CLAIMS run — the two paths are independent", async () => {
  // summarize degrades to its own labelled fallback, so the page must still be produced; a claims
  // failure must not silently take the summary down with it.
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith({ claimsFails: true }) as never, db });
  const pageOps = calls.filter((c) => c.coll === "session_pages").map((c) => c.op);
  assert.ok(pageOps.includes("deleteMany"), "session_pages should still be replaced");
});

const pageOps = (calls: Call[]) => calls.filter((c) => c.coll === "session_pages").map((c) => c.op);

// indexSession always ends with `sessionPagesColl(tenantId).find({}).toArray()` (feeding the
// tree_index rebuild), so every op sequence below ends in a trailing "find" regardless of branch.

test("a DEGRADED summarize run with NO existing page still writes the labelled fallback (ISS-059)", async () => {
  // The fallback is a legitimate FIRST summary — this is the case criterion 1 still requires.
  const { db, calls } = fakeDb({ existingSessionPage: null });
  await indexSession("t", "s1", { complete: completeWith({ summarizeFails: true }) as never, db });
  assert.deepEqual(pageOps(calls), ["findOne", "deleteMany", "insertOne", "find"], "no existing page -> the fallback is written as normal");
});

test("a DEGRADED summarize run with a REAL existing page must NOT touch it (ISS-059, criterion 1a)", async () => {
  // The exact bug this unit fixes: before the fix, a transient outage during a re-index silently
  // replaced a good summary with a 500-char transcript slice, and status.index still flipped to
  // "done" as if nothing had gone wrong.
  const existing = { _id: "p1", tenantId: "t", sessionId: "s1", summary: "A real, previously-written summary." };
  const { db, calls } = fakeDb({ existingSessionPage: existing });
  await indexSession("t", "s1", { complete: completeWith({ summarizeFails: true }) as never, db });
  assert.deepEqual(pageOps(calls), ["findOne", "find"], "a degraded run with a real page on file must issue NO WRITE of any kind to session_pages");
});

test("a SUCCESSFUL summarize run always replaces the page, even when one already exists", async () => {
  // The other half — a guard that refuses to replace ANY existing page would be just as broken,
  // because a genuinely fresh, correct summary could never supersede an older one.
  const existing = { _id: "p1", tenantId: "t", sessionId: "s1", summary: "An older summary." };
  const { db, calls } = fakeDb({ existingSessionPage: existing });
  await indexSession("t", "s1", { complete: completeWith() as never, db });
  // A non-degraded run never calls findOne on session_pages (only the degraded branch does).
  assert.deepEqual(pageOps(calls), ["deleteMany", "insertOne", "find"]);
});

test("a DEGRADED SUMMARIZE run does not take the claims write down with it — the two paths are independent", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith({ summarizeFails: true }) as never, db });
  // WRITES only, deliberately. U2.1's entity promotion issues a `find` over this session's claims
  // to tag `topicRefs`, and this assertion previously compared the full op list, so a read made it
  // fail. The test's own name and purpose are about the claims WRITE surviving a summarize outage
  // — and a read cannot destroy data, which is the property the ISS-056 family of tests exists to
  // protect. Narrowed to writes rather than appending "find" to the expected list, so the
  // assertion keeps meaning the same thing if the reads around it change again.
  const WRITE_OPS = new Set(["deleteMany", "insertMany", "insertOne", "updateOne", "replaceOne"]);
  const claimWrites = calls.filter((c) => c.coll === "claims" && WRITE_OPS.has(c.op)).map((c) => c.op);
  assert.deepEqual(claimWrites, ["deleteMany", "insertMany"], "a summarize outage must not affect the claims write");
});

/* ─────────────────────────────── U1.3 — chunks + embeddings ───────────────────────────────
 * The claims tests above exist because an unconditional delete + a conditional insert destroyed
 * real data on a transient outage (ISS-056). Chunks carry the SAME shape with more force: a
 * vector index is expensive to rebuild and its absence is invisible — a search just quietly
 * returns less. So the delete must never run without a replacement in hand.
 */
const chunkOps = (calls: Call[]) => calls.filter((c) => c.coll === "chunks").map((c) => c.op);
test("a FAILED embed must NOT delete the session's existing chunks (the ISS-056 shape)", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", {
    complete: completeWith() as never,
    embed: async () => { throw new Error("all providers failed"); },
    db,
  });
  assert.deepEqual(chunkOps(calls), [], "no chunk write of any kind may happen when embedding failed");
});

test("a failed embed does not take the rest of indexing down with it", async () => {
  // Rethrowing would turn "no vectors this run" into "no summary, no claims, no tree" — trading a
  // recoverable gap for a total one.
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", {
    complete: completeWith() as never,
    embed: async () => { throw new Error("all providers failed"); },
    db,
  });
  assert.ok(calls.some((c) => c.coll === "claims" && c.op === "insertMany"), "claims should still be written");
  assert.ok(calls.some((c) => c.coll === "tree_index"), "the tree should still be updated");
});

test("no embed dep at all leaves chunks completely untouched — an install without embeddings still indexes", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, db });
  assert.deepEqual(chunkOps(calls), []);
  assert.ok(calls.some((c) => c.coll === "session_pages"), "every other stage must still run");
});

test("a SUCCESSFUL embed replaces the session's chunks — delete BEFORE insert, so re-indexing never doubles the corpus", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, embed: embedOk as never, db });
  const ops = chunkOps(calls);
  assert.ok(ops.includes("deleteMany") && ops.includes("insertMany"));
  assert.equal(ops[0], "deleteMany", "delete must precede insert");
});

/* ── U1.0 — writeSessionChunks' RETURN CONTRACT ────────────────────────────────────────────────
 * `writeSessionChunks` deliberately never throws (a chunk failure must not take indexing down),
 * which means a caller cannot learn what happened from control flow. The backfill script's whole
 * honesty rests on the returned `{written, skipped}`: it exits non-zero and names the sessions
 * that got no chunks. If `skipped` were ever null on a failure, a partial backfill would report
 * itself complete — the same class of silent-success bug as ISS-056, one layer up.
 */
const REAL_TURNS = [{ _id: "t1", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "A real sentence." }];

/* ── ISS-116's second defect: indexSession used to DISCARD the chunk result ───────────────────
 * The batch-limit bug was the cause; this was the concealment. `indexSession` resolved,
 * `status.index` flipped to "done", and a session with zero vectors looked identical to a fully
 * indexed one. Three whole sessions (37% of the corpus) stayed out of the index that way.
 */
test("indexSession SURFACES an embedding failure in its return — a skip must not look like success", async () => {
  const { db } = fakeDb();
  const res = await indexSession("t", "s1", {
    complete: completeWith() as never,
    embed: async () => { throw new Error("all providers failed"); },
    db,
  });
  assert.equal(res.chunks.skipped, "embedding-failed", "the caller must be able to SEE it got no vectors");
  assert.equal(res.chunks.written, 0);
  assert.equal(res.sessionId, "s1");
});

test("indexSession reports 'no-embedder' distinctly from a failure — an install without embeddings is not broken", async () => {
  const { db } = fakeDb();
  const res = await indexSession("t", "s1", { complete: completeWith() as never, db });
  assert.equal(res.chunks.skipped, "no-embedder");
});

test("indexSession reports a real chunk write, so success is positively evidenced and not merely un-thrown", async () => {
  const { db } = fakeDb();
  const res = await indexSession("t", "s1", { complete: completeWith() as never, embed: embedOk as never, db });
  assert.equal(res.chunks.skipped, null);
  assert.ok(res.chunks.written > 0, "a successful run must report the rows it actually wrote");
});

test("writeSessionChunks reports a provider failure as skipped, never as a silent success", async () => {
  const { db, calls } = fakeDb();
  const res = await writeSessionChunks("t", "s1", REAL_TURNS as never, async () => { throw new Error("all providers failed"); }, db);
  assert.equal(res.written, 0);
  assert.equal(res.skipped, "embedding-failed", "a caller must be able to SEE the failure in the return value");
  assert.deepEqual(chunkOps(calls), [], "and still no destructive write");
});

test("writeSessionChunks reports a contradictory batch (the ISS-112 assertion) as skipped, not as success", async () => {
  // dims says 99, the vector holds 3 — the correlation JSON Schema cannot express. It must be
  // caught, reported, and must NOT delete the existing chunks.
  const { db, calls } = fakeDb();
  const res = await writeSessionChunks(
    "t", "s1", REAL_TURNS as never,
    (async (job: { texts: string[] }) => ({ vectors: job.texts.map(() => [0.1, 0.2, 0.3]), dims: 99, provider: "fake", model: "fake-embed" })) as never,
    db,
  );
  assert.equal(res.skipped, "embedding-failed");
  assert.deepEqual(chunkOps(calls), [], "a contradictory batch must never reach the delete");
});

test("writeSessionChunks reports a real write with the count it actually inserted", async () => {
  const { db, calls } = fakeDb();
  const res = await writeSessionChunks("t", "s1", REAL_TURNS as never, embedOk as never, db);
  assert.equal(res.skipped, null);
  const insert = calls.find((c) => c.coll === "chunks" && c.op === "insertMany");
  assert.equal(res.written, insert!.docs!.length, "the reported count must equal the rows actually inserted");
  assert.ok(res.written > 0);
});

test("writeSessionChunks reports a session with no chunkable turns distinctly from a failure", async () => {
  // The backfill must not report an empty session as a provider outage — they need different
  // human responses (one is fine, the other means re-run).
  const { db } = fakeDb();
  const res = await writeSessionChunks("t", "s1", [] as never, embedOk as never, db);
  assert.equal(res.written, 0);
  assert.equal(res.skipped, "no-chunkable-turns");
});

test("chunk rows carry a real vector, a matching dims, and turnRefs — never an embeddingRef pointer", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, embed: embedOk as never, db });
  const insert = calls.find((c) => c.coll === "chunks" && c.op === "insertMany");
  assert.ok(insert, "chunks should be inserted");
  for (const doc of insert!.docs ?? []) {
    assert.ok(Array.isArray(doc.vector) && (doc.vector as number[]).length > 0, "vector must hold numbers");
    assert.equal((doc.vector as number[]).length, doc.dims, "dims must match the vector it describes");
    assert.ok(Array.isArray(doc.turnRefs) && (doc.turnRefs as string[]).length > 0);
    assert.equal(doc.tenantId, "t");
    assert.equal(doc.sourceRef, "s1");
    assert.ok(!("text" in doc), "ADR-0001: chunks must not duplicate turn text");
    assert.ok(!("embeddingRef" in doc), "the retired string pointer must not reappear");
  }
});

test("REFUSES to write a vector whose length contradicts dims, and still finishes indexing (ISS-112)", async () => {
  // The U1.2 verdict's finding: `vector` and `dims` are independently optional in the schema, so
  // {vector: [3 items], dims: 99} validates cleanly. The write is the only place that sees both.
  //
  // ISS-112 is the other half: this assertion used to throw PAST the catch, so a contradictory
  // batch skipped `tree_index` and the status flip too — the exact "no vectors this run becomes no
  // summary, no claims, no tree" trade the code says it refuses. Both halves are asserted here.
  const { db, calls } = fakeDb();
  const raggedEmbed = async (job: { texts: string[] }) => ({
    vectors: job.texts.map(() => [0.1, 0.2]),   // 2 numbers against a batch claiming 3 dims
    dims: 3,
    provider: "fake",
    model: "fake-embed",
  });
  await indexSession("t", "s1", { complete: completeWith() as never, embed: raggedEmbed as never, db });
  assert.deepEqual(chunkOps(calls), [], "an inconsistent batch must reach no chunk write at all");
  assert.ok(calls.some((c) => c.coll === "tree_index"), "the tree must still be updated (ISS-112)");
  assert.ok(
    calls.some((c) => c.coll === "sessions" && c.op === "updateOne"),
    "the status.index flip must still happen, or the session is stuck pending forever (ISS-112)",
  );
});

test("REFUSES a batch with the wrong NUMBER of vectors, rather than pairing by index (ISS-112)", async () => {
  const { db, calls } = fakeDb();
  // Two vectors for one chunk — the count guard must fire rather than silently taking the first.
  const shortEmbed = async () => ({
    vectors: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
    dims: 3,
    provider: "fake",
    model: "fake-embed",
  });
  await indexSession("t", "s1", { complete: completeWith() as never, embed: shortEmbed as never, db });
  assert.deepEqual(chunkOps(calls), [], "a wrong-count batch must reach no chunk write at all");
  assert.ok(calls.some((c) => c.coll === "tree_index"), "the tree must still be updated (ISS-112)");
});

test("every chunk write is tenant-scoped — the same guard the claims path needed", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, embed: embedOk as never, db });
  for (const c of calls.filter((x) => x.coll === "chunks")) {
    if (c.op === "deleteMany") {
      assert.equal(c.filter?.tenantId, "t", "an untenanted chunk delete can reach another tenant's rows");
    }
  }
  const insert = calls.find((c) => c.coll === "chunks" && c.op === "insertMany");
  for (const doc of insert!.docs ?? []) assert.equal(doc.tenantId, "t");
});

test("ISS-WEBINARRELEASE-002 strict provider/parser/embedding degradation preserves prior knowledge", async () => {
  for (const failure of ["summary-rejected", "summary-invalid", "claims-rejected", "claims-invalid", "embedding-rejected", "embedding-missing", "uncited-legacy-output"]) {
    const {db,calls}=fakeDb({existingSessionPage:{_id:"prior",tenantId:"t",sessionId:"s1",summary:"Prior valid page"}});
    const base=completeWith({summarizeFails:failure==="summary-rejected",claimsFails:failure==="claims-rejected"});
    const complete=async(job: Parameters<typeof base>[0])=>{
      if((failure==="summary-invalid"&&job.kind==="summarize")||(failure==="claims-invalid"&&job.kind==="claims")){
        return {text:"not-json",usage:{inputTokens:0,outputTokens:0},provider:"fixture",model:"fixture",costUsd:0};
      }return base(job);
    };
    const embed=failure==="embedding-missing"?undefined:failure==="embedding-rejected"?async()=>{throw new Error("fixture outage");}:embedOk;
    await assert.rejects(indexSession("t","s1",{db,complete:complete as never,embed,strictWebinar:true}),/strict webinar index incomplete/,failure);
    assert.ok(!calls.some((call)=>["session_pages","claims","chunks","tree_index"].includes(call.coll)&&["deleteMany","insertOne","insertMany","replaceOne"].includes(call.op)),failure);
    assert.ok(!calls.some((call)=>JSON.stringify(call.update ?? {}).includes('"status.index":"done"')),failure);
  }
});
