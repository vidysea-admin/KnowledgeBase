/**
 * apps/api/src/indexing.ts — the "make ingested content searchable" step. `config/
 * ai-routing.yaml` has always declared `summarize`/`claims` job kinds, but nothing ever called
 * them for a live-ingested session — T-002's TOC `session_pages`/`claims` were a one-time
 * backfill from pre-written files (`scripts/seed-toc.mjs` only loads JSON, never calls an LLM),
 * confirmed by reading that script. Every source adapter (URL, WhatsApp, and any future one)
 * already stamps a fresh session `status.index: "pending"` — this file is what turns that into
 * `"done"`: real summary + real evidence-checked claims (`@lkb/index`'s `summarizeSession`/
 * `extractClaims`) + a real, incremental `tree_index` update (`@lkb/index`'s `regenerate`, or a
 * fresh `buildTree` the first time a tenant gets one), so newly ingested content shows up in the
 * Brain graph and becomes answerable via `/ask` — not just visible on its own session-detail page.
 *
 * Re-indexing a session (ingest re-run, or a future re-index trigger) is a clean replace, never
 * an accumulate: this session's prior `session_pages`/`claims` rows are deleted before the new
 * ones are written, so re-running never duplicates.
 */
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { getDb, scopedCollection } from "@lkb/db";
import type { SessionPages, Chunks, Claims, Sessions, TreeIndexRootDocument, Turns } from "@lkb/core";
import { summarizeSession, extractClaims, buildChunks, buildTree, regenerate, treeIndexRootFilter, type SummarizeCompleteFn } from "@lkb/index";
import { recordVectorGap } from "./vector-gap.js";
import { promoteAndPersistEntities, type PromotionResult } from "./promote-entities.js";
import type { IndexEmbedFn, ChunkWriteResult, IndexSessionResult } from "./types.js";

// Re-exported so existing importers keep one import site for the indexing surface.
export type { IndexEmbedFn, ChunkSkipReason, ChunkWriteResult, IndexSessionResult } from "./types.js";

/** `schema/{session_pages,claims}.schema.json` both declare `evidence.minItems: 1`, which the
 * generated types express as a non-empty tuple. Both callers below only ever build this from an
 * array already known non-empty (real turns for a page; `extractClaims` already drops any claim
 * whose evidence list would be empty) — this just satisfies the tuple type honestly instead of
 * casting past it. */
function toEvidenceTuple<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) throw new Error("toEvidenceTuple: evidence must be non-empty");
  return items as [T, ...T[]];
}

export interface IndexSessionDeps {
  complete: SummarizeCompleteFn;
  /** OPTIONAL (U1.3). Absent — no configured embedding provider, or a caller that does not want a
   * vector index — means chunk writing is skipped entirely and every other stage is unaffected.
   * An install without embeddings must still be able to summarize, extract claims and build a
   * tree; making this required would have turned a missing capability into a broken pipeline. */
  embed?: IndexEmbedFn;
  /** Injectable so this function's WRITE decisions are testable without a live Mongo. Added for
   * ISS-056: the fix (don't delete a session's claims when extraction degraded) sat behind a
   * module-singleton `getDb()`, so reverting it left every test green — the same untested-guard
   * failure this project has now hit four times. Defaults to the real db; callers pass nothing. */
  db?: Pick<Db, "collection">;
}

/** `tree_index` is the one collection here that CANNOT go through `scopedCollection` — see
 * `treeIndexRootFilter`'s own doc comment (`@lkb/index`, ISS-063) for why, and why this file
 * imports it rather than re-deriving the `tenant:<id>` convention itself (as it briefly did).
 * The filter now also matches on the real `tenantId` field (ISS-062) — a pre-migration document
 * that predates that field simply won't match here and falls through to the fresh-build branch
 * below, which is always safe (worst case: a full rebuild instead of an incremental one). */
