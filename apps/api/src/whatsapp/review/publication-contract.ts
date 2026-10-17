/** ISS-WA-REVIEW-WIRE-005, decided by Umesh 2026-10-14: "mark it verified with soruce as whatsapp".
 * The ONE place that decides how an approved chat claim is labelled; `source` lets consumers tell chat-verified from webinar-verified. */
export const WA_CLAIM_SOURCE = "whatsapp" as const;
export const WA_APPROVED_CLAIM_STATUS: "verified" | "needs-review" | "conflicting" = "verified";

export const whatsAppClaimId = (candidateId: string): string => `wa-claim:${candidateId.replace(/^wa-review:/u, "")}`;

export const WHATSAPP_REVIEW_LOG = "whatsapp_review_log";
