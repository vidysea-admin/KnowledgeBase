import { apiFetch } from "../../../api/client.js";

export interface GroundedEvidenceView {
  turnId: string; sessionId: string; quote: string | null; available: boolean;
  tStart: number | null; tEnd: number | null; speaker: string | null;
}
export interface GroundedContentView {
  sessionId: string;
  notes: Array<{ id: string; kind: "insight" | "decision" | "action"; text: string;
    origin: "speaker-statement" | "screen-ocr" | "visual-observation"; verification: "unverified"; evidence: GroundedEvidenceView[] }>;
  qa: Array<{ id: string; question: string; answer: string | null; status: "answered" | "unanswered";
    questionEvidence: GroundedEvidenceView[]; answerEvidence: GroundedEvidenceView[] }>;
  claims: Array<{ _id: string; text: string; status: "verified" | "needs-review" | "conflicting"; evidence: GroundedEvidenceView[] }>;
}
export function getGroundedContent(apiKey: string | null, sessionId: string): Promise<GroundedContentView> {
  return apiFetch(`/sessions/${encodeURIComponent(sessionId)}/grounded-content`, apiKey);
}
