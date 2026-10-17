/** Candidate-only materialisation: one approved candidate becomes exactly one trusted claim row, inside the decision transaction. */
import type { Db, ClientSession } from "mongodb";
import { withTenant } from "@lkb/db";
import type { WhatsAppReviewCandidate } from "./detection.js";
import type { WhatsAppReviewMaterializer } from "./store.js";
import { publishApprovedMessage, revokeNativeMessage } from "../../native-evidence/message-publication.js";

import { WA_CLAIM_SOURCE, WA_APPROVED_CLAIM_STATUS, whatsAppClaimId } from "./publication-contract.js";
export { WA_CLAIM_SOURCE, WA_APPROVED_CLAIM_STATUS, whatsAppClaimId } from "./publication-contract.js";

export const materializeWhatsAppClaim: WhatsAppReviewMaterializer = async ({ candidate, db, session }) => {
  if (candidate.status !== "approved" || candidate.decision?.action !== "approved") throw new Error("WhatsApp review: only an approved candidate may be materialised");
  if (candidate.flags.some(flag => flag.kind === "personal-excluded")) throw new Error("WhatsApp review: excluded candidate cannot be materialised");
  const _id = whatsAppClaimId(candidate._id);
  const body = {
    text: candidate.text, status: WA_APPROVED_CLAIM_STATUS, source: WA_CLAIM_SOURCE, origin: "speaker-statement",
    evidence: candidate.evidence.map(e => ({ turnId: e.turnId, sessionId: e.sessionId, quote: e.quote })),
    waReview: { candidateId: candidate._id, kind: candidate.kind, approvedBy: candidate.decision.actor, approvedAt: candidate.decision.at },
  };
  await db.collection("claims").updateOne({ _id, tenantId: candidate.tenantId } as never, { $set: body } as never, { upsert: true, session });
  await publishApprovedMessage({ candidate, db, session });
};

/** Removes the single trusted row a candidate produced (source edit or revocation). */
export async function revokeWhatsAppClaim(db: Db, tenantId: string, candidate: Pick<WhatsAppReviewCandidate, "_id">, session: ClientSession): Promise<void> {
  await db.collection("claims").deleteOne(withTenant<{ tenantId: string }>(tenantId, { _id: whatsAppClaimId(candidate._id) } as never) as never, { session });
  await revokeNativeMessage(candidate._id, tenantId, db, session);
}
