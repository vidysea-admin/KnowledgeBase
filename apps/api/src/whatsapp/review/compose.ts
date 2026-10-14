/**
 * Composition for T-007 WhatsApp review. NOT mounted by this unit.
 * Integrator (two one-line edits, outside this lane's allowed paths):
 *   apps/api/src/composition/production.ts line ~232:
 *     whatsapp: createWhatsAppReviewWiring({ resolveOwner: createConfiguredWhatsAppOwnerResolver(process.env.WHATSAPP_TENANT_OWNER_MAP) }).whatsapp,
 *   apps/api/src/server.ts, directly after `app.use(createWhatsAppRouter(deps.whatsapp));` and AFTER auth middleware:
 *     app.use(deps.whatsappReview);   // the wiring's `reviewRouter`, carried on the deps object
 * Do not mount before every trusted reader excludes unapproved WhatsApp content (see auditWhatsAppQuarantine).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "mongodb";
import type { Router } from "express";
import { getDb } from "@lkb/db";
import type { WhatsAppRouteDeps } from "../../routes/whatsapp.js";
import { createMongoWhatsAppDeps, fetchWhatsAppMessages, type WhatsAppStoreOptions } from "../store.js";
import { createReviewedWhatsAppDeps } from "./ingest.js";
import { WHATSAPP_REVIEW_LOG } from "./invalidate.js";
import { materializeWhatsAppClaim } from "./materializer.js";
import { createWhatsAppReviewRouter } from "./router.js";
import { createMongoWhatsAppReviewRepository, type WhatsAppReviewRepository } from "./store.js";

export interface WhatsAppReviewWiring {
  whatsapp: WhatsAppRouteDeps; reviewRouter: Router; repository: WhatsAppReviewRepository;
  /** Re-runs ingest (and so invalidation) for every group whose previous run died before invalidation finished. Returns the groups repaired. */
  repairPendingInvalidations(tenantId: string): Promise<string[]>;
}

export function createWhatsAppReviewWiring(options: WhatsAppStoreOptions & { now?: () => string }): WhatsAppReviewWiring {
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
  const whatsapp = createReviewedWhatsAppDeps({ base, appDb, repository, ...(options.now ? { now: options.now } : {}),
    async withSnapshot(run) { const store: { ids?: Set<string> } = {}; const value = await snapshot.run(store, run); return { value, messageIds: store.ids }; } });
  return {
    whatsapp, reviewRouter: createWhatsAppReviewRouter(repository), repository,
    async repairPendingInvalidations(tenantId) {
      const markers = await appDb().collection<{ groupJid: string; tenantId: string }>(WHATSAPP_REVIEW_LOG)
        .find({ tenantId, kind: "pending-invalidation" } as never).toArray();
      const repaired: string[] = [];
      for (const marker of markers) { await whatsapp.ingestGroup(tenantId, marker.groupJid); repaired.push(marker.groupJid); }
      return repaired;
    },
  };
}
