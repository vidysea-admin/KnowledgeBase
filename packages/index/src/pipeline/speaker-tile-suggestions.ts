/**
 * packages/index/src/pipeline/speaker-tile-suggestions.ts -- T-042 / D-160. Active-speaker tile observations -> SUGGESTED speaker names.
 *
 * Input: the bot's tile capture (packages/meeting-bot/py/sb_join_tiles.py, JSONL of `TileObservation`) and the session's diarized turns.
 * Path: `alignTileNamesToTurns` (core) -> `fuseSpeakerNames` (tile + self-introduction guards) -> `speaker_suggestions` documents of kind "tile".
 * A tile name is an untrusted display string. Under D-160 (and D-141) it is only ever SUGGESTED: this module returns / inserts rows with
 * status "suggested" and never touches `speakers`. The only path to a final name stays packages/db `confirmSpeakerSuggestion`, which a
 * human triggers. Tile-derived names are NOT an auto-final source; auto-final remains the deterministic floor plus the independent-pair rule.
 * Introduction-only labels (no tile) are the existing floor's job and are not re-suggested here; only a label whose name rests on a tile
 * (basis `tile-only` or `agree`) becomes a row. Behind an explicit flag, OFF by default: with it off nothing is read, built or written.
 */
import type { SpeakerSuggestions, TileObservation } from "@lkb/core";
import { alignTileNamesToTurns } from "@lkb/core";
import { fuseSpeakerNames, type FusionTurn } from "./speaker-rules/speaker-tile-fusion.js";
import { suggestionId } from "./speaker-suggestions.js";
import { personIdFor } from "./speakers.js";

export interface TileSuggestionOptions { enabled?: boolean; now?: Date }
export const TILE_SUGGESTION_DEFAULTS = { enabled: false } as const;

const MAX_LINES = 200_000;
const MAX_LINE_CHARS = 2_000;

/** Parses the capture file. Meta lines, blank/hostile lines and malformed observations are skipped, never thrown on. */
export function parseTileCapture(jsonl: unknown): TileObservation[] {
  if (typeof jsonl !== "string") return [];
  const out: TileObservation[] = [];
  const lines = jsonl.split(/\r?\n/u);
  for (let i = 0; i < lines.length && i < MAX_LINES; i++) {
    const line = lines[i]!;
    if (line === "" || line.length > MAX_LINE_CHARS) continue;
    let v: unknown;
    try { v = JSON.parse(line); } catch { continue; }
    if (v === null || typeof v !== "object" || Array.isArray(v)) continue;
    const r = v as Record<string, unknown>;
    if (r.kind === "meta") continue;
    if (typeof r.tSec !== "number" || !Number.isFinite(r.tSec) || r.tSec < 0) continue;
    if (r.displayName !== null && typeof r.displayName !== "string") continue;
    out.push({ tSec: r.tSec, displayName: r.displayName, ...(typeof r.source === "string" ? { source: r.source } : {}) });
  }
  return out;
}

/** `speaker_suggestions` documents (status "suggested", kind "tile") for one session. Pure; [] when the flag is off. */
export function buildTileSuggestionDocs(
  tenantId: string, sessionId: string, observations: readonly TileObservation[], turns: readonly FusionTurn[], options: TileSuggestionOptions = {},
): SpeakerSuggestions[] {
  if (options.enabled !== true) return [];
  const now = options.now ?? new Date();
  const aligned = alignTileNamesToTurns(observations, turns.map((t) => ({ id: t.id, tStart: t.tStart, tEnd: t.tEnd, speakerRef: t.speakerRef })));
  if (aligned.meeting.status !== "ok") return [];
  const fused = fuseSpeakerNames(aligned, turns, { allowTileOnly: true });   // a suggestion needs a human anyway (D-160)
  const out: SpeakerSuggestions[] = [];
  for (const l of fused.labels) {
    if (l.status !== "named" || l.tile === null) continue;
    const personId = personIdFor(l.name);
    if (personId === "person:") continue;
    const turnIds = l.tile.turnIds;
    const first = turnIds[0];
    if (first === undefined) continue;
    const quote = `Meet tile "${l.tile.name}" was highlighted while ${l.speakerRef} spoke (${l.basis}, ${l.tile.from.toFixed(1)}s to ${l.tile.to.toFixed(1)}s)`;
    out.push({
      _id: suggestionId(tenantId, sessionId, l.speakerRef, personId), tenantId, sessionId, speakerRef: l.speakerRef, personId, displayName: l.name,
      status: "suggested",
      provenance: [{ turnId: first, evidenceQuote: quote, evidenceKind: "tile" }],
      evidence: [{ turnId: first, sessionId }, ...turnIds.slice(1).map((turnId) => ({ turnId, sessionId }))],
      suggestedAt: now.toISOString(),
    });
  }
  return out.sort((a, b) => a._id.localeCompare(b._id));
}

/** The u24suggest store's insert (packages/db `insertSuggestionsIfAbsent`), injected so index stays free of a db dependency. */
export type InsertSuggestions = (tenantId: string, sessionId: string, docs: readonly SpeakerSuggestions[]) => Promise<number>;

/** Builds and stores tile suggestions. Flag off: returns 0 and calls nothing. Never writes a final speaker (the store has no such path here). */
export async function storeTileSuggestions(
  tenantId: string, sessionId: string, captureJsonl: string, turns: readonly FusionTurn[], insert: InsertSuggestions, options: TileSuggestionOptions = {},
): Promise<number> {
  const docs = buildTileSuggestionDocs(tenantId, sessionId, parseTileCapture(captureJsonl), turns, options);
  return docs.length === 0 ? 0 : insert(tenantId, sessionId, docs);
}
