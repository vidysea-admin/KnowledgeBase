/**
 * Composition for T-007 WhatsApp review. Built by apps/api/src/composition/integrations/knowledge.ts and mounted by composition/integrations/routes.ts
 * (`app.use(deps.whatsappReview)`, after the auth middleware). The review router is owner-or-admin (W7): it needs the raw-access authority
 * from `createWhatsAppRawAccess` (owner-config.ts), supplied as `options.access` (default: built from the app db).
 * Do not mount before every trusted reader excludes unapproved WhatsApp content (see auditWhatsAppQuarantine).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "mongodb";
import type { Router } from "express";
import { getDb } from "@lkb/db";
import type { WhatsAppRouteDeps } from "../../routes/whatsapp.js";
import { createMongoWhatsAppDeps, fetchWhatsAppMessages, type WhatsAppStoreOptions } from "../store.js";
import { createWhatsAppRawAccess, WhatsAppAmbiguousLinkError, type WhatsAppRawAccess } from "../owner-config.js";
import { createReviewedWhatsAppDeps } from "./ingest.js";
import { WHATSAPP_REVIEW_LOG } from "./invalidate.js";
import { materializeWhatsAppClaim } from "./materializer.js";
import { createWhatsAppReviewRouter } from "./router.js";
import { createMongoWhatsAppReviewRepository, type WhatsAppReviewRepository } from "./store.js";

export interface WhatsAppReviewWiring {
  whatsapp: WhatsAppRouteDeps; reviewRouter: Router; repository: WhatsAppReviewRepository;
  /** Re-runs ingest (and so invalidation) for every group whose previous run died before invalidation finished. Returns the groups repaired. */
  repairPendingInvalidations(tenantId: string): Promise<string[]>;
  /** Operator-only: ingest bypassing the upstream-shrink guard after a human confirmed a mass deletion. Never wire to a route. */
  forceIngestGroup: WhatsAppRouteDeps["ingestGroup"];
}

export function createWhatsAppReviewWiring(options: WhatsAppStoreOptions & { now?: () => string; maxDeleteFraction?: number; access?: WhatsAppRawAccess }): WhatsAppReviewWiring {
  const appDb: () => Db = options.appDb ?? getDb;
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
  const reviewed = createReviewedWhatsAppDeps({ base, appDb, repository, ...(options.now ? { now: options.now } : {}), ...(options.maxDeleteFraction !== undefined ? { maxDeleteFraction: options.maxDeleteFraction } : {}),
    async withSnapshot(run) { const store: { ids?: Set<string> } = {}; const value = await snapshot.run(store, run); return { value, messageIds: store.ids }; } });
  return {
    whatsapp: { listGroups: reviewed.listGroups, ingestGroup: reviewed.ingestGroup }, forceIngestGroup: reviewed.forceIngestGroup,
    reviewRouter: createWhatsAppReviewRouter(repository, options.access ?? createWhatsAppRawAccess(appDb())), repository,
    async repairPendingInvalidations(tenantId) {
      const markers = await appDb().collection<{ groupJid: string; tenantId: string; linkId?: string }>(WHATSAPP_REVIEW_LOG)
        .find({ tenantId, kind: "pending-invalidation" } as never).toArray();
      const repaired: string[] = [];
      // Internal system caller (never reachable from a route): an admin-equivalent key, narrowed to the link the marker recorded when it has one.
      // A marker whose group is still ambiguous across links stays pending (it needs an operator), instead of repairing the wrong owner's data.
      for (const marker of markers) {
        try { await reviewed.ingestGroup(tenantId, marker.groupJid, { caller: { kind: "key", admin: true }, ...(marker.linkId ? { linkId: marker.linkId } : {}) }); }
        catch (error) { if (error instanceof WhatsAppAmbiguousLinkError) continue; throw error; }
        repaired.push(marker.groupJid);
      }
      return repaired;
    },
  };
}
