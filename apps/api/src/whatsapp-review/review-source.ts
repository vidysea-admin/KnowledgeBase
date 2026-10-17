/** Reviewer-only, candidate-bound evidence. This capability never authorizes trusted retrieval. */
import { Router } from "express";
import type { Db } from "mongodb";
import type { Claims, Sources, Turns } from "@lkb/core";
import { assertValidTenantId, withTenant } from "@lkb/db";
import { isValidTenantId, requireScope } from "../auth.js";
import { checkEvidence, isWhatsAppReviewId } from "../whatsapp/review/store.js";
import type { WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import { WHATSAPP_REVIEW_LOG } from "../whatsapp/review/invalidate.js";
import { whatsAppClaimId } from "../whatsapp/review/materializer.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { headId, type ReviewHead } from "../transcript-review/store.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { withKnowledgeReadSnapshot } from "../visibility/read-snapshot.js";

export interface WhatsAppReviewSource {
  candidateId: string;
  kind: WhatsAppReviewCandidate["kind"];
  status: "needs-review" | "approved";
  sessionId: string;
  text: string;
  evidence: WhatsAppReviewCandidate["evidence"];
  attachment?: WhatsAppReviewCandidate["attachment"];
}
export interface WhatsAppReviewSourceReader { get(tenantId: string, candidateId: string): Promise<WhatsAppReviewSource | null> }
export class ReviewSourceStaleError extends Error { constructor() { super("Review source changed"); } }
type ReadDb = Pick<Db, "collection">;
type Marker = { tenantId: string; kind: "pending-invalidation"; groupJid: string };

/** No source response without a real snapshot transaction; collection-only capabilities are insufficient. */
export function createMongoWhatsAppReviewSourceReader(db: Pick<Db, "collection" | "client">): WhatsAppReviewSourceReader {
  return { async get(tenantId, candidateId) {
    assertValidTenantId(tenantId, "whatsapp.review-source");
    if (!isWhatsAppReviewId(candidateId)) return null;
    // Preliminary source checks never authorize a response. The authoritative read point is
    // the first read of the fresh snapshot transaction below, after these preflight reads.
    const preliminary = await currentCandidateReader(db).get(tenantId, candidateId);
    if (!preliminary) return null;
    const candidate = await withKnowledgeReadSnapshot(db, snapshotDb => currentCandidateReader(snapshotDb).get(tenantId, candidateId));
    // Once the snapshot transaction closes, projection is synchronous and uses only its checked candidate.
    if (!candidate) return null;
    const [firstEvidence, ...otherEvidence] = candidate.evidence;
    if (!firstEvidence) throw new ReviewSourceStaleError();
    if (candidate.status !== "needs-review" && candidate.status !== "approved") throw new ReviewSourceStaleError();
    const projectEvidence = (e: WhatsAppReviewCandidate["evidence"][number]) => ({ turnId: e.turnId, sessionId: e.sessionId, speakerRef: e.speakerRef,
      ...(e.speakerLabel !== undefined ? { speakerLabel: e.speakerLabel } : {}), occurredAt: e.occurredAt, quote: e.quote });
    const evidence: WhatsAppReviewSource["evidence"] = [projectEvidence(firstEvidence), ...otherEvidence.map(projectEvidence)];
    return { candidateId, kind: candidate.kind, status: candidate.status, sessionId: candidate.sessionId, text: candidate.text, evidence,
      ...(candidate.attachment ? { attachment: { name: candidate.attachment.name,
        ...(candidate.attachment.mimeType !== undefined ? { mimeType: candidate.attachment.mimeType } : {}) } } : {}) };
  } };
}

function currentCandidateReader(db: ReadDb): { get(tenantId: string, candidateId: string): Promise<WhatsAppReviewCandidate | null> } {
  const load = (tenantId: string, id: string) => db.collection<WhatsAppReviewCandidate>("whatsapp_candidates")
    .findOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: id }));
  const visibility = createKnowledgeVisibility(db);
  const validate = async (tenantId: string, candidate: WhatsAppReviewCandidate): Promise<void> => {
    const head = () => db.collection<ReviewHead>("transcript_reviews").findOne(withTenant<ReviewHead>(tenantId,
      { _id: headId(tenantId, candidate.sessionId), sessionId: candidate.sessionId }));
    const beforeHead = await head();
    const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: candidate.sourceId }));
    if (!source || source.tenantId !== tenantId || source._id !== candidate.sourceId || source.consent?.given === false) throw new ReviewSourceStaleError();
    if (await db.collection<Marker>(WHATSAPP_REVIEW_LOG).findOne(withTenant<Marker>(tenantId,
      { kind: "pending-invalidation", groupJid: candidate.groupJid }))) throw new ReviewSourceStaleError();
    try {
      await checkEvidence(db as Db, tenantId, candidate);
      for (const evidence of candidate.evidence) {
        const raw = await db.collection<Turns>("turns").findOne(withTenant<Turns>(tenantId, { _id: evidence.turnId, sessionId: candidate.sessionId }));
        if (!raw || raw.tenantId !== tenantId || raw._id !== evidence.turnId || raw.sessionId !== evidence.sessionId) throw new ReviewSourceStaleError();
        const [current] = await readEffectiveTurns(db, tenantId, [raw], candidate.sessionId);
        if (!current || current.text !== evidence.quote || current.speakerRef !== evidence.speakerRef
            || current.speakerLabel !== evidence.speakerLabel || current.occurredAt !== evidence.occurredAt) throw new ReviewSourceStaleError();
      }
      if (candidate.status === "approved") {
        const claim = await db.collection<Claims>("claims").findOne(withTenant<Claims>(tenantId, { _id: whatsAppClaimId(candidate._id) }));
        if (!claim || !await visibility.claimVisible(tenantId, claim)) throw new ReviewSourceStaleError();
      }
      const currentSource = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: candidate.sourceId }));
      if (!currentSource || JSON.stringify(currentSource) !== JSON.stringify(source)) throw new ReviewSourceStaleError();
      if (await db.collection<Marker>(WHATSAPP_REVIEW_LOG).findOne(withTenant<Marker>(tenantId,
        { kind: "pending-invalidation", groupJid: candidate.groupJid }))) throw new ReviewSourceStaleError();
      if (JSON.stringify(await head()) !== JSON.stringify(beforeHead)) throw new ReviewSourceStaleError();
    } catch (error) {
      if (error instanceof ReviewSourceStaleError) throw error;
      if (error instanceof Error && (error.message.startsWith("WhatsApp review:") || error.message.startsWith("Transcript ")
          || error.message.startsWith("Reviewed source passages disappeared"))) throw new ReviewSourceStaleError();
      throw error; // Failed infrastructure reads remain unavailable, rather than claiming a source edit occurred.
    }
  };
  return {
    async get(tenantId, candidateId) {
      assertValidTenantId(tenantId, "whatsapp.review-source");
      if (!isWhatsAppReviewId(candidateId)) return null;
      const candidate = await load(tenantId, candidateId);
      if (!candidate || candidate.tenantId !== tenantId || candidate._id !== candidateId || candidate.status === "rejected") return null;
      if (candidate.status !== "needs-review" && candidate.status !== "approved") throw new ReviewSourceStaleError();
      await validate(tenantId, candidate);
      const latest = await load(tenantId, candidateId);
      if (!latest || JSON.stringify(latest) !== JSON.stringify(candidate)) throw new ReviewSourceStaleError();
      // Candidate consistency is checked BEFORE final context validation, so source redaction during
      // that reload cannot survive on unchanged candidate JSON. Review/source provenance fences
      // reject changes during validation; this is a fresh read, not a durable authorization cache.
      await validate(tenantId, latest);
      return structuredClone(candidate);
    },
  };
}

export function createWhatsAppReviewSourceRouter(reader: WhatsAppReviewSourceReader): Router {
  const router = Router();
  router.get("/whatsapp/review/:id/source", (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  }, requireScope("whatsapp"), async (req, res) => {
    if (!isValidTenantId(req.auth?.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; }
    const id = req.params.id;
    if (!isWhatsAppReviewId(id) || Object.keys(req.query).length) { res.status(404).json({ error: "not_found" }); return; }
    try {
      const source = await reader.get(req.auth.tenantId, id);
      if (!source) { res.status(404).json({ error: "not_found" }); return; }
      res.status(200).json({ source });
    } catch (error) {
      if (error instanceof ReviewSourceStaleError) res.status(409).json({ error: "review_source_stale", message: "Current source evidence could not be verified. Refresh the review queue." });
      else res.status(503).json({ error: "review_source_unavailable", message: "Review source is unavailable" });
    }
  });
  return router;
}
