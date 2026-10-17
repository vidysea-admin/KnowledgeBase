import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import { buildKnowledgeGraph, treeIndexRootFilter } from "@lkb/index";
import type { TreeIndexRootDocument, Sessions } from "@lkb/core";
import type { IndexSessionResult } from "../indexing/types.js";
import type { RefreshExecutor } from "./service.js";
import { headId, type ReviewHead } from "./store.js";
import type { ReviewTurn } from "./planner.js";
import { transactionReviewDb } from "./transaction-db.js";

export interface TranscriptRefreshDeps {
  db: Db;
  index: (tenantId: string, sessionId: string, db: Pick<Db, "collection">) => Promise<IndexSessionResult>;
}

/** All derived targets publish in ONE Mongo transaction. A write to the same review head is
 * the revision fence: a concurrent correction conflicts/aborts the transaction, including every
 * derived write. Unsupported standalone Mongo fails closed. No refresh completion is fabricated. */
export function createTranscriptRefreshExecutor(deps: TranscriptRefreshDeps): RefreshExecutor {
  return async ({ tenantId, sessionId, revision, target }) => {
    if (!["claims", "session-page", "chunks", "tree", "graph"].includes(target)) throw new Error("Unknown refresh target");
    const session = deps.db.client.startSession();
    let unknownCommit = false;
    try {
      // Provider work is not transactional. Never use the driver's callback retry here:
      // a transient write/commit failure would rerun already charged indexing/judge calls.
      session.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 15000 });
      await (async () => {
        const db = transactionReviewDb(deps.db, session, tenantId);
        const heads = scopedCollection<ReviewHead>(db as Db, "transcript_reviews")(tenantId);
        const head = await heads.findOne({ _id: headId(tenantId, sessionId), sessionId, revision });
        if (!head) throw new Error("Transcript refresh superseded");
        // A previous per-target call already published the entire generation atomically.
        const inputTurns = await scopedCollection<ReviewTurn>(db as Db, "turns")(tenantId).find({ sessionId }).toArray();
        const inputIds = new Set(inputTurns.map((t) => t._id));
        if (head.overlay.some((o) => !inputIds.has(o.turnId))) throw new Error("Reviewed source passages disappeared");
        if (head.refresh.completed.length === head.refresh.targets.length) return;
        const result = await deps.index(tenantId, sessionId, db);
        if (!result.completion?.complete || !result.completion.strict || result.completion.retrievalMode !== "vectorless" ||
            !result.completion.lexicalWritten || !result.completion.provenanceValidated || !result.groundedNotes || result.summary?.degraded || result.claims?.degraded ||
            result.chunks.skipped || !result.chunks.written || !result.completion.treeWritten || result.entities?.skipped) {
          throw new Error("Transcript knowledge refresh incomplete");
        }
        const turns = await scopedCollection<ReviewTurn>(db as Db, "turns")(tenantId).find({ sessionId }).toArray();
        const edges = scopedCollection<Record<string, unknown> & { _id: string; tenantId: string }>(db as Db, "graph_edges")(tenantId);
        // Existing semantic edges are grounded in their original text. Remove changed-text
        // evidence instead of carrying a relationship contradicted by the review into the new
        // generation. Unaffected evidence remains available; no semantic relationship is guessed.
        const changedText = new Set(head.overlay.map((o) => o.turnId));
        const existing = await edges.find({ sessionRef: sessionId } as never).toArray();
        for (const edge of existing) {
          if (edge.type === "spoke_in" || !Array.isArray(edge.evidence)) continue;
          const kept = edge.evidence.filter((e: { turnId?: unknown }) => !changedText.has(String(e.turnId)));
          if (kept.length === edge.evidence.length) continue;
          if (!kept.length) await edges.deleteMany({ _id: edge._id } as never);
          else await edges.updateOne({ _id: edge._id } as never, { $set: { evidence: kept, revision } } as never);
        }
        // Replace only transcript-derived speaker edges. Organisation relationships need
        // their own evidence and are never inferred from a reviewer-entered name.
        await edges.deleteMany({ sessionRef: sessionId, type: "spoke_in" } as never);
        for (const ref of new Set(turns.map((t) => t.speakerRef))) {
          const own = turns.filter((t) => t.speakerRef === ref);
          const id = createHash("sha256").update(JSON.stringify([tenantId, sessionId, "spoke_in", ref])).digest("hex");
          // A text correction cannot upgrade an unchanged speaker identity's certainty.
          // Mapping supplies no numerical score; preserve known prior scores conservatively
          // and leave new relations unscored instead of inventing probability 1.
          const scores = existing.filter((e) => e.type === "spoke_in" && e.from === ref && e.to === `session:${sessionId}`)
            .map((e) => e.confidence).filter((score): score is number => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1);
          const confidence = scores.length ? Math.min(...scores) : undefined;
          await edges.insertOne({ _id: id, tenantId, from: ref, to: `session:${sessionId}`, type: "spoke_in",
            sessionRef: sessionId, weight: own.length, ...(confidence !== undefined ? { confidence } : {}), revision,
            evidence: own.slice(0, 5).map((t) => ({ turnId: t._id, sessionId, tStart: t.tStart })) });
        }
        const treeRoot = await scopedCollection<TreeIndexRootDocument & { _id: string }>(db as Db, "tree_index")(tenantId).findOne(treeIndexRootFilter(tenantId));
        const graph = buildKnowledgeGraph({ treeRoot, entityEdges: await edges.find({}).toArray(),
          sessions: await scopedCollection<Sessions>(db as Db, "sessions")(tenantId).find({}).toArray() });
        if (!graph.nodes.some((n) => n.id === `session:${sessionId}`) || !graph.edges.some((e) => e.type === "spoke_in" && e.target === `session:${sessionId}`)) throw new Error("Refreshed graph does not consume the reviewed session");
        const refresh = { status: "complete" as const, revision, targets: [...head.refresh.targets], completed: [...head.refresh.targets] };
        const fence = await heads.updateOne({ _id: head._id, sessionId, revision }, { $set: { refresh } });
        if (fence.matchedCount !== 1) throw new Error("Transcript refresh superseded");
      })();
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await session.commitTransaction(); unknownCommit = false; return; }
        catch (error) {
          unknownCommit = typeof (error as { hasErrorLabel?: unknown })?.hasErrorLabel === "function" &&
            (error as { hasErrorLabel(label: string): boolean }).hasErrorLabel("UnknownTransactionCommitResult");
          if (!unknownCommit || attempt === 2) throw error;
        }
      }
    } catch (error) {
      // An uncertain commit may already be durable. Do not issue an abort or repeat work;
      // the caller must reconcile the durable head before an explicit later refresh.
      if (!unknownCommit) try { await session.abortTransaction(); } catch { /* Preserve the original failure. */ }
      throw error;
    } finally { await session.endSession(); }
  };
}
