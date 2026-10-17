import type { Claims, Chunks, Gaps, Media, SessionPages, Sessions, Sources, TreeIndexRootDocument, Turns, WatchedSources } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb, scopedCollection, assertValidTenantId } from "@lkb/db";
import { isRefusedWorkDb } from "../db-name.js";
import { assertConnectorIndexConsumed, isConnectorRecordingSource, ConnectorWorkflowError, type ConnectorWorkflowStore } from "./types.js";
import { connectorTreeContainsSession } from "./consumption.js";
import { verifyIndexGeneration } from "../indexing/generation.js";

/** Reuses existing collection schemas; no new collection/index or migration is introduced. */
export function createConnectorMongoStore(env: NodeJS.ProcessEnv = process.env, db?: Pick<Db, "collection">): ConnectorWorkflowStore {
  function collection<T extends { _id: string; tenantId: string }>(name: string, tenantId: string) {
    assertValidTenantId(tenantId, `connector.${name}`);
    // No production opt-in is invented by this unit. Root must separately authorize a live deployment.
    if (isRefusedWorkDb(env.MONGODB_DB, env)) throw new ConnectorWorkflowError(503, "connector_database_unconfigured");
    return scopedCollection<T>((db ?? getDb()) as Db, name)(tenantId);
  }
  async function artifacts(tenantId: string, sourceId: string, sessionId: string, turnCount: number, generation: string): Promise<boolean> {
    const verified = await verifyIndexGeneration(db ?? getDb(), tenantId, sessionId, generation);
    if (!verified || verified.sourceId !== sourceId || verified.turnCount !== turnCount) return false;
    if (!await collection<Sources>("sources", tenantId).findOne({ _id: sourceId })) return false;
    const session = await collection<Sessions>("sessions", tenantId).findOne({ sourceId, ...(sessionId ? { _id: sessionId } : {}), "status.transcribe": "done", "status.index": "done" });
    if (!session) return false;
    const turns = await collection<Turns>("turns", tenantId).find({ sessionId: session._id }).toArray();
    const page = await collection<SessionPages>("session_pages", tenantId).findOne({ sessionId: session._id });
    const chunks = await collection<Chunks>("chunks", tenantId).find({ sourceRef: session._id }).toArray();
    const claims = await collection<Claims>("claims", tenantId).find({ "evidence.sessionId": session._id }).toArray();
    const tree = await collection<TreeIndexRootDocument & { _id: string }>("tree_index", tenantId).findOne({ node_id: `tenant:${tenantId}` });
    const turnIds = new Set(turns.map((turn) => turn._id));
    return turns.length === turnCount && turns.every((turn) => typeof turn.text === "string" && turn.text.trim() &&
      Number.isFinite(turn.tStart) && Number.isFinite(turn.tEnd) && turn.tEnd > turn.tStart) &&
      Boolean(page && typeof page.summary === "string" && page.summary.trim() && Array.isArray(page.evidence) &&
        page.evidence.length && page.evidence.every((entry) => entry.sessionId === sessionId && turnIds.has(entry.turnId))) &&
      // verifyIndexGeneration already certifies exact vectorless lexical chunks or legacy
      // vector chunks under the current manifest; do not require vectors for both modes.
      chunks.length > 0 && chunks.every((chunk) => Array.isArray(chunk.turnRefs) && chunk.turnRefs.length && chunk.turnRefs.every((id) => turnIds.has(id))) &&
      new Set(chunks.flatMap(chunk => chunk.turnRefs)).size === turnIds.size &&
      claims.every(claim => Array.isArray(claim.evidence) && claim.evidence.some(entry => entry.sessionId === sessionId) &&
        claim.evidence.filter(entry => entry.sessionId === sessionId).every(entry => turnIds.has(entry.turnId))) &&
      connectorTreeContainsSession(tree, sessionId);
  }
  async function consumed(tenantId: string, sourceId: string, sessionId?: string): Promise<boolean> {
    const source = await collection<Sources>("sources", tenantId).findOne({ _id: sourceId });
    const metadata = source?.sourceMeta;
    const proof = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).connectorIndex : null;
    if (!proof || typeof proof !== "object") return false;
    const receipt = proof as Record<string, unknown>;
    if (receipt.version !== 2 || receipt.complete !== true || receipt.treeWritten !== true ||
        typeof receipt.strict !== "boolean" ||
        !Number.isInteger(receipt.turnCount) || Number(receipt.turnCount) < 1 || typeof receipt.generation !== "string" || !receipt.generation ||
        typeof receipt.sessionId !== "string" || !receipt.sessionId || (sessionId && sessionId !== receipt.sessionId)) return false;
    return artifacts(tenantId, sourceId, receipt.sessionId, Number(receipt.turnCount), receipt.generation);
  }
  return {
    assertWritableTenant(tenantId) { collection<Gaps>("gaps", tenantId); },
    listGaps: async (tenantId, afterId) => collection<Gaps>("gaps", tenantId).find({ kind: { $in: ["recording-pending", "source-pending"] }, ...(afterId ? { _id: { $gt: afterId } } : {}) }).sort({ _id: 1 }).limit(251).toArray(),
    findGap: async (tenantId, id) => collection<Gaps>("gaps", tenantId).findOne({ _id: id }),
    async createGap(tenantId, doc) {
      const saved = await collection<Gaps>("gaps", tenantId).insertOne(doc);
      if (saved.acknowledged !== true) throw new ConnectorWorkflowError(503, "gap_write_unconfirmed");
    },
    async transitionGap(tenantId, id, from, to, sourceRef) {
      const result = await collection<Gaps>("gaps", tenantId).updateOne(
        { _id: id, kind: "recording-pending", status: from }, { $set: { status: to, ...(sourceRef ? { sourceRef } : {}) } },
      );
      return result.matchedCount === 1;
    },
    findSource: async (tenantId, id) => collection<Sources>("sources", tenantId).findOne({ _id: id }),
    hasConsumedSource: consumed,
    async recordConsumedSource(tenantId, sourceId, sessionId, result) {
      assertConnectorIndexConsumed(result, sessionId);
      if (!await artifacts(tenantId, sourceId, sessionId, result.completion!.turnCount, result.completion!.generation)) return false;
      const saved = await collection<Sources>("sources", tenantId).updateOne({ _id: sourceId }, {
        $set: { "sourceMeta.connectorIndex": { ...result.completion, sessionId } },
      });
      return saved.matchedCount === 1;
    },
    async hasConsumedRecording(tenantId, sourceId) {
      const source = await collection<Sources>("sources", tenantId).findOne({ _id: sourceId });
      if (!source || !isConnectorRecordingSource(source)) return false;
      const media = await collection<Media>("media", tenantId).findOne({ sourceRef: sourceId, kind: { $in: ["recording", "audio", "video", "evidence-clip"] } });
      if (!media) return false;
      return consumed(tenantId, sourceId);
    },
    async recordingSession(tenantId, sourceId) {
      const source = await collection<Sources>("sources", tenantId).findOne({ _id: sourceId });
      if (!source || !isConnectorRecordingSource(source)) return null;
      const media = await collection<Media>("media", tenantId).findOne({ sourceRef: sourceId, kind: { $in: ["recording", "audio", "video", "evidence-clip"] } });
      if (!media) return null;
      const matches = await collection<Sessions>("sessions", tenantId).find({ sourceId, "status.transcribe": "done" }).limit(2).toArray();
      if (matches.length !== 1) return null;
      const sessionId = matches[0]!._id;
      const turns = await collection<Turns>("turns", tenantId).find({ sessionId }).toArray();
      return turns.length && turns.every((turn) => typeof turn.text === "string" && turn.text.trim() &&
        Number.isFinite(turn.tStart) && Number.isFinite(turn.tEnd) && turn.tEnd > turn.tStart) ? sessionId : null;
    },
    async resolveWatchedFailures(tenantId, watchedSourceId, sourceRef) {
      const coll = collection<Gaps>("gaps", tenantId);
      const failures = await coll.find({ kind: "source-pending", status: "open", watchedSourceRef: watchedSourceId }).toArray();
      for (const gap of failures) {
        await coll.updateOne({ _id: gap._id, kind: "source-pending", status: "open", watchedSourceRef: watchedSourceId }, { $set: { status: "received", sourceRef } });
      }
    },
    async resolveIntakeFailures(tenantId, sourceUrlHash, sourceRef) {
      const coll = collection<Gaps>("gaps", tenantId);
      const failures = await coll.find({ kind: "source-pending", status: "open", sourceUrlHash }).toArray();
      for (const gap of failures) {
        await coll.updateOne({ _id: gap._id, kind: "source-pending", status: "open", sourceUrlHash }, { $set: { status: "received", sourceRef } });
      }
    },
    async resolveRecordingFailures(tenantId, sourceRef) {
      const coll = collection<Gaps>("gaps", tenantId);
      const filter = { kind: "source-pending" as const, status: "open" as const, sourceRef, description: "Connector action required: recording-verification-failed" };
      const failures = await coll.find(filter).toArray();
      for (const gap of failures) await coll.updateOne({ ...filter, _id: gap._id }, { $set: { status: "received" } });
    },
    async resolveSourceJobFailure(tenantId, jobId, sourceRef) {
      const id = `source-job-${jobId}`, coll = collection<Gaps>("gaps", tenantId);
      const gap = await coll.findOne({ _id: id, kind: "source-pending" });
      if (!gap || (gap.status === "received" && gap.sourceRef === sourceRef)) return true;
      if (gap.status !== "open") return false;
      const result = await coll.updateOne({ _id: id, kind: "source-pending", status: "open" }, { $set: { status: "received", sourceRef } });
      return result.matchedCount === 1;
    },
    async reopenSourceJobFailure(tenantId, jobId) {
      const coll = collection<Gaps>("gaps", tenantId), id = `source-job-${jobId}`;
      const result = await coll.updateOne({ _id: id, kind: "source-pending", status: "received" }, { $set: { status: "open" } });
      if (result.matchedCount === 1) return true;
      return Boolean(await coll.findOne({ _id: id, kind: "source-pending", status: "open" }));
    },
    listWatched: async (tenantId) => collection<WatchedSources>("watched_sources", tenantId).find({ active: true }).toArray(),
    async recordFetch(tenantId, id, previousHash, lastFetch) {
      const previous = previousHash === null ? { lastFetch: { $exists: false } } : { "lastFetch.hash": previousHash };
      const result = await collection<WatchedSources>("watched_sources", tenantId).updateOne(
        { _id: id, active: true, ...previous }, { $set: { lastFetch } },
      );
      return result.matchedCount === 1;
    },
  };
}