async function loadTreeRoot(tenantId: string, db: Pick<Db, "collection">): Promise<TreeIndexRootDocument | null> {
  return db.collection<TreeIndexRootDocument>("tree_index").findOne(treeIndexRootFilter(tenantId));
}

/**
 * ---- chunks + embeddings (U1.3) --------------------------------------------------------------
 *
 * DEGRADE-SAFE, and that is the whole design here. ISS-056 was paid for on the claims path: a
 * provider outage returned an empty array indistinguishable from "nothing found", the
 * unconditional delete ran, and a transient failure silently destroyed real extracted data. The
 * same shape applies with more force to chunks, because a vector index is expensive to rebuild
 * and its absence is INVISIBLE — a search just quietly returns less. So the delete only ever runs
 * when a replacement is actually in hand.
 *
 * EXTRACTED from `indexSession`'s body (U1.0 backfill) rather than copied. The backfill needs
 * exactly this step and none of the LLM ones: re-running `indexSession` over the 26 already-
 * indexed sessions would re-bill `summarize`/`claims` on every one and could overwrite good
 * `session_pages`/`claims` with a degraded fallback. Duplicating the logic into a script would
 * have meant the shipped path and the backfill path could drift — and the chunk write is
 * precisely where this project has already paid for a delete/insert asymmetry once.
 *
 * @returns what actually happened, so a caller (the backfill) can report per-session counts
 *          instead of inferring success from the absence of a throw. `indexSession` ignores it.
 */
