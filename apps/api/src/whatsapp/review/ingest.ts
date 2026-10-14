/** Production ingest wiring: raw source material is stored, candidates are proposed, and nothing is indexed as trusted. */
import type { Db } from "mongodb";
import type { Sources, Sessions, Turns } from "@lkb/core";
import { withTenant } from "@lkb/db";
import type { WhatsAppRouteDeps } from "../../routes/whatsapp.js";
import { detectWhatsAppReviewCandidates, type KnownWhatsAppContent } from "./detection.js";
import { invalidateStaleWhatsAppCandidates } from "./invalidate.js";
import type { WhatsAppReviewRepository } from "./store.js";

export interface ReviewIngestOptions { base: WhatsAppRouteDeps; appDb: () => Db; repository: WhatsAppReviewRepository; now?: () => string }

/** `base` MUST be built without an indexer: indexSession would write claims, chunks and tree material before review. */
export function createReviewedWhatsAppDeps(options: ReviewIngestOptions): WhatsAppRouteDeps {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    listGroups: options.base.listGroups,
    async ingestGroup(tenantId, groupJid) {
      const result = await options.base.ingestGroup(tenantId, groupJid);
      const db = options.appDb();
      const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: result.sourceId }));
      const session = await db.collection<Sessions>("sessions").findOne(withTenant<Sessions>(tenantId, { _id: result.sessionId }));
      if (!source || !session) throw new Error("WhatsApp review: ingested source/session unavailable");
      const turns = (await db.collection<Turns>("turns").find(withTenant<Turns>(tenantId, { sessionId: result.sessionId })).toArray())
        .filter(turn => turn.tenantId === tenantId).sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id));
      // Edited/removed source turns must lose trust before new proposals are made.
      await invalidateStaleWhatsAppCandidates(db, tenantId, source._id);
      const claims = await db.collection<{ _id: string; tenantId: string; text: string; evidence?: { sessionId?: string }[] }>("claims")
        .find(withTenant(tenantId, {})).toArray();
      const knownContent: KnownWhatsAppContent[] = claims
        .filter(c => c.tenantId === tenantId && !c.evidence?.some(e => e.sessionId === result.sessionId))
        .map(c => ({ tenantId, id: c._id, text: c.text }));
      const candidates = detectWhatsAppReviewCandidates(tenantId, { source, session, turns, knownContent }, now());
      await options.repository.insert(tenantId, candidates);
      return result;
    },
  };
}
