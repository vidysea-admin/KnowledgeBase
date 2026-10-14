/**
 * apps/api/src/speaker-suggestions/store.ts - U2.4 production wiring: the tenant-scoped @lkb/db suggestion accessor behind the
 * router. Relative import of the collection file, as usage/store.ts does. Reading and deciding only: nothing here GENERATES
 * suggestions, and nothing is wired into config/ai-routing.yaml or any indexing run.
 */
import type { Db } from "mongodb";
import {
  confirmSpeakerSuggestion, listSessionSuggestions, rejectSpeakerSuggestion,
} from "../../../../packages/db/src/collections/speaker-suggestions.js";
import type { SpeakerSuggestionDeps } from "./router.js";

/** `db` is injectable so tests run the REAL scoped accessor over an in-memory Db; production passes nothing (lazy getDb()). */
export function createMongoSpeakerSuggestionDeps(db?: Db): SpeakerSuggestionDeps {
  const ok = (tenantId: string): void => { if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Invalid suggestions tenant"); };
  return {
    async list(tenantId, sessionId) { ok(tenantId); return listSessionSuggestions(tenantId, sessionId, db); },
    async confirm(tenantId, sessionId, id) { ok(tenantId); return confirmSpeakerSuggestion(tenantId, sessionId, id, db); },
    async reject(tenantId, sessionId, id) { ok(tenantId); return rejectSpeakerSuggestion(tenantId, sessionId, id, db); },
  };
}
