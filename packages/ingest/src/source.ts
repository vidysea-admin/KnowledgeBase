/**
 * packages/ingest/src/source.ts — T-020 C1. The one `Source` adapter interface every adapter
 * under `sources/*.ts` implements, plus the `ConsentContext` shape and the D-008 provided-first
 * soft-gate helper (contract `qa/contracts/ingestion-source-seam.md` C1, C5). `SourceDoc` /
 * `MediaDoc` / `TurnDoc` are re-exports of T-018's generated `Sources` / `Media` / `Turns` types
 * (schema/{sources,media,turns}.schema.json) — never redeclared here.
 *
 * `toTurns()` on every adapter produces the *pre-persistence* turn shape — text + timing, no
 * `_id`/`tenantId`/`sessionId` yet, since the ingest pipeline (not this seam) assigns those on
 * write. That shape already exists as `Turn` in `packages/ai/src/stt/transcribe.ts` ("matches
 * schema/turns.schema.json minus the ids the caller fills in") — the exact seam the `recording`
 * adapter delegates to (C2). Reusing it here (rather than declaring a second near-identical
 * "pre-id turn" type) is what "no re-declared shapes" means in practice for `Turn`; `TurnDoc`
 * is kept alongside as the full persisted-doc alias for callers that need it.
 */
import type { Sources, Media, Turns } from "@lkb/core";
import type { Turn } from "@lkb/ai";

export type SourceDoc = Sources;
export type MediaDoc = Media;
export type TurnDoc = Turns;
export type { Turn };

/**
 * ISS-T045INTAKE-001: tenant-scoped source identity. A content hash alone is global, so two tenants holding identical
 * media would collide on a global-unique `sources._id` (existence oracle, cross-tenant denial, overwrite by upsert).
 * The id is `<encodeURIComponent(tenantId)>:<hash>`: the encoded tenant never contains ':', so the pair is injective
 * and the tenant can never be forged by choosing a hash. The bare hash stays in the `hash` field.
 */
export function tenantSourceId(tenantId: string, contentHash: string): string {
  if (typeof tenantId !== "string" || tenantId.length === 0) throw new Error("tenantSourceId: tenantId required");
  if (typeof contentHash !== "string" || contentHash.length === 0) throw new Error("tenantSourceId: contentHash required");
  return `${encodeURIComponent(tenantId)}:${contentHash}`;
}

/**
 * Input to `Source.fetch()`. `captureMode` is required — no adapter guesses it. D-008
 * (provided-first, H8): a caller marks `captureMode: "provided"` only when an organizer-provided
 * recording/notes was actually used; anything else (including `"silent"`) must be supplied
 * explicitly by the caller, never inferred.
 */
export interface ConsentContext {
  captureMode: Sources["captureMode"];
  given: boolean;
  recordedBy: string;
  note?: string;
  /**
   * Required confirmation for `captureMode === "silent"` (D-008 H8: silent capture is the last
   * resort). `assertProvidedFirst` warns — does not throw — when this is missing.
   */
  confirmedNoAlternative?: boolean;
}

/** One adapter per capture mechanism (recording, document, url, whatsapp, meeting-bot). */
export interface Source {
  readonly name: string;
  detect(input: unknown): boolean;
  fetch(input: unknown, consent: ConsentContext): Promise<{ source: SourceDoc; media: MediaDoc[] }>;
  toTurns(source: SourceDoc): Promise<Turn[]>;
}

/**
 * D-008 / H8 soft gate (contract C5): warns — never throws — when `captureMode` is `"silent"`
 * and the caller has not explicitly confirmed no provided/public/notes alternative was checked
 * first. Returns the warning string, or `undefined` when there is nothing to warn about.
 */
export function assertProvidedFirst(context: ConsentContext): string | undefined {
  if (context.captureMode === "silent" && !context.confirmedNoAlternative) {
    return (
      "captureMode is 'silent' but the caller did not confirm a provided/public/notes " +
      "alternative was checked first (D-008 provided-first ordering, H8) — silent capture is " +
      "meant to be the last resort."
    );
  }
  return undefined;
}
