
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { getDb, scopedCollection } from "@lkb/db";
import type { SessionPages, Claims, Sessions, TreeIndexRootDocument, Turns } from "@lkb/core";
import { summarizeSession, extractClaims, buildChunks, buildTopicIndex, regenerate, treeIndexRootFilter, runtimeChronologicalTurns, assertGroundedTurns, validateRuntimePage, runtimeEvidence, runtimeExtractive, runtimeEvidenceOrigin } from "@lkb/index";
import { suggestSpeakersForSession, type SpeakerSuggestOutcome } from "./speaker-suggest.js";
import { runTileSuggestHook } from "./session-tile-suggest-hook.js";
import { recordVectorGap } from "./vector-gap.js";
import { decisionsEnabled } from "@lkb/index";
import { extractAndPersistDecisions } from "./persistence/decisions-persist.js";
import { promoteAndPersistEntities, type PromotionResult } from "./persistence/promote-entities.js";
import type { IndexEmbedFn, IndexSessionResult, IndexSessionDeps } from "./types.js";
import { notifyIndexCommitted, publishIndexWithCommit } from "./post-commit.js";
import { toEvidenceTuple, toCitedItems, toQaEntries } from "./evidence-tuples.js";
import { writeSessionChunks, writeSessionLexicalChunks, legacyChunkProvenance } from "./chunk-write.js";
import { replacePageInsertFirst, replaceClaimsPreserving, judgeTotals } from "./grounded-write.js";
import { readEffectiveTurns } from '../transcript-review/effective-reader.js';
import { eligibleTreeInput } from './eligible-tree.js';
import { createKnowledgeVisibility } from '../visibility/knowledge.js';
import { assertSourceBoundPublication, assertPreservedClaimMeaning } from './vectorless-grounding.js';
import { acquireIndexAttempt, assertIndexAttemptOwned, enterIndexWrites, failIndexAttempt, finishIndexAttempt,
  indexAttemptBinding, indexArtifactRef, validatePreservedIndexClaims, bindIndexTree, persistIndexTree,
  type IndexArtifactRef, type VerifiedIndexGeneration } from "./generation.js";

// Re-exported so existing importers keep one import site for the indexing surface.
export { prepareChunkDocuments, writeSessionChunks } from "./chunk-write.js";
export type { IndexEmbedFn, ChunkSkipReason, ChunkWriteResult, IndexSessionResult, IndexSessionDeps } from "./types.js";






async function loadTreeRoot(tenantId: string, db: Pick<Db, "collection">): Promise<TreeIndexRootDocument | null> {
  return scopedCollection<TreeIndexRootDocument & { _id: string }>(db as never, "tree_index")(tenantId).findOne(treeIndexRootFilter(tenantId));
}



export async function indexSession(
  tenantId: string,
  sessionId: string,
  deps: IndexSessionDeps,
): Promise<IndexSessionResult> {
  const db = deps.db ?? getDb();
  // Scoped correction handles join the caller's transaction; native publication owns its commit.
  if (deps.retrievalMode !== "vector" && "client" in db) {
    return publishIndexWithCommit(db as Db, tenantId, sessionId, deps.onIndexCommitted,
      scoped => indexSessionWithinPublication(tenantId, sessionId, { ...deps, db: scoped }));
  }
  const result = await indexSessionWithinPublication(tenantId, sessionId, { ...deps, db });
  // No-client handles can belong to an outer transaction: its owner supplies notification.
  if ("client" in db && result.completion?.complete) {
    await notifyIndexCommitted(db, tenantId, sessionId, deps.onIndexCommitted, { generation: result.completion.generation });
  }
  return result;
}

