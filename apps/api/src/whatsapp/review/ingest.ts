/** Production ingest wiring: raw source material is stored, candidates are proposed, and nothing is indexed as trusted. */
import type { Db } from "mongodb";
import type { Sources, Sessions, Turns } from "@lkb/core";
import { withTenant } from "@lkb/db";
import type { WhatsAppGroup, WhatsAppRouteDeps } from "../../routes/whatsapp.js";
import { WhatsAppAmbiguousLinkError, WhatsAppGroupNotFoundError, type WhatsAppResolveScope } from "../owner-config.js";
import { detectWhatsAppReviewCandidates, type KnownWhatsAppContent } from "./detection.js";
import { sha256Hex } from "../../hash.js";
import { invalidateStaleWhatsAppCandidates, SnapshotShrinkError, WHATSAPP_REVIEW_LOG, whatsAppLogId } from "./invalidate.js";
import type { WhatsAppReviewRepository } from "./store.js";
import { emitBestEffort, type EventSink } from "../links/events-router.js";

export interface ReviewIngestOptions { base: WhatsAppRouteDeps; appDb: () => Db; repository: WhatsAppReviewRepository; now?: () => string;
  /** Share of stored messages one snapshot may delete (default 0.5). */
  maxDeleteFraction?: number;
  /** W12 (R-38): `candidate.created` sink; best effort, absent = no event. */
  appendEvent?: EventSink;
  /** Runs one upstream ingest and reports the message ids of the authoritative fetched snapshot (undefined = unknown, fails closed). */
  withSnapshot: <T>(run: () => Promise<T>) => Promise<{ value: T; messageIds: ReadonlySet<string> | undefined }>;
}

