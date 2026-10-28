/** T-042 / D-160: verified capture-clock adapter. No production caller is enabled here.
 * Context MUST come from a trusted media/capture registry, independently of the sidecar or
 * request. It binds exact sidecar bytes to the recorded media and a measured shared epoch.
 * Platform display names remain suggestions; only the existing human confirmation writes speakers.
 */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { Turns, TileObservation } from "@lkb/core";
import { buildTileSuggestionDocs } from "@lkb/index";
import { insertSuggestionsIfAbsent, listConfirmed, listRejected } from "@lkb/db";

export interface TileCaptureContext {
  recordingSha256: string; captureSha256: string; captureId: string;
  clockBasis: "shared-host-epoch";
  recordingStartedAtEpoch: number; captureStartedAtEpoch: number; recordingDurationSec: number;
}
export interface TileCaptureSidecar {
  tenantId: string; sessionId: string; recordingSha256: string; captureId: string; jsonl: string;
}
export type ReadTileCapture = (tenantId: string, sessionId: string, context: Readonly<TileCaptureContext>) => Promise<TileCaptureSidecar>;
export interface TileSpeakerSuggestOptions { enabled?: boolean; now?: Date }
export type TileSpeakerSuggestReason = "disabled" | "invalid-context" | "invalid-turns" | "capture-mismatch" | "invalid-capture" | "no-evidence" | "suggested" | "failed" | "write-outcome-unknown";
/** null means insertion was attempted and failed; partial writes may exist. Retry is idempotent. */
export interface TileSpeakerSuggestOutcome { suggested: number; inserted: number | null; reason: TileSpeakerSuggestReason }
const SHA256 = /^[a-f0-9]{64}$/u;
const CAPTURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const MAX_CAPTURE_CHARS = 16 * 1024 * 1024;
const MAX_LINES = 200_000;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const outcome = (reason: TileSpeakerSuggestReason): TileSpeakerSuggestOutcome => ({ suggested: 0, inserted: 0, reason });

export function tileSpeakerSuggestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LKB_TILE_SUGGEST === "1";
}

function validContext(c: TileCaptureContext): boolean {
  return record(c) && typeof c.recordingSha256 === "string" && SHA256.test(c.recordingSha256)
    && typeof c.captureSha256 === "string" && SHA256.test(c.captureSha256)
    && typeof c.captureId === "string" && CAPTURE_ID.test(c.captureId) && c.clockBasis === "shared-host-epoch"
    && nonnegative(c.recordingStartedAtEpoch) && nonnegative(c.captureStartedAtEpoch) && positive(c.recordingDurationSec)
    && Number.isFinite(c.recordingStartedAtEpoch + c.recordingDurationSec)
    && c.captureStartedAtEpoch < c.recordingStartedAtEpoch + c.recordingDurationSec;
}

/** Fail closed on corrupt, concatenated, different-source or out-of-order capture files.
 * Names/confidence are retained as inert observations. Samples before/after the recording
 * span are discarded; no earlier sample is extended across the recording start.
 */
export function alignVerifiedTileCapture(jsonl: string, context: TileCaptureContext): TileObservation[] | null {
  if (!validContext(context) || typeof jsonl !== "string" || jsonl.length > MAX_CAPTURE_CHARS
    || createHash("sha256").update(jsonl, "utf8").digest("hex") !== context.captureSha256) return null;
  const rows = jsonl.split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (rows.length < 2 || rows.length > MAX_LINES || rows.some((line) => line.length > 2_000)) return null;
  const observations: TileObservation[] = [];
  let lastTime = -1;
  const offset = context.captureStartedAtEpoch - context.recordingStartedAtEpoch;
  for (let i = 0; i < rows.length; i++) {
    let r: unknown;
    try { r = JSON.parse(rows[i]!); } catch { return null; }
    if (!record(r)) return null;
    if (i === 0) {
      if (r.kind !== "meta" || r.startedAtEpoch !== context.captureStartedAtEpoch || r.source !== "meet-dom") return null;
      continue;
    }
    if (r.kind !== undefined || r.source !== "meet-dom" || !nonnegative(r.tSec) || r.tSec < lastTime
      || (r.displayName !== null && typeof r.displayName !== "string")
      || (r.confidence !== undefined && (!nonnegative(r.confidence) || r.confidence > 1))) return null;
    lastTime = r.tSec;
    const tSec = r.tSec + offset;
    if (!Number.isFinite(tSec)) return null;
    if (tSec < 0 || tSec >= context.recordingDurationSec) continue;
    observations.push({ tSec, displayName: r.displayName as string | null, source: "meet-dom",
      ...(typeof r.confidence === "number" ? { confidence: r.confidence } : {}) });
  }
  return observations;
}

