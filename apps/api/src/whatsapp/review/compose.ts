/**
 * Composition for T-007 WhatsApp review. Built by apps/api/src/composition/integrations/knowledge.ts and mounted by composition/integrations/routes.ts
 * (`app.use(deps.whatsappReview)`, after the auth middleware). The review router is owner-or-admin (W7): it needs the raw-access authority
 * from `createWhatsAppRawAccess` (owner-config.ts), supplied as `options.access` (default: built from the app db).
 * Do not mount before every trusted reader excludes unapproved WhatsApp content (see auditWhatsAppQuarantine).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "mongodb";
import type { Router } from "express";
import { getDb, whatsAppLinkStores } from "@lkb/db";
import type { WhatsAppRouteDeps } from "../../routes/whatsapp.js";
import { createMongoWhatsAppDeps, fetchWhatsAppMessages, type WhatsAppStoreOptions } from "../store.js";
import { createWhatsAppRawAccess, WhatsAppAmbiguousLinkError, WhatsAppGroupNotFoundError, type WhatsAppRawAccess } from "../owner-config.js";
import type { EventSink } from "../links/events-router.js";
import { createReviewedWhatsAppDeps } from "./ingest.js";
import { WHATSAPP_REVIEW_LOG } from "./invalidate.js";
import { materializeWhatsAppClaim } from "./materializer.js";
import { createWhatsAppReviewRouter } from "./router.js";
import { createMongoWhatsAppReviewRepository, type WhatsAppReviewRepository } from "./store.js";

const LINK_ID = /^[0-9a-f]{24}$/;

export interface WhatsAppReviewWiring {
  whatsapp: WhatsAppRouteDeps; reviewRouter: Router; repository: WhatsAppReviewRepository;
  /** Re-runs ingest (and so invalidation) for every group whose previous run died before invalidation finished. Returns the groups repaired. */
  repairPendingInvalidations(tenantId: string): Promise<string[]>;
  /** Operator-only: ingest bypassing the upstream-shrink guard after a human confirmed a mass deletion. Never wire to a route. */
  forceIngestGroup: WhatsAppRouteDeps["ingestGroup"];
}

export function createWhatsAppReviewWiring(options: WhatsAppStoreOptions & { now?: () => string; maxDeleteFraction?: number; access?: WhatsAppRawAccess; appendEvent?: EventSink }): WhatsAppReviewWiring {
  const appDb: () => Db = options.appDb ?? getDb;
  // W12 (R-38): candidate events go to the append-only whatsapp_events by default (best effort, tenant-scoped by the accessor).
  const appendEvent: EventSink = options.appendEvent ?? (async (tenantId, event) => { await whatsAppLinkStores(appDb()).events(tenantId).insert(event); });
  const repository = createMongoWhatsAppReviewRepository(appDb(), { materialize: materializeWhatsAppClaim, ...(options.now ? { now: options.now } : {}) });
  // No indexer is passed: WhatsApp content reaches claims only through per-candidate approval.
  // The fetched snapshot is the authority for upstream deletions; capture it per ingest call without touching the base store.
  const snapshot = new AsyncLocalStorage<{ ids?: Set<string> }>();
  const rawFetch = options.fetchMessages ?? fetchWhatsAppMessages;
  const fetchMessages: typeof rawFetch = async (groupJid, owner) => {
    const messages = await rawFetch(groupJid, owner);
    const store = snapshot.getStore();
    if (store) store.ids = new Set(messages.map(m => String(m.messageId)));
    return messages;
  };
  const base = createMongoWhatsAppDeps(undefined, { ...options, appDb, fetchMessages });
  const reviewed = createReviewedWhatsAppDeps({ base, appDb, repository, appendEvent, ...(options.now ? { now: options.now } : {}), ...(options.maxDeleteFraction !== undefined ? { maxDeleteFraction: options.maxDeleteFraction } : {}),
    async withSnapshot(run) { const store: { ids?: Set<string> } = {}; const value = await snapshot.run(store, run); return { value, messageIds: store.ids }; } });
  return {
    whatsapp: { listGroups: reviewed.listGroups, ingestGroup: reviewed.ingestGroup }, forceIngestGroup: reviewed.forceIngestGroup,
    reviewRouter: createWhatsAppReviewRouter(repository, options.access ?? createWhatsAppRawAccess(appDb()), appendEvent), repository,
    async repairPendingInvalidations(tenantId) {
      const log = appDb().collection<{ _id: string; groupJid: string; tenantId: string; linkId?: unknown }>(WHATSAPP_REVIEW_LOG);
      const markers = await log.find({ tenantId, kind: "pending-invalidation" } as never).toArray();
      const repaired: string[] = [];
      // Internal system caller (never reachable from a route): an admin-equivalent key, narrowed to the link the marker recorded when it has one.
      // The ingest authorizes and resolves the group against the tenant's ACTIVE links before it writes anything, so a marker naming a link that
      // is not (or no longer) permitted can ingest nothing. A marker that is ambiguous, not found or carries a malformed link id stays pending
      // (it needs an operator) and is recorded on the marker row; it never stops the other markers of the tenant from being repaired.
      for (const marker of markers) {
        const skip = async (reason: string) => { await log.updateOne({ _id: marker._id, tenantId } as never, { $set: { lastRepairSkipped: reason, lastRepairAt: new Date().toISOString() } } as never); };
        if (marker.linkId !== undefined && (typeof marker.linkId !== "string" || !LINK_ID.test(marker.linkId))) { await skip("invalid_link_id"); continue; }
        try { await reviewed.ingestGroup(tenantId, marker.groupJid, { caller: { kind: "key", admin: true }, ...(marker.linkId ? { linkId: marker.linkId as string } : {}) }); }
        catch (error) {
          if (error instanceof WhatsAppAmbiguousLinkError) { await skip("ambiguous_link"); continue; }
          if (error instanceof WhatsAppGroupNotFoundError) { await skip("not_found"); continue; }
          throw error;
        }
        await log.deleteOne({ _id: marker._id, tenantId } as never); // a marker written under an older key shape is cleared by its own id
        repaired.push(marker.groupJid);
      }
      return repaired;
    },
  };
}