/** `base` MUST be built without an indexer: indexSession would write claims, chunks and tree material before review. */
export type ReviewedWhatsAppDeps = WhatsAppRouteDeps & {
  /** Operator-only path (not reachable from the route): bypasses the shrink guard after a human confirmed the deletion. */
  forceIngestGroup: WhatsAppRouteDeps["ingestGroup"];
};
export function createReviewedWhatsAppDeps(options: ReviewIngestOptions): ReviewedWhatsAppDeps {
  const now = options.now ?? (() => new Date().toISOString());
  const run = async (tenantId: string, groupJid: string, force: boolean, scope?: WhatsAppResolveScope) => {
      // Authorize and resolve FIRST: the marker (and so any later repair) exists only for a group the caller may ingest, under the link that was
      // actually resolved here -- never the caller-supplied linkId. A rejected ingest (not found, ambiguous, not configured) leaves nothing behind.
      const found = new Map<string, WhatsAppGroup>();
      for (const group of await options.base.listGroups(tenantId, scope)) if (group.groupJid === groupJid) found.set(`${group.linkId ?? ""}|${group.ownerUserId ?? ""}`, group);
      if (found.size === 0) throw new WhatsAppGroupNotFoundError(groupJid);
      if (found.size > 1) throw new WhatsAppAmbiguousLinkError();
      const resolved = [...found.values()][0]!.linkId;
      const resolvedLinkId = typeof resolved === "string" && resolved.length > 0 ? resolved : null;
      const resolvedScope: WhatsAppResolveScope = { ...(scope ?? {}), ...(resolvedLinkId ? { linkId: resolvedLinkId } : {}) };
      const db = options.appDb();
      // Durable marker written BEFORE any raw write: if this run dies before invalidation completes, the marker survives
      // and repairPendingWhatsAppInvalidations / the next ingest finishes the job (ISS-WA-REVIEW-WIRE-002). Keyed by (group, resolved link) so two
      // owners sharing a jid in one tenant never share a marker; a linkless (legacy) ingest keeps the group-only key and clears any stale link.
      const markerId = whatsAppLogId(tenantId, "pending-invalidation", groupJid, ...(resolvedLinkId ? [resolvedLinkId] : []));
      await db.collection(WHATSAPP_REVIEW_LOG).updateOne({ _id: markerId, tenantId } as never,
        { $set: { kind: "pending-invalidation", groupJid, at: now(), ...(resolvedLinkId ? { linkId: resolvedLinkId } : {}) }, ...(resolvedLinkId ? {} : { $unset: { linkId: "" } }) } as never, { upsert: true });
      const { value: result, messageIds } = await options.withSnapshot(() => options.base.ingestGroup(tenantId, groupJid, resolvedScope));
      if (!messageIds) throw new Error("WhatsApp review: upstream snapshot unavailable; deletions cannot be verified");
      const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: result.sourceId }));
      const session = await db.collection<Sessions>("sessions").findOne(withTenant<Sessions>(tenantId, { _id: result.sessionId }));
      if (!source || !session) throw new Error("WhatsApp review: ingested source/session unavailable");
      // Edited/removed source turns must lose trust before new proposals are made.
      const presentTurnIds = new Set([...messageIds].map(id => sha256Hex(`${result.sessionId}:${id}`)));
      try {
        await invalidateStaleWhatsAppCandidates(db, tenantId, source._id, { sessionId: result.sessionId, presentTurnIds, at: now(),
          force, ...(options.maxDeleteFraction !== undefined ? { maxDeleteFraction: options.maxDeleteFraction } : {}) });
      } catch (error) {
        if (error instanceof SnapshotShrinkError) { // durable log + loud alert; nothing was deleted, the pending marker stays
          console.error(`ALERT whatsapp-review: ${error.message} (tenant ${tenantId}, group ${groupJid})`);
          await db.collection(WHATSAPP_REVIEW_LOG).updateOne({ _id: whatsAppLogId(tenantId, "snapshot-refused", groupJid, now()), tenantId } as never,
            { $set: { kind: "snapshot-refused", groupJid, stored: error.stored, absent: error.absent, snapshotSize: error.snapshotSize, at: now() } } as never, { upsert: true });
        }
        throw error;
      }
      await db.collection(WHATSAPP_REVIEW_LOG).deleteOne({ _id: markerId, tenantId } as never);
      // Loaded only AFTER upstream-deleted turns are gone, so a deleted message can never be re-proposed.
      const turns = (await db.collection<Turns>("turns").find(withTenant<Turns>(tenantId, { sessionId: result.sessionId })).toArray())
        .filter(turn => turn.tenantId === tenantId).sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id));
      const claims = await db.collection<{ _id: string; tenantId: string; text: string; evidence?: { sessionId?: string }[] }>("claims")
        .find(withTenant(tenantId, {})).toArray();
      // R-28: another owner's capture of the same message in this tenant is "existing same-tenant knowledge" too. Their candidate is only
      // POINTED at (its id), never merged or dropped; earliest capture wins the pointer. Ids are opaque and the pointer is not readable by a non-owner.
      const otherCandidates = (await db.collection<{ _id: string; tenantId: string; sessionId: string; status: string; text: string; createdAt?: string }>("whatsapp_candidates")
        .find(withTenant(tenantId, {})).toArray())
        .filter(c => c.tenantId === tenantId && c.sessionId !== result.sessionId && (c.status === "needs-review" || c.status === "approved") && typeof c.text === "string" && c.text.trim())
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) || b._id.localeCompare(a._id));
      const knownContent: KnownWhatsAppContent[] = [
        ...claims.filter(c => c.tenantId === tenantId && !c.evidence?.some(e => e.sessionId === result.sessionId)).map(c => ({ tenantId, id: c._id, text: c.text })),
        ...otherCandidates.map(c => ({ tenantId, id: c._id, text: c.text })),
      ];
      const candidates = detectWhatsAppReviewCandidates(tenantId, { source, session, turns, knownContent }, now());
      const created = await options.repository.insert(tenantId, candidates);
      if (created > 0) await emitBestEffort(options.appendEvent, tenantId, { eventType: "candidate.created", actorKind: "system", ...(resolvedLinkId ? { linkId: resolvedLinkId } : {}), data: { count: created } });
      return result;
  };
  return { listGroups: options.base.listGroups, ingestGroup: (tenantId, groupJid, scope) => run(tenantId, groupJid, false, scope),
    forceIngestGroup: (tenantId, groupJid, scope) => run(tenantId, groupJid, true, scope) };
}
