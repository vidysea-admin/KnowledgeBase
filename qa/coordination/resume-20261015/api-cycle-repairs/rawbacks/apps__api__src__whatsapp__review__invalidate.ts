/** Source-edit and upstream-deletion invalidation: a candidate whose exact turn evidence no longer matches loses all trust. */
import type { Db } from "mongodb";
import type { Turns } from "@lkb/core";
import { assertValidTenantId, withTenant } from "@lkb/db";
import { sha256Hex } from "../../hash.js";
import type { WhatsAppReviewCandidate } from "./detection.js";
import { revokeWhatsAppClaim } from "./materializer.js";
import { checkEvidence } from "./store.js";

export const WHATSAPP_REVIEW_LOG = "whatsapp_review_log";
/** Review-log ids are tenant-structured and length-prefixed, so two tenants (or tenantId/part boundaries) can never collide on a unique _id. */
export const whatsAppLogId = (tenantId: string, ...parts: string[]): string => `tenant:${tenantId.length}:${tenantId}:${parts.join(":")}`;
export const DEFAULT_MAX_DELETE_FRACTION = 0.5;
export const REDACTED_TEXT = "[redacted: message deleted upstream]";
/** Thrown BEFORE any write when an upstream snapshot would delete an empty/suspiciously large share of a group (ISS-WA-REVIEW-WIRE-009). */
export class SnapshotShrinkError extends Error {
  constructor(readonly stored: number, readonly absent: number, readonly snapshotSize: number) {
    super(`WhatsApp review: upstream snapshot would delete ${absent} of ${stored} stored messages (snapshot has ${snapshotSize}); refusing without an explicit force`);
  }
}
export interface InvalidationResult { removedPending: number; revokedDecided: number; deletedTurns: number }
export interface UpstreamSnapshot {
  sessionId: string;
  /** Turn ids that the authoritative upstream snapshot still contains; every other stored turn of the session is upstream-deleted. */
  presentTurnIds: ReadonlySet<string>;
  at: string;
  /** Largest share (0..1) of stored turns one snapshot may delete; an empty snapshot over stored turns is always refused. Default 0.5. */
  maxDeleteFraction?: number;
  /** Explicit operator override of the shrink guard. */
  force?: boolean;
}

/** Idempotent and atomic: one transaction removes upstream-deleted turns (logging each without retaining its text),
 * deletes stale pending candidates and revokes the claims of stale decided candidates. Re-running it is a no-op. */
export async function invalidateStaleWhatsAppCandidates(db: Db, tenantId: string, sourceId: string, snapshot?: UpstreamSnapshot): Promise<InvalidationResult> {
  assertValidTenantId(tenantId, "whatsapp.review.invalidate");
  const session = db.client.startSession();
  const candidates = db.collection<WhatsAppReviewCandidate>("whatsapp_candidates");
  try {
    const out = await session.withTransaction<InvalidationResult>(async () => {
      const result: InvalidationResult = { removedPending: 0, revokedDecided: 0, deletedTurns: 0 };
      if (snapshot) {
        const stored = await db.collection<Turns>("turns").find(withTenant<Turns>(tenantId, { sessionId: snapshot.sessionId }), { session }).toArray();
        const absent = stored.filter(turn => !snapshot.presentTurnIds.has(turn._id));
        const limit = snapshot.maxDeleteFraction ?? DEFAULT_MAX_DELETE_FRACTION;
        if (!snapshot.force && absent.length > 0 && (snapshot.presentTurnIds.size === 0 || absent.length / stored.length > limit)) {
          throw new SnapshotShrinkError(stored.length, absent.length, snapshot.presentTurnIds.size);
        }
        for (const turn of absent) {
          const affected = await candidates.find(withTenant<WhatsAppReviewCandidate>(tenantId, { sourceId, "evidence.turnId": turn._id }), { session }).toArray();
          for (const row of affected) {
            if (row.status === "needs-review") {
              result.removedPending += (await candidates.deleteOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: row._id, status: "needs-review" }), { session })).deletedCount ?? 0;
            } else { await revokeWhatsAppClaim(db, tenantId, row, session); result.revokedDecided++; }
          }
          // Redact the deleted text from decided rows too; the content hash and decision audit remain (ISS-WA-REVIEW-WIRE-010).
          for (const row of affected.filter(row => row.status !== "needs-review")) {
            await candidates.updateOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: row._id }), { $set: { text: REDACTED_TEXT, evidence: row.evidence.map(e => ({ ...e, quote: REDACTED_TEXT })) } } as never, { session });
          }
          await db.collection<Turns>("turns").deleteOne(withTenant<Turns>(tenantId, { _id: turn._id, sessionId: snapshot.sessionId }), { session });
          await db.collection(WHATSAPP_REVIEW_LOG).updateOne({ _id: whatsAppLogId(tenantId, "deleted", turn._id, snapshot.at), tenantId } as never, { $set: {
            kind: "upstream-deleted", sessionId: snapshot.sessionId, sourceId, turnId: turn._id, textSha256: sha256Hex(turn.text), at: snapshot.at,
            candidateIds: affected.map(row => row._id) } } as never, { upsert: true, session });
          result.deletedTurns++;
        }
      }
      const rows = await candidates.find(withTenant<WhatsAppReviewCandidate>(tenantId, { sourceId }), { session }).toArray();
      for (const row of rows) {
        try { await checkEvidence(db, tenantId, row, session); continue; } catch { /* stale or unverifiable: untrust below */ }
        if (row.status === "needs-review") {
          result.removedPending += (await candidates.deleteOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: row._id, status: "needs-review" }), { session })).deletedCount ?? 0;
        } else { await revokeWhatsAppClaim(db, tenantId, row, session); result.revokedDecided++; }
      }
      return result;
    });
    return out ?? { removedPending: 0, revokedDecided: 0, deletedTurns: 0 };
  } finally { await session.endSession(); }
}
