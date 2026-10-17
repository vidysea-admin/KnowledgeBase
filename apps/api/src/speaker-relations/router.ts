import { Router, type Request, type Response } from "express";
import { isValidTenantId } from "../auth.js";
import { SpeakerRelationshipError } from "./service.js";
import type { RelationshipContext, RelationshipProposal, RelationshipRow, SpeakerRelationshipService } from "./types.js";

export interface RelationshipPrincipal {
  readonly tenantId: string;
  readonly keyId: string;
  readonly scopes: readonly string[];
}
export interface SpeakerRelationsRouterDeps {
  service: SpeakerRelationshipService;
  /** Trusted server policy must explicitly assign identity and human/automation authority. */
  contextFor(principal: RelationshipPrincipal): Promise<RelationshipContext | null>;
}
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const person = (v: unknown): v is string => id(v) && v.startsWith("person:");
const statuses = ["suggested", "accepted", "rejected", "revoked"] as const;
function shape(v: unknown, keys: string[]): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
}
function proposal(v: unknown): v is RelationshipProposal {
  if (!shape(v, ["id", "personId", "fromClaimId", "toClaimId", "type", "evidence", "sourceRevisionDigest"]) ||
    !id(v.id) || !person(v.personId) || !id(v.fromClaimId) || !id(v.toClaimId) || v.fromClaimId === v.toClaimId ||
    !["agrees_with", "contradicts", "supersedes"].includes(v.type as string) || !sha(v.sourceRevisionDigest) ||
    !Array.isArray(v.evidence) || v.evidence.length < 1 || v.evidence.length > 20) return false;
  return v.evidence.every(e => shape(e, ["sessionId", "turnId", "quote", "transcriptHash"]) && id(e.sessionId) && id(e.turnId) &&
    typeof e.quote === "string" && !!e.quote.trim() && e.quote.length <= 12000 && sha(e.transcriptHash)) &&
    new Set(v.evidence.map(e => JSON.stringify([e.sessionId, e.turnId]))).size === v.evidence.length;
}
function error(res: Response, e: unknown): void {
  if (e instanceof SpeakerRelationshipError) {
    const codes = { forbidden: 403, invalid: 400, conflict: 409, unavailable: 503, not_found: 404 };
    res.status(codes[e.code]).json({ error: `speaker_relationship_${e.code}` });
  } else res.status(503).json({ error: "speaker_relationship_unavailable" });
}
function dto(row: RelationshipRow) {
  return { id: row._id, revision: row.revision, status: row.status, type: row.type,
    from: { claimId: row.from.claimId, personId: row.from.personId }, to: { claimId: row.to.claimId, personId: row.to.personId },
    sourceRevisionDigest: row.sourceRevisionDigest,
    evidence: row.evidence.map(e => ({ sessionId: e.sessionId, turnId: e.turnId, quote: e.quote })),
    ...(row.review ? { review: { decision: row.review.decision, at: row.review.at, baseRevision: row.review.baseRevision } } : {}) };
}
function receipt(r: Awaited<ReturnType<SpeakerRelationshipService["propose"]>>) {
  return { id: r.id, revision: r.revision, status: r.status, replayed: r.replayed };
}

/** Standalone boundary; the composition owner supplies authentication middleware and mounts it. */
export function createSpeakerRelationsRouter(deps: SpeakerRelationsRouterDeps): Router {
  const router = Router();
  async function context(req: Request, res: Response): Promise<RelationshipContext | null> {
    res.setHeader("Cache-Control", "private, no-store");
    const auth = req.auth;
    if (!auth || !isValidTenantId(auth.tenantId) || !id(auth.keyId) || !Array.isArray(auth.scopes) || !auth.scopes.every(s => typeof s === "string")) {
      res.status(401).json({ error: "unauthorized" }); return null;
    }
    if (!auth.scopes.includes("sessions")) { res.status(403).json({ error: "forbidden" }); return null; }
    // Snapshot the verified principal: policy never receives headers, body, or request extras.
    const principal = Object.freeze({ tenantId: auth.tenantId, keyId: auth.keyId, scopes: Object.freeze([...auth.scopes]) });
    const c = typeof deps.contextFor === "function" ? await deps.contextFor(principal) : null;
    if (!c || c.tenantId !== principal.tenantId || !id(c.actorId) || typeof c.canPropose !== "boolean" || typeof c.canReview !== "boolean" ||
      !["human", "automation"].includes(c.reviewerKind)) throw new SpeakerRelationshipError("unavailable");
    return { tenantId: principal.tenantId, actorId: c.actorId, canPropose: c.canPropose, canReview: c.canReview, reviewerKind: c.reviewerKind };
  }
  router.post("/speaker-relations", async (req, res) => {
    try {
      const c = await context(req, res); if (!c) return;
      if (!c.canPropose) throw new SpeakerRelationshipError("forbidden");
      if (Object.keys(req.query).length || !proposal(req.body)) throw new SpeakerRelationshipError("invalid");
      res.status(201).json({ relationship: receipt(await deps.service.propose(c, req.body)) });
    } catch (e) { error(res, e); }
  });
  router.post("/speaker-relations/:id/review", async (req, res) => {
    try {
      const c = await context(req, res); if (!c) return;
      if (!c.canReview || c.reviewerKind !== "human") throw new SpeakerRelationshipError("forbidden");
      const body: unknown = req.body;
      if (Object.keys(req.query).length || !id(req.params.id) || !shape(body, ["baseRevision", "requestId", "decision"]) ||
        !Number.isSafeInteger(body.baseRevision) || (body.baseRevision as number) < 1 || !id(body.requestId) || !["accept", "reject", "revoke"].includes(body.decision as string)) throw new SpeakerRelationshipError("invalid");
      res.json({ relationship: receipt(await deps.service.review(c, { id: req.params.id, baseRevision: body.baseRevision as number, requestId: body.requestId, decision: body.decision as "accept" | "reject" | "revoke" })) });
    } catch (e) { error(res, e); }
  });
  router.get("/speaker-relations", async (req, res) => {
    try {
      const c = await context(req, res); if (!c) return;
      const status = req.query.status ?? "suggested";
      if (Object.keys(req.query).some(k => k !== "personId" && k !== "status") || !person(req.query.personId) || typeof status !== "string" ||
        !statuses.includes(status as RelationshipRow["status"])) throw new SpeakerRelationshipError("invalid");
      const rows = await deps.service.list(c, req.query.personId, status as RelationshipRow["status"]);
      if (rows.length > 100 || rows.some(r => r.tenantId !== c.tenantId || r.status !== status || r.from.personId !== req.query.personId || r.to.personId !== req.query.personId)) throw new SpeakerRelationshipError("unavailable");
      res.json({ relationships: rows.map(dto) });
    } catch (e) { error(res, e); }
  });
  return router;
}
