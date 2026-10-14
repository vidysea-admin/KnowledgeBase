/**
 * Composition for T-007 WhatsApp review. NOT mounted by this unit.
 * Integrator (two one-line edits, outside this lane's allowed paths):
 *   apps/api/src/composition/production.ts line ~232:
 *     whatsapp: createWhatsAppReviewWiring({ resolveOwner: createConfiguredWhatsAppOwnerResolver(process.env.WHATSAPP_TENANT_OWNER_MAP) }).whatsapp,
 *   apps/api/src/server.ts, directly after `app.use(createWhatsAppRouter(deps.whatsapp));` and AFTER auth middleware:
 *     app.use(deps.whatsappReview);   // the wiring's `reviewRouter`, carried on the deps object
 * Do not mount before every trusted reader excludes unapproved WhatsApp content (see auditWhatsAppQuarantine).
 */
import type { Db } from "mongodb";
import type { Router } from "express";
import { getDb } from "@lkb/db";
import type { WhatsAppRouteDeps } from "../../routes/whatsapp.js";
import { createMongoWhatsAppDeps, type WhatsAppStoreOptions } from "../store.js";
import { createReviewedWhatsAppDeps } from "./ingest.js";
import { materializeWhatsAppClaim } from "./materializer.js";
import { createWhatsAppReviewRouter } from "./router.js";
import { createMongoWhatsAppReviewRepository, type WhatsAppReviewRepository } from "./store.js";

export interface WhatsAppReviewWiring { whatsapp: WhatsAppRouteDeps; reviewRouter: Router; repository: WhatsAppReviewRepository }

export function createWhatsAppReviewWiring(options: WhatsAppStoreOptions & { now?: () => string }): WhatsAppReviewWiring {
  const appDb: () => Db = options.appDb ?? getDb;
  const repository = createMongoWhatsAppReviewRepository(appDb(), { materialize: materializeWhatsAppClaim, ...(options.now ? { now: options.now } : {}) });
  // No indexer is passed: WhatsApp content reaches claims only through per-candidate approval.
  const base = createMongoWhatsAppDeps(undefined, { ...options, appDb });
  return {
    whatsapp: createReviewedWhatsAppDeps({ base, appDb, repository, ...(options.now ? { now: options.now } : {}) }),
    reviewRouter: createWhatsAppReviewRouter(repository),
    repository,
  };
}
