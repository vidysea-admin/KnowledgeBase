import type { CalibrationReviewView } from "./client.js";

export interface OfflineJudgment { id: string; inputSha256: string; score: number; rationale: string }
const refuse = (): never => { throw new Error("Offline draft refused: use the matching current tenant and unchanged review packet."); };
const record = (value: unknown): Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : refuse();
const keys = (value: object, expected: string): void => { if (Object.keys(value).sort().join(",") !== expected) refuse(); };
const timestamp = (value: unknown): boolean => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Stage assertions only. Server revisions, actor, audit and final confirmation come from the live workflow. */
export async function stageOfflineDraft(value: unknown, view: CalibrationReviewView): Promise<OfflineJudgment[]> {
  const draft = record(value), packet = record(draft.packet);
  keys(draft, "completeAssertions,format,generatedAt,humanGoldVerified,identityBasis,items,packet,packetSha256,pendingCount,serverAuditAuthoritative,submittedCount,tenantId");
  if (draft.format !== "calibration-offline-draft-v1" || draft.humanGoldVerified !== false || draft.serverAuditAuthoritative !== false
    || draft.identityBasis !== "Offline personal-review assertions; identity and browser time are not authenticated."
    || !timestamp(draft.generatedAt) || draft.tenantId !== view.packet.tenantId || packet.tenantId !== view.packet.tenantId
    || draft.packetSha256 !== view.packetSha256 || !/^[a-f0-9]{64}$/.test(view.packetSha256)
    || view.total !== 30 || view.items.length !== 30 || !Array.isArray(draft.items) || draft.items.length !== 30
    || !Array.isArray(packet.items) || packet.items.length !== 30) refuse();
  const bytes = new TextEncoder().encode(JSON.stringify(packet));
  const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== view.packetSha256) refuse();
  const ids = new Set<string>(), judgments: OfflineJudgment[] = [];
  if (new Set(view.items.map(item => item.id)).size !== 30) refuse();
  for (const raw of draft.items) {
    const item = record(raw), current = view.items.find(candidate => candidate.id === item.id);
    keys(item, "affirmIndividualReview,assertedAt,assertedBy,id,inputSha256,localRevision,rationale,score,serverExpectedRevision");
    if (!current || ids.has(item.id) || item.inputSha256 !== current.inputSha256 || item.serverExpectedRevision !== null
      || !Number.isSafeInteger(item.localRevision) || item.localRevision < 0) refuse();
    ids.add(item.id);
    if (item.localRevision === 0) {
      if (item.score !== null || item.rationale !== null || item.affirmIndividualReview !== false || item.assertedBy !== null || item.assertedAt !== null) refuse();
    } else {
      if (typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 0 || item.score > 1
        || typeof item.rationale !== "string" || !item.rationale.trim() || item.rationale.length > 20000
        || item.affirmIndividualReview !== true || item.assertedBy !== "Umesh" || !timestamp(item.assertedAt)) refuse();
      judgments.push({ id: item.id, inputSha256: item.inputSha256, score: item.score, rationale: item.rationale });
    }
  }
  if (draft.submittedCount !== judgments.length || draft.pendingCount !== 30 - judgments.length || draft.completeAssertions !== (judgments.length === 30)) refuse();
  return judgments;
}
