import { Router } from "express";
import { isValidTenantId, requireScope } from "../auth.js";
import type { SpeakerProfile } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import { routeSpeakerKnowledge, type SpeakerKnowledgeView } from "../../../../packages/index/src/graph/speaker-knowledge.js";

export interface SpeakerProfileDeps {
  get(tenantId: string, personId: string): Promise<SpeakerProfile | null>;
  getKnowledge?(tenantId: string, personId: string): Promise<SpeakerKnowledgeView | null>;
}
export const unavailableSpeakerProfileDeps: SpeakerProfileDeps = { async get() { throw new Error("Unavailable"); } };
const PERSON = /^person:[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
export function createSpeakerProfilesRouter(deps: SpeakerProfileDeps): Router {
  const router = Router();
  router.get("/speaker-profiles/:personId/knowledge", requireScope("sessions"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const personId = req.params.personId;
    if (typeof personId !== "string" || !PERSON.test(personId)) { res.status(400).json({ error: "invalid_person_id" }); return; }
    if (!isValidTenantId(req.auth?.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; }
    const query = req.query.q ?? "";
    if (typeof query !== "string" || query.length > 2000 || Object.keys(req.query).some(k => k !== "q")) { res.status(400).json({ error: "invalid_knowledge_query" }); return; }
    try {
      if (!deps.getKnowledge) throw new Error("Unavailable");
      const view = await deps.getKnowledge(req.auth.tenantId, personId);
      if (!view) { res.status(404).json({ error: "not_found" }); return; }
      if (view.tenantId !== req.auth.tenantId || view.personId !== personId) throw new Error("Invalid projection authority");
      const { personId: id, identityStatus, ambiguity, revision, nodes, edges, statements, withheldRelationships } = view;
      res.json({ knowledge: { personId: id, identityStatus, ambiguity, revision, nodes, edges, statements, withheldRelationships }, retrieval: routeSpeakerKnowledge(view, { query, maxPassages: 20, maxCharacters: 12000 }) });
    } catch { res.status(503).json({ error: "speaker_knowledge_unavailable" }); }
  });
  router.get("/speaker-profiles/:personId", requireScope("sessions"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const personId = req.params.personId;
    if (typeof personId !== "string" || !PERSON.test(personId)) { res.status(400).json({ error: "invalid_person_id" }); return; }
    if (!isValidTenantId(req.auth?.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; }
    try {
      const profile = await deps.get(req.auth.tenantId, personId);
      if (!profile) { res.status(404).json({ error: "not_found" }); return; }
      res.json({ profile });
    } catch { res.status(503).json({ error: "speaker_profile_unavailable" }); }
  });
  return router;
}
