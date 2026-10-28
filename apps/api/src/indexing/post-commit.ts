import type { Db } from "mongodb";
import type { Sessions } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { verifyIndexGeneration } from "./generation.js";
import { headId, type ReviewHead } from "../transcript-review/store.js";
import type { CommittedIndexBinding, IndexCommittedHook } from "./types.js";
import type { IndexSessionResult } from "./types.js";
import { isStandaloneMongo } from "../visibility/topology.js";
import { transactionReviewDb } from "../transcript-review/transaction-db.js";

/** Manual transaction retries commit acknowledgement only, never paid publication work. */
export async function publishIndexWithCommit(
  db: Db, tenantId: string, sessionId: string, hook: IndexCommittedHook | undefined,
  work: (db: Pick<Db, "collection">) => Promise<IndexSessionResult>,
): Promise<IndexSessionResult> {
  // STANDALONE mongod (w27-standalone): no transaction. The generation protocol in generation.ts is the publication
  // pointer: artifacts are written under a fresh generation id, finishIndexAttempt flips sessions.indexAttempt to
  // complete with one conditional single-document update, and readers (verifyIndexGeneration) resolve only a complete
  // generation whose artifacts match the manifest digests. Before the flip the previous state is what readers see (or
  // nothing, fail closed); a crash leaves attempt state failed/uncertain/running, which keeps refusing a new attempt
  // until an explicit recovery (unchanged contract: no automatic takeover of possibly-written state).
  if (await isStandaloneMongo(db)) {
    const result = await work(transactionReviewDb(db, undefined, tenantId));
    if (!result.completion?.complete) throw new Error("vectorless atomic publication incomplete");
    await notifyIndexCommitted(db, tenantId, sessionId, hook, { generation: result.completion.generation });
    return result;
  }
  const session = db.client.startSession(); let unknownCommit = false;
  try {
    session.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 15000 });
    const result = await work(transactionReviewDb(db, session, tenantId));
    if (!result.completion?.complete) throw new Error("vectorless atomic publication incomplete");
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await session.commitTransaction(); unknownCommit = false; }
      catch (error) {
        unknownCommit = typeof (error as { hasErrorLabel?: unknown })?.hasErrorLabel === "function" &&
          (error as { hasErrorLabel(label: string): boolean }).hasErrorLabel("UnknownTransactionCommitResult");
        if (!unknownCommit || attempt === 2) throw error;
        continue;
      }
      await notifyIndexCommitted(db, tenantId, sessionId, hook, { generation: result.completion.generation });
      return result;
    }
    throw new Error("vectorless atomic publication unconfirmed");
  } catch (error) {
    if (!unknownCommit) try { await session.abortTransaction(); } catch { /* Original failure remains authoritative. */ }
    throw error;
  } finally { await session.endSession(); }
}

/** Call only after the caller's outer commit is acknowledged, using its unscoped DB handle.
 * Failure leaves durable archive work pending; it cannot undo or retry paid indexing work. */
export async function notifyIndexCommitted(
  db: Pick<Db, "collection">, tenantId: string, sessionId: string,
  hook?: IndexCommittedHook, expected?: { generation?: string; reviewRevision?: string },
): Promise<"unconfigured" | "unavailable" | "notified"> {
  if (!hook) return "unconfigured";
  try {
    const verified = await verifyIndexGeneration(db, tenantId, sessionId, expected?.generation);
    if (!verified) return "unavailable";
    const sessions = scopedCollection<Sessions>(db as never, "sessions")(tenantId);
    const heads = scopedCollection<ReviewHead>(db as never, "transcript_reviews")(tenantId);
    const current = await sessions.findOne({ _id: sessionId });
    const head = await heads.findOne({ _id: headId(tenantId, sessionId), sessionId });
    const revision = head?.revision ?? null;
    if (expected?.reviewRevision !== undefined && revision !== expected.reviewRevision) return "unavailable";
    if (head && (head.refresh.status !== "complete" || head.refresh.revision !== revision ||
      head.refresh.targets.some(target => !head.refresh.completed.includes(target)))) return "unavailable";
    const attempt = current?.indexAttempt;
    if (current?.status.index !== "done" || attempt?.state !== "complete" ||
      attempt.generation !== verified.generation || attempt.sourceId !== verified.sourceId ||
      !/^[a-f0-9]{64}$/.test(attempt.turnDigest)) return "unavailable";
    const binding: CommittedIndexBinding = Object.freeze({ tenantId, sessionId, sourceId: verified.sourceId,
      generation: verified.generation, turnDigest: attempt.turnDigest, reviewRevision: revision });
    // Full artifact verification and the revision fence are reread after constructing the binding.
    if (!await verifyIndexGeneration(db, tenantId, sessionId, binding.generation)) return "unavailable";
    const latest = await heads.findOne({ _id: headId(tenantId, sessionId), sessionId });
    if ((latest?.revision ?? null) !== revision || latest && (latest.refresh.status !== "complete" ||
      latest.refresh.revision !== revision || latest.refresh.targets.some(target => !latest.refresh.completed.includes(target)))) return "unavailable";
    await hook(binding);
    return "notified";
  } catch { return "unavailable"; }
}