async function indexSessionWithinPublication(
  tenantId: string, sessionId: string, deps: IndexSessionDeps,
): Promise<IndexSessionResult> {
  const db = deps.db ?? getDb();
  // Tenant-scoped through the SAME injected handle: `scopedCollection` still forces a tenantId at
  // every call site (its whole purpose), it just no longer reaches past the injection to getDb().
  const turnsColl = scopedCollection<Turns>(db as never, "turns");
  const sessionsColl = scopedCollection<Sessions>(db as never, "sessions");
  const sessionPagesColl = scopedCollection<SessionPages>(db as never, "session_pages");
  const claimsColl = scopedCollection<Claims>(db as never, "claims");

  let turns = await readEffectiveTurns(db, tenantId, await turnsColl(tenantId).find({ sessionId }).toArray(), sessionId);
  if (!await createKnowledgeVisibility(db).sessionVisible(tenantId, sessionId)) throw new Error('Session is unavailable for aggregate indexing; reviewed chat claims use their approved evidence materializer');

  const strict = deps.strictWebinar === true;
  const retrievalMode = deps.retrievalMode ?? "vectorless";
  const attempt = await acquireIndexAttempt(db, tenantId, sessionId, turns, strict);
  const binding = indexAttemptBinding(attempt);
  const assertOwned = () => assertIndexAttemptOwned(db, tenantId, attempt);
  let pageRef: IndexArtifactRef | undefined;
  let generatedClaimRefs: IndexArtifactRef[] = [];
  let preservedClaimRefs: IndexArtifactRef[] = [];
  let chunkRefs: IndexArtifactRef[] = [];
  let treeRevision: number | undefined;
  let committed: VerifiedIndexGeneration | undefined;
  try {
  if (strict) {
    try { assertGroundedTurns(turns, tenantId, sessionId); turns = runtimeChronologicalTurns(turns); }
    catch (error) { throw new Error(`strict webinar index incomplete: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const [summarizeResult, claimsResult] = await Promise.all([
    summarizeSession(turns, deps.complete, { strictWebinar: strict, dropUnverified: deps.dropUnverified, ...(deps.noteJudge ? { noteJudge: deps.noteJudge, judgeMaxCostUsd: deps.judgeMaxCostUsd } : {}) }),
    extractClaims(turns, deps.complete, { strictWebinar: strict, dropUnverified: deps.dropUnverified, ...(deps.noteJudge ? { noteJudge: deps.noteJudge, judgeMaxCostUsd: deps.judgeMaxCostUsd } : {}) }),
  ]);
  const { page: summary, degraded: summaryDegraded } = summarizeResult;
  const { claims: extractedClaims, degraded: claimsDegraded } = claimsResult;
  if (retrievalMode === "vectorless" && !strict && (summaryDegraded || claimsDegraded)) {
    throw new Error(`vectorless publication incomplete: ${summaryDegraded?.reason ?? claimsDegraded?.reason}`);
  }
  if (retrievalMode === "vectorless" && !strict && !summaryDegraded && !claimsDegraded) {
    assertSourceBoundPublication(tenantId, sessionId, turns, summary, extractedClaims);
  }
  // Vectorless publication always preserves reviewed claims. Webinar note-generation policy
  // remains independently controlled by strict/dropUnverified above.
  const grounded = strict && deps.dropUnverified === true;
  const preserveReviewed = retrievalMode === "vectorless" || grounded;
  let claimWrite: { preserved: number; replaced: number; inserted: number } | undefined;
  let preparedTree: ReturnType<typeof regenerate> | undefined;
  let preparedTreeBase: TreeIndexRootDocument | null = null;
  let candidatePage: SessionPages | undefined;
  let preparedEmbed: Awaited<ReturnType<IndexEmbedFn>> | undefined;
  let topicReport: IndexSessionResult['topics'];
  if (strict) {
    let reason = !turns.length ? "empty required transcript" : summaryDegraded?.reason ?? claimsDegraded?.reason;
    if (!reason && retrievalMode === "vector" && !deps.embed) reason = "required embedding provider unavailable";
    if (!reason && retrievalMode === "vector" && deps.embed) {
      try {
        preparedEmbed = await deps.embed({ kind: "embedding", texts: buildChunks(turns).map((p) => p.text), purpose: "document" });
        const prepared = await writeSessionChunks(tenantId, sessionId, turns, async () => preparedEmbed!, db, false);
        if (prepared.skipped || !prepared.written) reason = `required chunks incomplete: ${prepared.skipped}`;
      } catch (error) { reason = `required embedding failed: ${error instanceof Error ? error.message : String(error)}`; }
    }
    if (!reason) {
      try {
        Object.assign(summary, validateRuntimePage(turns, summary));
        for (const claim of extractedClaims) {
          const evidence = runtimeEvidence(claim.evidence, turns);
          runtimeExtractive(claim.text, evidence);
          if (claim.origin !== runtimeEvidenceOrigin(evidence, turns) || claim.verification !== "unverified" || JSON.stringify(claim.evidenceTurnIds) !== JSON.stringify(evidence.map((e) => e.turnId))) throw new Error("invalid grounded claim persistence");
          claim.evidence = evidence;
        }
        const preparedPage: SessionPages = { _id: randomUUID(), tenantId, sessionId, ...summary, indexArtifact: { ...binding },
          citedItems: toCitedItems(summary.citedItems!), qa: toQaEntries(summary.qa!),
          evidence: toEvidenceTuple([...summary.citedItems!.flatMap((i) => i.evidence), ...summary.qa!.flatMap((q) => [...q.questionEvidence, ...q.answerEvidence])].map((e) => ({ ...e }))) };
        candidatePage = preparedPage;
        const [sessions, pages, root] = await Promise.all([sessionsColl(tenantId).find({}).toArray(), sessionPagesColl(tenantId).find({}).toArray(), loadTreeRoot(tenantId, db)]);
        preparedTreeBase = root;
        if (!sessions.some((s) => s._id === sessionId && s.tenantId === tenantId)) throw new Error("required tree session unavailable");
        const prospective = [...pages.filter((p) => p.sessionId !== sessionId), preparedPage];
        const eligible = await eligibleTreeInput(db, tenantId, sessions, prospective, root, { rebuildOnNewEligible: [sessionId] });
        const topicIndex = await buildTopicIndex(tenantId, eligible.sessions, eligible.pages, deps.complete,
          {existingRoot: eligible.existingRoot, changedSessionIds: [sessionId]});
        preparedTree = topicIndex.root;
        if (topicIndex.results.size) topicReport = [...topicIndex.results].map(([pageId, result]) => ({pageId, degraded: result.degraded?.reason ?? null}));
        const containsCandidate = (node: NonNullable<typeof preparedTree>): boolean =>
          (node.level === "session" && node.evidence?.sessionRef === sessionId && node.summary === candidatePage!.summary) || node.children.some(containsCandidate);
        if (!preparedTree || preparedTree.node_id !== `tenant:${tenantId}` || !containsCandidate(preparedTree)) throw new Error("required candidate session tree unavailable");
      } catch (error) { reason = `grounded preflight failed: ${error instanceof Error ? error.message : String(error)}`; }
    }
    if (reason) {
      throw new Error(`strict webinar index incomplete: ${reason}`);
    }
  }

  if (preserveReviewed) {
    const old = await claimsColl(tenantId).find({ "evidence.sessionId": sessionId } as never).toArray();
    const reviewed = old.filter(claim => claim.status !== "needs-review");
    preservedClaimRefs = validatePreservedIndexClaims(reviewed, turns);
    const spent = judgeTotals(summarizeResult.judgeSidecar, claimsResult.judgeSidecar)?.costUsd ?? 0;
    await assertPreservedClaimMeaning(reviewed, turns, deps.noteJudge,
      deps.judgeMaxCostUsd === undefined ? undefined : Math.max(0, deps.judgeMaxCostUsd - spent));
    if (!claimsDegraded && !extractedClaims.length && old.some(claim => claim.status === "needs-review")) {
      throw new Error("no accepted fresh claims; prior machine knowledge retained");
    }
  }
  await enterIndexWrites(db, tenantId, attempt);


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
    if (!preserveReviewed) {
      await assertOwned();
      const removed = await sessionPagesColl(tenantId).deleteMany({ sessionId });
      if (removed.acknowledged !== true) throw new Error("page generation prune unconfirmed");
    }
    if (turns.length > 0) {
      const page: SessionPages = candidatePage ?? {
        _id: randomUUID(),
        tenantId,
        sessionId,
        summary: summary.summary,
        keyInsights: summary.keyInsights,
        decisions: summary.decisions,
        actionItems: summary.actionItems,
        evidence: toEvidenceTuple(turns.map((t) => ({ turnId: t._id, sessionId }))),
      };
      const stampedPage = { ...page, indexArtifact: { ...binding } };
      pageRef = indexArtifactRef(stampedPage);
      if (preserveReviewed) await replacePageInsertFirst(sessionPagesColl(tenantId) as never, sessionId, stampedPage, { assertOwned });
      else {
        await assertOwned();
        const saved = await sessionPagesColl(tenantId).insertOne(stampedPage);
        if (saved.acknowledged !== true) throw new Error("page generation write unconfirmed");
      }
    }
  }

  // Replace the session's claims ONLY when extraction actually ran. The delete used to be
  // unconditional, so a failed provider call -- which returned an empty array indistinguishable
  // from "no claims found" -- deleted every previously-extracted real claim for this session and
  // inserted nothing back. A transient outage during a re-index silently destroyed good data
  // (ISS-056). On degradation the prior claims are left exactly as they were.
  if (claimsDegraded) {
    console.warn(`indexSession(${tenantId}/${sessionId}): claims left unchanged — ${claimsDegraded.reason}`);
  } else if (!preserveReviewed) {
    await assertOwned();
    const removed = await claimsColl(tenantId).deleteMany({ "evidence.sessionId": sessionId } as never);
    if (removed.acknowledged !== true) throw new Error("claim generation prune unconfirmed");
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
      evidence: toEvidenceTuple(c.evidence ?? c.evidenceTurnIds.map((turnId) => ({ turnId, sessionId }))),
      indexArtifact: { ...binding },
      ...(strict ? { origin: c.origin, verification: c.verification } : {}),
    }));
    if (preserveReviewed) claimWrite = await replaceClaimsPreserving(claimsColl(tenantId) as never, sessionId, claimDocs, {
      assertOwned, plannedClaims(fresh, preserved) {
        generatedClaimRefs = fresh.map(indexArtifactRef);
        preservedClaimRefs = validatePreservedIndexClaims(preserved, turns);
      },
    });
    else {
      generatedClaimRefs = claimDocs.map(indexArtifactRef);
      await assertOwned();
      const saved = await claimsColl(tenantId).insertMany(claimDocs);
      if (saved.acknowledged !== true) throw new Error("claim generation write unconfirmed");
    }
  }

  // U2.5 (flag-gated, OFF by default): flag-off reaches no decisions code, no collection, no job.
  let decisionsOut: { count: number; degraded: string | null } | undefined;
  if (deps.extractDecisions ?? decisionsEnabled()) {
    try { decisionsOut = await extractAndPersistDecisions(tenantId, sessionId, turns, deps.complete, db); }
    catch (error) { decisionsOut = { count: 0, degraded: `decisions persist failed: ${error instanceof Error ? error.message : String(error)}` }; }
  }

  // ISS-116's SECOND defect: this return used to be discarded, so a session that got no vectors
  // was indistinguishable from one that did — `indexSession` resolved, `status.index` flipped to
  // "done", and the only trace was a console warning nobody reads. That is how three whole
  // sessions (37% of the corpus) stayed out of the vector index while the index looked complete.
  // Returned rather than thrown: the degradation is deliberately non-fatal (see writeSessionChunks),
  // so the caller needs a value to inspect, not an exception to catch.
  let entities: PromotionResult | null = null;
  const chunkGeneration = { binding, assertOwned, prepared(docs: import("@lkb/core").Chunks[]) { chunkRefs = docs.map(indexArtifactRef); } };
  const chunkProvenance = legacyChunkProvenance(await sessionsColl(tenantId).findOne({ _id: sessionId } as never));
  const chunks = retrievalMode === "vectorless"
    ? await writeSessionLexicalChunks(tenantId, sessionId, turns, db, chunkGeneration, chunkProvenance)
    : deps.embed
    ? await writeSessionChunks(tenantId, sessionId, turns, preparedEmbed ? async () => preparedEmbed! : deps.embed, db, true, chunkProvenance, chunkGeneration)
    : { written: 0, skipped: "no-embedder" as const };
  // Disabled vector retrieval is intentional (no backlog). ISS-122: capture the never-throwing gap write's outcome.
  const gapRecorded = await recordVectorGap(tenantId, sessionId, chunks, db, retrievalMode);
  if (strict && (chunks.skipped || !chunks.written)) throw new Error("strict webinar index incomplete: required chunks not persisted");
  const [allSessions, allPages, existingRoot] = await Promise.all([
    sessionsColl(tenantId).find({}).toArray() as Promise<Sessions[]>,
    sessionPagesColl(tenantId).find({}).toArray() as Promise<SessionPages[]>,
    loadTreeRoot(tenantId, db),
  ]);
  const eligible = await eligibleTreeInput(db, tenantId, allSessions, allPages, existingRoot, { rebuildOnNewEligible: [sessionId] });
  const topicIndex = preparedTree ? undefined : await buildTopicIndex(tenantId, eligible.sessions, eligible.pages, deps.complete,
    {existingRoot: eligible.existingRoot, changedSessionIds: [sessionId]});
  const newRoot = preparedTree ?? topicIndex?.root;
  if (topicIndex?.results.size) topicReport = [...topicIndex.results].map(([pageId, result]) => ({pageId, degraded: result.degraded?.reason ?? null}));
  if (strict && !newRoot) throw new Error("strict webinar index incomplete: required tree unavailable");
  if (newRoot) {
    // Stamp/confirm the real tenantId regardless of which branch produced newRoot -- buildTree's
    // fresh root never carries one (it isn't a persisted document until now), and regenerate only
    // preserves whatever existingRoot already had (correct post-migration, absent pre-migration).
    // Setting it here, once, at the write boundary, is what actually closes ISS-062: every root
    // this function ever persists from this point on carries the field, migrated or not.
    const rootDoc: TreeIndexRootDocument = { ...bindIndexTree(newRoot, binding, allPages, tenantId), tenantId };
    treeRevision = await persistIndexTree(db, tenantId, attempt, rootDoc, preparedTree ? preparedTreeBase : existingRoot);

    // U2.1: the tree already holds topic and org nodes, so promoting them to entity rows needs no
    // LLM and cannot hallucinate — every row is derived from a node that already survived the
    // build. Placed AFTER the tree write and using the same `rootDoc`, so the entities can never
    // describe a tree that was not persisted. Never throws (see the module's own note).
    entities = await promoteAndPersistEntities(tenantId, sessionId, rootDoc, db,
      { tagClaims: claimsDegraded === null });
  }

  // U2.4 / D-141: suggestions only, behind the opt-in flag; absent flag = no call, no result key (byte-identical output).
  const speakerSuggestions: SpeakerSuggestOutcome | undefined = deps.suggestSpeakers === true ? await suggestSpeakersForSession(tenantId, sessionId, turns, deps.complete as never, db as Db) : undefined;

  if (!summaryDegraded && !claimsDegraded && !chunks.skipped && !entities?.skipped && pageRef && chunkRefs.length && treeRevision !== undefined) {
    committed = await finishIndexAttempt(db, tenantId, attempt, { page: pageRef, chunks: [chunkRefs[0]!, ...chunkRefs.slice(1)], claims: generatedClaimRefs,
      preservedClaims: preservedClaimRefs, treeRevision, retrievalMode });
  } else await failIndexAttempt(db, tenantId, attempt);

  const tileSpeakerSuggestions = await runTileSuggestHook(committed, deps.tileSuggest, tenantId, sessionId, turns, db as Db); // T-042 P9 / D-160 hook: gating + fail-soft in ./session-tile-suggest-hook.ts

  return { sessionId, chunks, entities, gapRecorded, ...(speakerSuggestions ? { speakerSuggestions } : {}), ...(tileSpeakerSuggestions ? { tileSpeakerSuggestions } : {}), summary: { degraded: summaryDegraded?.reason ?? null, ...(summarizeResult.dropped ? { dropped: summarizeResult.dropped.length } : {}) },
    claims: { degraded: claimsDegraded?.reason ?? null, ...(claimsResult.dropped ? { dropped: claimsResult.dropped.length } : {}) },
    ...(decisionsOut ? { decisions: decisionsOut } : {}), ...(topicReport ? { topics: topicReport } : {}),
    ...(grounded ? { groundedNotes: { claims: claimWrite ?? null, judge: judgeTotals(summarizeResult.judgeSidecar, claimsResult.judgeSidecar) ?? null } } : {}),
    completion: { version: 2, strict, complete: Boolean(committed), generation: committed?.generation ?? attempt.generation,
      turnCount: attempt.turnCount, treeWritten: Boolean(committed), retrievalMode,
      lexicalWritten: Boolean(committed) && retrievalMode === "vectorless", provenanceValidated: Boolean(committed) } };
  } catch (error) {
    try { await failIndexAttempt(db, tenantId, attempt); } catch { /* Refuse success; an unconfirmed attempt requires explicit recovery. */ }
    throw error;
  }
}

export type IndexSessionFn = typeof indexSession;

export type BoundIndexer = (tenantId: string, sessionId: string) => Promise<IndexSessionResult>;
