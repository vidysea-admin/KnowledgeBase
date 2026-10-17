/** API-owned readback DTOs. Descriptions cannot issue native media/clock capabilities. */
import type { Db } from "mongodb";
import type { Sessions, Sources, Turns } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { indexTurnDigest, verifyIndexGeneration } from "../generation.js";
import { readEffectiveTurns } from "../../transcript-review/effective-reader.js";
import { headId, type ReviewHead } from "../../transcript-review/store.js";

export interface NativeArchiveOwner { tenantId: string; sessionId: string; sourceId: string }
export interface NativeCaptureBinding extends NativeArchiveOwner {
  captureGeneration: string; receiptSha256: string; sourceSha256: string; sidecarSha256: string;
}
export interface NativeCurrentPublicationBinding extends NativeCaptureBinding {
  generation: string; turnDigest: string; reviewRevision: string | null;
}
export interface NativeCurrentCaptureSnapshot { binding: NativeCaptureBinding; source: Sources }
export interface NativeArchivePublication { binding: NativeCurrentPublicationBinding; turns: Turns[] }
export type NativeCurrentCaptureReader = (owner: NativeArchiveOwner) => Promise<NativeCurrentCaptureSnapshot | null>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const SHA = /^[a-f0-9]{64}$/;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** The injected reader is trusted process-root physical/current-consent readback, never HTTP JSON.
 * Missing source ingestion stays pending. Both snapshots must agree after effective-turn reads.
 */
export function createNativeArchiveBindingReader(db: Pick<Db, "collection">, readCapture: NativeCurrentCaptureReader) {
  async function read(owner: NativeArchiveOwner): Promise<NativeArchivePublication | null> {
    try {
      if (!owner.tenantId || !owner.sessionId || !owner.sourceId) return null;
      const sessions = scopedCollection<Sessions>(db as Db, "sessions")(owner.tenantId);
      const sources = scopedCollection<Sources>(db as Db, "sources")(owner.tenantId);
      const heads = scopedCollection<ReviewHead>(db as Db, "transcript_reviews")(owner.tenantId);
      const current = await sessions.findOne({ _id: owner.sessionId, sourceId: owner.sourceId });
      if (!current || current.tenantId !== owner.tenantId || current.status.index !== "done") return null;
      const attempt = current.indexAttempt;
      if (!attempt || attempt.state !== "complete" || attempt.sourceId !== owner.sourceId) return null;
      const verified = await verifyIndexGeneration(db, owner.tenantId, owner.sessionId, attempt.generation);
      if (!verified || verified.sourceId !== owner.sourceId) return null;
      const source = await sources.findOne({ _id: owner.sourceId });
      const capture = await readCapture(owner);
      if (!source || !capture || source.tenantId !== owner.tenantId || source.kind !== "recording") return null;
      const b = capture.binding, raw = capture.source;
      if (b.tenantId !== owner.tenantId || b.sessionId !== owner.sessionId || b.sourceId !== owner.sourceId ||
        raw._id !== source._id || raw.tenantId !== source.tenantId || raw.hash !== source.hash ||
        !same(raw.captureConsent, source.captureConsent) || !same(raw.guardedPrivateWindows, source.guardedPrivateWindows) ||
        raw.path !== source.path || raw.audioPath !== source.audioPath || raw.platform !== source.platform ||
        ![b.receiptSha256, b.sourceSha256, b.sidecarSha256].every(s => SHA.test(s))) return null;
      const consent = source.captureConsent;
      if (!record(consent) || consent.sessionId !== owner.sessionId || consent.generation !== b.captureGeneration ||
        consent.receiptSha256 !== b.receiptSha256 || consent.sanitizedAudioSha256 !== source.hash) return null;
      const head = await heads.findOne({ _id: headId(owner.tenantId, owner.sessionId), sessionId: owner.sessionId });
      const revision = head?.revision ?? null;
      if (head && (head.refresh.status !== "complete" || head.refresh.revision !== revision ||
        head.refresh.targets.some(target => !head.refresh.completed.includes(target)))) return null;
      const turns = await readEffectiveTurns(db, owner.tenantId,
        await scopedCollection<Turns>(db as Db, "turns")(owner.tenantId).find({ sessionId: owner.sessionId }).toArray(), owner.sessionId);
      if (indexTurnDigest(turns) !== attempt.turnDigest) return null;
      const latest = await heads.findOne({ _id: headId(owner.tenantId, owner.sessionId), sessionId: owner.sessionId });
      if (!same(latest, head) || !same(await readCapture(owner), capture) ||
        !same(await sources.findOne({ _id: owner.sourceId }), source) ||
        !same(await sessions.findOne({ _id: owner.sessionId, sourceId: owner.sourceId }), current) ||
        !await verifyIndexGeneration(db, owner.tenantId, owner.sessionId, attempt.generation)) return null;
      return { binding: Object.freeze({ ...b, generation: attempt.generation, turnDigest: attempt.turnDigest, reviewRevision: revision }), turns };
    } catch { return null; }
  }
  return { read };
}
