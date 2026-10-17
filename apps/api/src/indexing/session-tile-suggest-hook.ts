import type { Db } from "mongodb";
import { suggestTileSpeakersForSession, tileSpeakerSuggestEnabled, type TileSpeakerSuggestOutcome } from "./tile-speaker-suggest.js";
import type { IndexSessionDeps } from "./types.js";

/**
 * T-042 P9 / D-160 (flag-gated, OFF by default): runs ONLY after the attempt committed; a failed or degraded
 * index never reaches it. Suggestion rows only -- no final-speaker write. Absent/disabled = no call, no result key.
 */
export async function runTileSuggestHook(
  committed: unknown,
  tileSuggest: IndexSessionDeps["tileSuggest"],
  tenantId: string,
  sessionId: string,
  turns: Parameters<typeof suggestTileSpeakersForSession>[2],
  db: Db,
): Promise<TileSpeakerSuggestOutcome | undefined> {
  if (!(committed && tileSuggest?.enabled === true && tileSpeakerSuggestEnabled())) return undefined;
  try {
    return await suggestTileSpeakersForSession(tenantId, sessionId, turns, tileSuggest.context, tileSuggest.readCapture, db, { enabled: true });
  } catch { return { suggested: 0, inserted: null, reason: "failed" }; }
}
