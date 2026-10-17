import { apiFetch } from "../../api/client.js";

export interface ReviewSource {
  candidateId: string;
  kind: "claim" | "topic" | "decision" | "attachment";
  status: "needs-review" | "approved";
  sessionId: string;
  text: string;
  evidence: { turnId: string; sessionId: string; speakerRef: string; speakerLabel?: string; occurredAt: string; quote: string }[];
  attachment?: { name: string; mimeType?: string };
}
export async function getReviewSource(apiKey: string | null, candidateId: string): Promise<ReviewSource> {
  const { source } = await apiFetch<{ source: ReviewSource }>(`/whatsapp/review/${encodeURIComponent(candidateId)}/source`, apiKey);
  if (!source || source.candidateId !== candidateId || !["needs-review", "approved"].includes(source.status)
      || !["claim", "topic", "decision", "attachment"].includes(source.kind) || typeof source.text !== "string"
      || typeof source.sessionId !== "string" || !source.sessionId || !Array.isArray(source.evidence) || !source.evidence.length
      || source.evidence.some(e => !e || e.sessionId !== source.sessionId || typeof e.turnId !== "string" || typeof e.quote !== "string"
        || !e.turnId || !e.quote || typeof e.speakerRef !== "string" || !e.speakerRef || typeof e.occurredAt !== "string"
        || !Number.isFinite(Date.parse(e.occurredAt)) || (e.speakerLabel !== undefined && typeof e.speakerLabel !== "string"))
      || (source.attachment !== undefined && (!source.attachment || typeof source.attachment.name !== "string"
        || (source.attachment.mimeType !== undefined && typeof source.attachment.mimeType !== "string")))) throw new Error("Invalid review source");
  return source;
}
