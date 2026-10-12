/**
 * apps/api/src/speaker-suggestions/router.ts - U2.4 suggested speaker names (D-141, pending append).
 *   GET  /sessions/:sessionId/speaker-suggestions                     pending + confirmed suggestions of one session
 *   POST /sessions/:sessionId/speaker-suggestions/:id/confirm         a human makes the name final (provenance human-confirmed)
 *   POST /sessions/:sessionId/speaker-suggestions/:id/reject          a human rejects it; it is never suggested again
 * Authenticated (scope `sessions`, the same scope that reads the session itself). The tenant comes ONLY from the verified key;
 * a body, query or header naming a tenant is ignored. A suggestion that is not this tenant's AND this session's answers 404,
 * identical to one that does not exist (no existence oracle). Confirm and reject are idempotent (a repeat is 200, changed:false);
 * confirming a rejected suggestion, or rejecting a confirmed one, is 409. Every response is `private, no-store`.
 * A suggestion is served under `suggestedName`, never as a speaker identity, and nothing here reads the `speakers` collection.
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { isValidSuggestionKey, type DecisionResult, type SuggestionView } from "../../../../packages/db/src/collections/speaker-suggestions.js";

export interface SpeakerSuggestionDeps {
  list(tenantId: string, sessionId: string): Promise<SuggestionView[]>;
  confirm(tenantId: string, sessionId: string, id: string): Promise<DecisionResult>;
  reject(tenantId: string, sessionId: string, id: string): Promise<DecisionResult>;
}
export const unavailableSpeakerSuggestionDeps: SpeakerSuggestionDeps = {
  async list() { throw new Error("Speaker suggestions unavailable"); },
  async confirm() { throw new Error("Speaker suggestions unavailable"); },
  async reject() { throw new Error("Speaker suggestions unavailable"); },
};

const noStore = (res: Response): void => { res.setHeader("Cache-Control", "private, no-store"); };
const unavailable = (res: Response): void => { res.status(503).json({ error: "speaker_suggestions_unavailable", message: "Speaker suggestions are unavailable" }); };
function tenantOf(req: Request): string {
  const t = req.auth?.tenantId;
  if (typeof t !== "string" || !t.trim()) throw new Error("Missing verified tenant");
  return t;
}

export function createSpeakerSuggestionsRouter(deps: SpeakerSuggestionDeps): Router {
  const router = Router();

  router.get("/sessions/:sessionId/speaker-suggestions", requireScope("sessions"), async (req, res) => {
    noStore(res);
    const sessionId = req.params.sessionId;
    if (!isValidSuggestionKey(sessionId)) { res.status(400).json({ error: "invalid_id", message: "Invalid session id" }); return; }
    try {
      const suggestions = await deps.list(tenantOf(req), sessionId);
      if (!Array.isArray(suggestions)) throw new Error("Invalid suggestions response");
      res.status(200).json({ suggestions });
    } catch { unavailable(res); }
  });

  for (const action of ["confirm", "reject"] as const) {
    router.post(`/sessions/:sessionId/speaker-suggestions/:id/${action}`, requireScope("sessions"), async (req, res) => {
      noStore(res);
      const { sessionId, id } = req.params;
      if (!isValidSuggestionKey(sessionId) || !isValidSuggestionKey(id)) { res.status(400).json({ error: "invalid_id", message: "Invalid id" }); return; }
      try {
        const out = await deps[action](tenantOf(req), sessionId, id);
        if (out.result === "not_found") { res.status(404).json({ error: "not_found", message: "no such suggestion for this tenant and session" }); return; }
        if (out.result === "conflict") { res.status(409).json({ error: "conflict", message: `suggestion is already ${out.status}`, status: out.status }); return; }
        res.status(200).json({ suggestion: out.suggestion, changed: out.changed });
      } catch { unavailable(res); }
    });
  }
  return router;
}
