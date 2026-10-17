import { Router, type Request, type Response } from "express";
import { isValidTenantId } from "../auth.js";
import type { RelationshipPrincipal } from "../speaker-relations/router.js";
import { SpeakerAttributeError } from "./service.js";
import type { AttributeContext, AttributeProposal, AttributeReceipt, AttributeRow, SpeakerAttributeService } from "./types.js";

export interface SpeakerAttributesRouterDeps {
  service: SpeakerAttributeService;
  contextFor(principal: RelationshipPrincipal): Promise<AttributeContext | null>;
}
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const shape = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
function proposal(v: unknown): v is AttributeProposal {
  if (!shape(v, ["id", "personId", "field", "value", "evidence", "sourceRevisionDigest"]) || !id(v.id) || !id(v.personId) || !v.personId.startsWith("person:") ||
    !["org", "role"].includes(v.field as string) || typeof v.value !== "string" || !v.value.trim() || v.value.length > 300 || !sha(v.sourceRevisionDigest) ||
    !Array.isArray(v.evidence) || v.evidence.length < 1 || v.evidence.length > 20) return false;
  return v.evidence.every(e => shape(e, ["sessionId", "turnId", "quote", "transcriptHash", "speakerRef", "startTurnIndex", "endTurnIndex"]) &&
    id(e.sessionId) && id(e.turnId) && id(e.speakerRef) && typeof e.quote === "string" && !!e.quote.trim() && e.quote.length <= 12000 && sha(e.transcriptHash) &&
    Number.isSafeInteger(e.startTurnIndex) && (e.startTurnIndex as number) >= 0 && Number.isSafeInteger(e.endTurnIndex) && (e.endTurnIndex as number) >= (e.startTurnIndex as number));
}
const dto = (r: AttributeRow) => ({ id: r._id, personId: r.personId, field: r.field, value: r.value, revision: r.revision, status: r.status,
  sourceRevisionDigest: r.sourceRevisionDigest, evidence: r.evidence.map(e => ({ sessionId: e.sessionId, turnId: e.turnId, quote: e.quote,
    speakerRef: e.speakerRef, startTurnIndex: e.startTurnIndex, endTurnIndex: e.endTurnIndex })),
  ...(r.review ? { review: { decision: r.review.decision, at: r.review.at, baseRevision: r.review.baseRevision } } : {}) });
const receipt = (r: AttributeReceipt) => ({ id: r.id, revision: r.revision, status: r.status, replayed: r.replayed });
function error(res: Response, e: unknown): void {
  const code = e instanceof SpeakerAttributeError ? e.code : "unavailable";
  res.status({ forbidden: 403, invalid: 400, conflict: 409, unavailable: 503, not_found: 404 }[code]).json({ error: `speaker_attribute_${code}` });
}
export function createSpeakerAttributesRouter(deps: SpeakerAttributesRouterDeps): Router {
  const router = Router();
  async function context(req: Request, res: Response): Promise<AttributeContext | null> {
    res.setHeader("Cache-Control", "private, no-store"); const auth = req.auth;
    if (!auth || !isValidTenantId(auth.tenantId) || !id(auth.keyId) || !Array.isArray(auth.scopes) || !auth.scopes.every(s => typeof s === "string")) { res.status(401).json({ error: "unauthorized" }); return null; }
    if (!auth.scopes.includes("sessions")) { res.status(403).json({ error: "forbidden" }); return null; }
    const principal = Object.freeze({ tenantId: auth.tenantId, keyId: auth.keyId, scopes: Object.freeze([...auth.scopes]) });
    const c = typeof deps.contextFor === "function" ? await deps.contextFor(principal) : null;
    if (!c || c.tenantId !== principal.tenantId || !id(c.actorId) || typeof c.canPropose !== "boolean" || typeof c.canReview !== "boolean" || !["human", "automation"].includes(c.reviewerKind)) throw new SpeakerAttributeError("unavailable");
    return { tenantId: principal.tenantId, actorId: c.actorId, canPropose: c.canPropose, canReview: c.canReview, reviewerKind: c.reviewerKind };
  }
  router.post("/speaker-attributes", async (req, res) => {
    try { const c = await context(req, res); if (!c) return;
      if (!c.canPropose) throw new SpeakerAttributeError("forbidden");
      if (Object.keys(req.query).length || !proposal(req.body)) throw new SpeakerAttributeError("invalid");
      res.status(201).json({ attribute: receipt(await deps.service.propose(c, req.body)) });
    } catch (e) { error(res, e); }
  });
  router.post("/speaker-attributes/:id/review", async (req, res) => {
    try { const c = await context(req, res); if (!c) return;
      if (!c.canReview || c.reviewerKind !== "human") throw new SpeakerAttributeError("forbidden");
      const b: unknown = req.body;
      if (Object.keys(req.query).length || !id(req.params.id) || !shape(b, ["baseRevision", "requestId", "decision"]) || !Number.isSafeInteger(b.baseRevision) || (b.baseRevision as number) < 1 || !id(b.requestId) || !["accept", "reject", "revoke"].includes(b.decision as string)) throw new SpeakerAttributeError("invalid");
      res.json({ attribute: receipt(await deps.service.review(c, { id: req.params.id, baseRevision: b.baseRevision as number, requestId: b.requestId, decision: b.decision as "accept" | "reject" | "revoke" })) });
    } catch (e) { error(res, e); }
  });
  router.get("/speaker-attributes", async (req, res) => {
    try { const c = await context(req, res); if (!c) return; const status = req.query.status ?? "suggested";
      if (Object.keys(req.query).some(k => k !== "personId" && k !== "status") || !id(req.query.personId) || !req.query.personId.startsWith("person:") || typeof status !== "string" || !["suggested", "accepted", "rejected", "revoked"].includes(status)) throw new SpeakerAttributeError("invalid");
      const rows = await deps.service.list(c, req.query.personId, status as AttributeRow["status"]);
      if (rows.length > 100 || rows.some(r => r.tenantId !== c.tenantId || r.personId !== req.query.personId || r.status !== status)) throw new SpeakerAttributeError("unavailable");
      res.json({ attributes: rows.map(dto) });
    } catch (e) { error(res, e); }
  });
  return router;
}
