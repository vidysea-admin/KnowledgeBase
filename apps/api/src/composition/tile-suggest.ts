import type { Db } from "mongodb";
import type { IndexSessionDeps } from "../indexing/types.js";
import { verifyIndexGeneration } from "../indexing/generation.js";
import type { TileSuggestionPublication } from "../indexing/tile-speaker-suggest.js";

export class TileSuggestionStaleError extends Error {
  constructor() { super("tile_suggestion_generation_stale"); }
}
/** T-042 write fence (checker verdict a58fbc0b note A): suggestion rows may be written only while the
 * exact index generation that produced the turns snapshot is still the current, complete generation.
 * assertCurrent re-reads it through verifyIndexGeneration (read-only); write re-asserts immediately
 * before the work runs. Not a transaction: a concurrent reindex between the final check and the
 * idempotent insert can still land inert `suggested` rows; they never become final speakers. */
export function createIndexGenerationSuggestionPublication(db: Db, tenantId: string, sessionId: string, generation: string): TileSuggestionPublication {
  const assertCurrent = async (): Promise<void> => {
    if (typeof generation !== "string" || !generation) throw new TileSuggestionStaleError();
    const current = await verifyIndexGeneration(db, tenantId, sessionId, generation);
    if (!current || current.generation !== generation || current.sessionId !== sessionId) throw new TileSuggestionStaleError();
  };
  return { assertCurrent, async write(work) { await assertCurrent(); return work(db); } };
}

/** T-042 P9 central wiring. OFF unless LKB_TILE_SUGGEST=1 (exactly). The write fence is always supplied.
 * No production source exists yet for the trusted capture context (the tile registry's `readCommitted`
 * and `measureDecodedClock` have no production implementation), so `context`/`readCapture` stay absent
 * and the indexing hook is a no-op even when enabled. Never synthesize a context here. */
export function resolveTileSuggest(env: Record<string, string | undefined> = process.env): IndexSessionDeps["tileSuggest"] {
  if (env.LKB_TILE_SUGGEST !== "1") return undefined;
  return { enabled: true, publication: createIndexGenerationSuggestionPublication };
}
