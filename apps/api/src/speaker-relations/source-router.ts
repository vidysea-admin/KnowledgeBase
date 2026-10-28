import { Router } from "express";
import { isValidTenantId } from "../auth.js";
import type { SpeakerRelationsRouterDeps } from "./router.js";
import type { RelationshipAuthority } from "./types.js";

export interface SpeakerRelationSourceRouterDeps {
  contextFor: SpeakerRelationsRouterDeps["contextFor"];
  /** Reads the current tenant-authorized base snapshot, without relationship writes. */
  readAuthority(tenantId: string, personId: string): Promise<RelationshipAuthority | null>;
}
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function unavailable(): never { throw new Error("speaker_relationship_source_unavailable"); }

export function createSpeakerRelationSourceRouter(deps: SpeakerRelationSourceRouterDeps): Router {
  const router = Router();
  router.get("/speaker-relations/source", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const auth = req.auth;
      if (!auth || !isValidTenantId(auth.tenantId) || !id(auth.keyId) || !Array.isArray(auth.scopes) || !auth.scopes.every(s => typeof s === "string")) {
        res.status(401).json({ error: "unauthorized" }); return;
      }
      if (!auth.scopes.includes("sessions")) { res.status(403).json({ error: "forbidden" }); return; }
      const principal = Object.freeze({ tenantId: auth.tenantId, keyId: auth.keyId, scopes: Object.freeze([...auth.scopes]) });
      const c = typeof deps.contextFor === "function" ? await deps.contextFor(principal) : null;
      if (!c || c.tenantId !== principal.tenantId || !id(c.actorId) || typeof c.canPropose !== "boolean" || typeof c.canReview !== "boolean" ||
        (c.reviewerKind !== "human" && c.reviewerKind !== "automation") || (c.reviewerKind === "automation" && c.canReview)) unavailable();
      if (!c.canPropose && !c.canReview) { res.status(403).json({ error: "forbidden" }); return; }
      const personId = req.query.personId;
      if (Object.keys(req.query).length !== 1 || !id(personId) || !personId.startsWith("person:") ||
        (req.body !== undefined && (req.body === null || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length > 0))) {
        res.status(400).json({ error: "invalid_speaker_relationship_source_query" }); return;
      }
      const authority = await deps.readAuthority(principal.tenantId, personId);
      if (!authority || authority.view.tenantId !== principal.tenantId || authority.view.personId !== personId ||
        authority.view.identityStatus !== "human-confirmed" || !sha(authority.view.revision) || !Array.isArray(authority.view.statements) ||
        authority.view.statements.length > 100 || !authority.transcriptHashes || typeof authority.transcriptHashes !== "object") unavailable();
      const seen = new Set<string>();
      const statements = authority.view.statements.map(s => {
        if (!id(s.id) || seen.has(s.id) || typeof s.text !== "string" || !s.text.trim() || !Array.isArray(s.evidence) || !s.evidence.length || s.evidence.length > 20) unavailable();
        seen.add(s.id);
        const locators = new Set<string>();
        const evidence = s.evidence.map(e => {
          if (!id(e.sessionId) || !id(e.turnId) || typeof e.quote !== "string" || !e.quote.trim() || e.quote.length > 12000 ||
            !Object.prototype.hasOwnProperty.call(authority.transcriptHashes, e.sessionId)) unavailable();
          const transcriptHash = authority.transcriptHashes[e.sessionId];
          const locator = JSON.stringify([e.sessionId, e.turnId]);
          if (!sha(transcriptHash) || locators.has(locator)) unavailable();
          locators.add(locator);
          return { sessionId: e.sessionId, turnId: e.turnId, quote: e.quote, transcriptHash };
        });
        return { id: s.id, text: s.text, evidence };
      });
      const result = { capabilities: { canPropose: c.canPropose, canReview: c.canReview, reviewerKind: c.reviewerKind },
        personId, sourceRevisionDigest: authority.view.revision, statements };
      if (Buffer.byteLength(JSON.stringify(result), "utf8") > 512 * 1024) unavailable();
      res.json(result);
    } catch { res.status(503).json({ error: "speaker_relationship_source_unavailable" }); }
  });
  return router;
}