export async function writeSessionChunks(
  tenantId: string,
  sessionId: string,
  turns: Turns[],
  embed: IndexEmbedFn,
  db: Pick<Db, "collection">,
): Promise<ChunkWriteResult> {
  const chunksColl = scopedCollection<Chunks>(db as never, "chunks");
  const plans = buildChunks(turns);
  if (plans.length === 0) {
    console.warn(`indexSession(${tenantId}/${sessionId}): no chunkable turns — chunks left unchanged`);
    return { written: 0, skipped: "no-chunkable-turns" };
  }
  // ISS-112: the C8 assertions below MUST sit inside this try. They previously followed it, so a
  // contradictory batch threw past the catch and skipped `tree_index` and the status flip as well
  // — exactly the "no vectors this run becomes no summary, no claims, no tree" trade the comment
  // below says it refuses. A guarantee stated in a comment and contradicted by the line numbering
  // is worse than no comment, because it stops the next reader checking.
  try {
    const embedded = await embed({ kind: "embedding", texts: plans.map((p) => p.text), purpose: "document" });

    // The correlation JSON Schema cannot express (the U1.2 verdict's finding): `vector` and
    // `dims` are independently optional there, so `{vector: [3 items], dims: 99}` validates.
    // Asserted at the only place that can see both — the write.
    if (embedded.vectors.length !== plans.length) {
      throw new Error(
        `indexSession: embedder returned ${embedded.vectors.length} vector(s) for ${plans.length} chunk(s)`,
      );
    }
    const chunkDocs: Chunks[] = plans.map((plan, i) => {
      const vector = embedded.vectors[i] ?? [];
      if (vector.length !== embedded.dims) {
        throw new Error(
          `indexSession: chunk ${plan.chunkIndex} has ${vector.length} dims, batch reports ${embedded.dims}`,
        );
      }
      return {
        _id: randomUUID(),
        tenantId,
        sourceRef: sessionId,
        turnRefs: toEvidenceTuple(plan.turnRefs),
        chunkIndex: plan.chunkIndex,
        vector: toEvidenceTuple(vector),
        dims: embedded.dims,
        embeddingModel: embedded.model,
      };
    });
    // Clean replace, never accumulate — a re-index must not double the corpus. Reached only
    // after every assertion above has passed, so the delete never runs without its replacement.
    await chunksColl(tenantId).deleteMany({ sourceRef: sessionId } as never);
    await chunksColl(tenantId).insertMany(chunkDocs);
    return { written: chunkDocs.length, skipped: null };
  } catch (err) {
    // Never rethrow: the rest of indexing already succeeded, and failing the whole call would
    // turn "no vectors this run" into "no summary, no claims, no tree" too. This now also
    // covers the C8 assertions (ISS-112), which used to throw past it.
    console.warn(
      `indexSession(${tenantId}/${sessionId}): embedding failed — chunks left unchanged: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return { written: 0, skipped: "embedding-failed" };
  }
}

/** Real summary + real evidence-checked claims + a real tree_index update for one already-
 * ingested session. Never throws out of the caller's control on an LLM failure — `summarizeSession`/
 * `extractClaims` already degrade honestly on their own (a labeled fallback summary, an empty
 * claims list) rather than blocking the pipeline. */
export async function indexSession(
  tenantId: string,
  sessionId: string,
  deps: IndexSessionDeps,
): Promise<IndexSessionResult> {
  const db = deps.db ?? getDb();
  // Tenant-scoped through the SAME injected handle: `scopedCollection` still forces a tenantId at
  // every call site (its whole purpose), it just no longer reaches past the injection to getDb().
  const turnsColl = scopedCollection<Turns>(db as never, "turns");
  const sessionsColl = scopedCollection<Sessions>(db as never, "sessions");
  const sessionPagesColl = scopedCollection<SessionPages>(db as never, "session_pages");
  const claimsColl = scopedCollection<Claims>(db as never, "claims");

  const turns = await turnsColl(tenantId).find({ sessionId }).toArray();

  const [summarizeResult, claimsResult] = await Promise.all([
    summarizeSession(turns, deps.complete),
    extractClaims(turns, deps.complete),
  ]);
  const { page: summary, degraded: summaryDegraded } = summarizeResult;
  const { claims: extractedClaims, degraded: claimsDegraded } = claimsResult;

  // schema/session_pages.schema.json requires evidence.minItems: 1 -- a session with zero turns
  // (nothing was actually ingested) has nothing real to cite, so it gets no session_page rather
  // than one with fabricated/empty evidence. tree_index/status update below still run, so the
  // session isn't stuck "pending" forever over an edge case that shouldn't occur for a real
  // ingest in the first place.
  //
  // The labelled fallback ("(fallback, LLM summary unavailable) ...") is a legitimate FIRST
  // summary for a session that has none yet, but it must never REPLACE a real one a prior
  // successful run already wrote (ISS-059, contract criterion 1a — the same shape as ISS-056's
  // claims defect, one file over). So on a degraded run we check whether a real page already
  // exists before touching anything; a non-degraded run keeps the unconditional replace, since a
  // genuinely fresh summary is always allowed to supersede an older one, fallback or not.
  const existingPage = summaryDegraded ? await sessionPagesColl(tenantId).findOne({ sessionId }) : null;
  if (summaryDegraded && existingPage) {
    console.warn(`indexSession(${tenantId}/${sessionId}): summary degraded — existing session_pages left unchanged: ${summaryDegraded.reason}`);
  } else {
    await sessionPagesColl(tenantId).deleteMany({ sessionId });
    if (turns.length > 0) {
      const page: SessionPages = {
        _id: randomUUID(),
        tenantId,
        sessionId,
        summary: summary.summary,
        keyInsights: summary.keyInsights,
        decisions: summary.decisions,
        actionItems: summary.actionItems,
        evidence: toEvidenceTuple(turns.map((t) => ({ turnId: t._id, sessionId }))),
      };
      await sessionPagesColl(tenantId).insertOne(page);
    }
  }

  // Replace the session's claims ONLY when extraction actually ran. The delete used to be
  // unconditional, so a failed provider call -- which returned an empty array indistinguishable
  // from "no claims found" -- deleted every previously-extracted real claim for this session and
  // inserted nothing back. A transient outage during a re-index silently destroyed good data
  // (ISS-056). On degradation the prior claims are left exactly as they were.
  if (claimsDegraded) {
    console.warn(`indexSession(${tenantId}/${sessionId}): claims left unchanged — ${claimsDegraded.reason}`);
  } else {
    await claimsColl(tenantId).deleteMany({ "evidence.sessionId": sessionId } as never);
  }
  if (!claimsDegraded && extractedClaims.length > 0) {
    const claimDocs: Claims[] = extractedClaims.map((c) => ({
      _id: randomUUID(),
      tenantId,
      text: c.text,
      // Freshly extracted, never auto-reviewed -- schema's status enum's honest default until a
      // human (or a future review pipeline) confirms it, same "needs-review" status T-002's
      // pre-written claims already used for anything not hand-verified.
      status: "needs-review",
      evidence: toEvidenceTuple(c.evidenceTurnIds.map((turnId) => ({ turnId, sessionId }))),
    }));
    await claimsColl(tenantId).insertMany(claimDocs);
  }

  // ISS-116's SECOND defect: this return used to be discarded, so a session that got no vectors
  // was indistinguishable from one that did — `indexSession` resolved, `status.index` flipped to
  // "done", and the only trace was a console warning nobody reads. That is how three whole
  // sessions (37% of the corpus) stayed out of the vector index while the index looked complete.
  // Returned rather than thrown: the degradation is deliberately non-fatal (see writeSessionChunks),
  // so the caller needs a value to inspect, not an exception to catch.
  let entities: PromotionResult | null = null;
  const chunks = deps.embed
    ? await writeSessionChunks(tenantId, sessionId, turns, deps.embed, db)
    : { written: 0, skipped: "no-embedder" as const };
  // ISS-122: the write can fault same as anything else that touches Mongo, and `recordVectorGap`'s
  // own catch never rethrows (ISS-121) — so without capturing this, a gap-write fault was
  // observable only via a console.warn nobody asserts on, the exact ISS-118 shape one level down.
  const gapRecorded = await recordVectorGap(tenantId, sessionId, chunks, db);
  const [allSessions, allPages, existingRoot] = await Promise.all([
    sessionsColl(tenantId).find({}).toArray() as Promise<Sessions[]>,
    sessionPagesColl(tenantId).find({}).toArray() as Promise<SessionPages[]>,
    loadTreeRoot(tenantId, db),
  ]);
  const newRoot = existingRoot
    ? regenerate(existingRoot, [sessionId], allSessions, allPages)
    : buildTree(allSessions, allPages)[tenantId];
  if (newRoot) {
    // Stamp/confirm the real tenantId regardless of which branch produced newRoot -- buildTree's
    // fresh root never carries one (it isn't a persisted document until now), and regenerate only
    // preserves whatever existingRoot already had (correct post-migration, absent pre-migration).
    // Setting it here, once, at the write boundary, is what actually closes ISS-062: every root
    // this function ever persists from this point on carries the field, migrated or not.
    const rootDoc: TreeIndexRootDocument = { ...newRoot, tenantId };
    await db.collection<TreeIndexRootDocument>("tree_index")
      .replaceOne(treeIndexRootFilter(tenantId), rootDoc, { upsert: true });

    // U2.1: the tree already holds topic and org nodes, so promoting them to entity rows needs no
    // LLM and cannot hallucinate — every row is derived from a node that already survived the
    // build. Placed AFTER the tree write and using the same `rootDoc`, so the entities can never
    // describe a tree that was not persisted. Never throws (see the module's own note).
    entities = await promoteAndPersistEntities(tenantId, sessionId, rootDoc, db,
      { tagClaims: claimsDegraded === null });
  }

  await sessionsColl(tenantId).updateOne({ _id: sessionId }, { $set: { "status.index": "done" } });

  return { sessionId, chunks, entities, gapRecorded };
}

export type IndexSessionFn = typeof indexSession;
/** The composition-root-bound shape every ingest deps builder actually takes — `complete`
 * (and its per-request `tenantId` routing) already closed over, so a caller only ever supplies
 * `(tenantId, sessionId)`. */
export type BoundIndexer = (tenantId: string, sessionId: string) => Promise<IndexSessionResult>;