/** Disabled means no loader/database access. Loader context is an independent snapshot.
 * Tenant/session come from authentication and the selected session, never from the sidecar.
 * Failure returns only a fixed reason (no transcript/name/provider error disclosure).
 */
export async function suggestTileSpeakersForSession(
  tenantId: string, sessionId: string, turns: readonly Turns[], context: TileCaptureContext,
  readCapture: ReadTileCapture, db: Db, options: TileSpeakerSuggestOptions = {},
): Promise<TileSpeakerSuggestOutcome> {
  if (options.enabled !== true) return outcome("disabled");
  let proposed = 0;
  let insertionAttempted = false;
  try {
    if (!tenantId || !sessionId || !validContext(context)) return outcome("invalid-context");
    const expected = { ...context };
    const transcript = turns.map((t) => ({ ...t }));
    if (!transcript.length || transcript.some((t) => t.tenantId !== tenantId || t.sessionId !== sessionId
      || !nonnegative(t.tStart) || !nonnegative(t.tEnd) || t.tStart > t.tEnd || t.tEnd > expected.recordingDurationSec
      || typeof t._id !== "string" || typeof t.speakerRef !== "string" || typeof t.text !== "string")) return outcome("invalid-turns");
    const capture = await readCapture(tenantId, sessionId, { ...expected });
    if (!record(capture) || capture.tenantId !== tenantId || capture.sessionId !== sessionId
      || capture.captureId !== expected.captureId || capture.recordingSha256 !== expected.recordingSha256) return outcome("capture-mismatch");
    const observations = alignVerifiedTileCapture(capture.jsonl, expected);
    if (observations === null) return outcome("invalid-capture");
    const docs = buildTileSuggestionDocs(tenantId, sessionId, observations,
      transcript.map((t) => ({ id: t._id, tStart: t.tStart, tEnd: t.tEnd, speakerRef: t.speakerRef, text: t.text })),
      { enabled: true, now: options.now });
    if (!docs.length) return outcome("no-evidence");
    const [confirmed, rejected] = await Promise.all([listConfirmed(tenantId, sessionId, db), listRejected(tenantId, sessionId, db)]);
    const pending = docs.filter((d) => !confirmed.some((p) => p.speakerRef === d.speakerRef || p.personId === d.personId)
      && !rejected.some((p) => p.speakerRef === d.speakerRef && p.personId === d.personId));
    const clockQuote = `Capture ${expected.captureId}; sidecar sha256=${expected.captureSha256}; media sha256=${expected.recordingSha256}; shared-host-epoch offset=${expected.captureStartedAtEpoch - expected.recordingStartedAtEpoch}s`;
    for (const d of pending) for (const p of d.provenance) p.evidenceQuote += ` [${clockQuote}]`;
    proposed = pending.length;
    let inserted = 0;
    if (pending.length) {
      insertionAttempted = true;
      inserted = await insertSuggestionsIfAbsent(tenantId, sessionId, pending, db);
    }
    return { suggested: pending.length, inserted, reason: pending.length ? "suggested" : "no-evidence" };
  } catch {
    return { suggested: proposed, inserted: insertionAttempted ? null : 0,
      reason: insertionAttempted ? "write-outcome-unknown" : "failed" };
  }
}
