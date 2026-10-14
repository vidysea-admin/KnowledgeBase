/** Source-edit invalidation: a candidate whose exact turn evidence no longer matches its source loses all trust. */
import type { Db } from "mongodb";
import { assertValidTenantId, withTenant } from "@lkb/db";
import type { WhatsAppReviewCandidate } from "./detection.js";
import { revokeWhatsAppClaim } from "./materializer.js";
import { checkEvidence } from "./store.js";

export interface InvalidationResult { removedPending: number; revokedDecided: number }

/** Pending stale candidates are deleted (never decided, replaced by new-identity proposals). Decided stale
 * candidates keep their audit row but their trusted claim is removed in the same transaction. */
export async function invalidateStaleWhatsAppCandidates(db: Db, tenantId: string, sourceId: string): Promise<InvalidationResult> {
  assertValidTenantId(tenantId, "whatsapp.review.invalidate");
  const session = db.client.startSession();
  try {
    const out = await session.withTransaction<InvalidationResult>(async () => {
      const rows = await db.collection<WhatsAppReviewCandidate>("whatsapp_candidates")
        .find(withTenant<WhatsAppReviewCandidate>(tenantId, { sourceId }), { session }).toArray();
      const result = { removedPending: 0, revokedDecided: 0 };
      for (const row of rows) {
        if (row.tenantId !== tenantId) continue;
        try { await checkEvidence(db, tenantId, row, session); continue; } catch { /* stale or unverifiable: untrust below */ }
        if (row.status === "needs-review") {
          const gone = await db.collection<WhatsAppReviewCandidate>("whatsapp_candidates")
            .deleteOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: row._id, status: "needs-review" }), { session });
          result.removedPending += gone.deletedCount ?? 0;
        } else {
          await revokeWhatsAppClaim(db, tenantId, row, session);
          result.revokedDecided++;
        }
      }
      return result;
    });
    return out ?? { removedPending: 0, revokedDecided: 0 };
  } finally { await session.endSession(); }
}
