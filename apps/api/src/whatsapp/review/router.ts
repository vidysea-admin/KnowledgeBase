/** Standalone authenticated review routes. Integration must enforce quarantine before mounting.
 * W7 (R-26, R-27, R-29, R-30): every route is owner-or-admin. The candidate's source is resolved to its link; the link's owner (a session whose userId
 * matches) or an admin (`whatsapp-admin`) is let through, everyone else -- another member, a viewer, a plain key, a legacy link, another tenant -- gets the
 * same 404 as a candidate that does not exist, before any evidence is read. An admin reading someone else's raw content writes an `admin.raw_read` event
 * first; if that write fails the read is refused. The recorded decision actor is `actorId` plus the link id.
 * W12 (R-38): the one decision that wins the transition writes `candidate.approved` / `candidate.rejected` (candidate id only, best effort after the commit). */
import { Router, type Request, type Response } from "express";
import { requireScope, isValidTenantId } from "../../auth.js";
import { actorBase, auditWho, callerOf, type WhatsAppRawAccess, type WhatsAppRawDecision } from "../owner-config.js";
import { emitBestEffort, type EventSink } from "../links/events-router.js";
import { isWhatsAppReviewId, type WhatsAppReviewAction, type WhatsAppReviewRepository } from "./store.js";

export const reviewActor = (base: string, linkId: string | null): string => linkId ? `${base}@link:${linkId}` : base;
export type Allowed = Extract<WhatsAppRawDecision, { allowed: true }>;

export function createWhatsAppReviewRouter(repository: WhatsAppReviewRepository, access: WhatsAppRawAccess, appendEvent?: EventSink): Router {
  const router = Router();
  router.use("/whatsapp/review", requireScope("whatsapp"), (req, res, next) => {
    if (!isValidTenantId(req.auth?.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; }
    next();
  });
  /** Authorizes one candidate id for the caller and (for an admin reading another person's content) records the read. Null = respond 404. */
  async function authorize(req: Request, id: string, audit: boolean): Promise<Allowed | null> {
    const decision = await access.forCandidate(req.auth!.tenantId, id, callerOf(req));
    if (!decision.allowed) return null;
    if (audit && !decision.ownerView) {
      const who = auditWho(req);
      if (!who) return null;
      await access.auditAdminRead(req.auth!.tenantId, who, { linkId: decision.linkId, candidateId: id });
    }
    return decision;
  }
  router.get("/whatsapp/review", async (req: Request, res: Response) => {
    try {
      const tenantId = req.auth!.tenantId, caller = callerOf(req), bySource = new Map<string, WhatsAppRawDecision>();
      const visible = [];
      for (const candidate of await repository.list(tenantId)) {
        let decision = bySource.get(candidate.sourceId);
        if (!decision) { decision = await access.forSource(tenantId, candidate.sourceId, caller); bySource.set(candidate.sourceId, decision); }
        if (decision.allowed) visible.push({ candidate, decision });
      }
      // One audit event per foreign link read, counting candidates; written before anything is returned.
      const foreign = new Map<string | null, number>();
      for (const { decision } of visible) if (!decision.ownerView) foreign.set(decision.linkId, (foreign.get(decision.linkId) ?? 0) + 1);
      if (foreign.size) {
        const who = auditWho(req);
        if (!who) { res.status(200).json({ candidates: [] }); return; }
        for (const [linkId, count] of foreign) await access.auditAdminRead(tenantId, who, { linkId, count });
      }
      res.status(200).json({ candidates: visible.map(v => v.candidate) });
    }
    catch { res.status(502).json({ error: "review_evidence_unavailable" }); }
  });
  router.get("/whatsapp/review/:id", async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!isWhatsAppReviewId(id)) { res.status(404).json({ error: "not_found" }); return; }
    try {
      if (!await authorize(req, id, true)) { res.status(404).json({ error: "not_found" }); return; }
      const candidate = await repository.get(req.auth!.tenantId, id);
      if (!candidate) { res.status(404).json({ error: "not_found" }); return; }
      res.status(200).json({ candidate });
    } catch { res.status(502).json({ error: "review_evidence_unavailable" }); }
  });
  for (const [verb, action] of [["approve", "approved"], ["reject", "rejected"]] as const) {
    router.post(`/whatsapp/review/:id/${verb}`, async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!isWhatsAppReviewId(id)) { res.status(404).json({ error: "not_found" }); return; }
      if (req.body !== undefined && (req.body === null || typeof req.body !== "object"
          || Array.isArray(req.body) || Object.keys(req.body).length !== 0)) {
        res.status(400).json({ error: "bad_request", message: "Review decisions accept only an empty body" }); return;
      }
      try {
        // Authority first: a non-owner learns nothing from the body check order above either way (400 is input-only), and never reaches the repository.
        const allowed = await authorize(req, id, false);
        const base = actorBase(req);
        if (!allowed || !base) { res.status(404).json({ error: "not_found" }); return; }
        const result = await repository.decide(req.auth!.tenantId, id, action as WhatsAppReviewAction, reviewActor(base, allowed.linkId));
        if (result.result === "not_found") { res.status(404).json({ error: "not_found" }); return; }
        if (result.result === "publish_unavailable") { res.status(503).json({ error: "publish_unavailable" }); return; }
        if (result.result !== "ok") { res.status(409).json({ error: result.result }); return; }
        if (result.changed) await emitBestEffort(appendEvent, req.auth!.tenantId, { eventType: action === "approved" ? "candidate.approved" : "candidate.rejected",
          actorKind: req.auth?.principal === "session" ? "user" : "key", actorId: base, ...(allowed.linkId ? { linkId: allowed.linkId } : {}), data: { candidateId: id } });
        res.status(200).json({ candidate: result.candidate, changed: result.changed });
      } catch {
        res.status(502).json({ error: "review_failed", message: "Review decision was not confirmed; retry to verify its state" });
      }
    });
  }
  return router;
}
