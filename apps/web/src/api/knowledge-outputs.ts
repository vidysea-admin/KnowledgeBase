import { apiFetch } from "./client.js";
/** HTTP response projection, following api/types.ts's frontend boundary. The server alone owns collection shape. */
export interface KnowledgeOutputDraft {
  _id: string; tenantId: string; kind: "faq" | "report" | "meeting-brief"; title: string; purpose: string;
  sessionIds: string[]; revision: number; createdAt: string; updatedAt: string; sourceDigest: string;
  provider: string; model: string; reviewState: "draft";
  sourceCoverage: { status: "ready" | "partial"; withheldClaims: number };
  policy?: { policyId: string; version: number; questionClass: string; mode: "internal-only" | "internal-and-web"; style: "concise" | "detailed"; onInsufficient: "review" | "refuse"; citations: "required" };
  sections: { key: string; title: string; missing: string; items: { id: string; text: string; kind: "fact" | "suggestion" | "question"; citationIds: string[]; validation: "ai-supported" | "needs-review"; assessmentDigest: string }[] }[];
  citations: { id: string; claimId: string; turnId: string; sessionId: string; speakerRef: string; speakerLabel?: string; occurredAt?: string; start: number; end: number; unit: "seconds" | "characters"; quote: string; href: string }[];
}
export interface OutputSummary { id: string; title: string; kind: KnowledgeOutputDraft["kind"]; revision: number; updatedAt: string }
const base = "/knowledge-outputs";
const path = (id: string) => `${base}/${encodeURIComponent(id)}`;
export const listKnowledgeOutputs = (key: string | null) => apiFetch<{ outputs: OutputSummary[] }>(base, key);
export const getKnowledgeOutput = (key: string | null, id: string) => apiFetch<KnowledgeOutputDraft>(path(id), key);
export const createKnowledgeOutput = (key: string | null, input: { kind: KnowledgeOutputDraft["kind"]; title: string; purpose: string; sessionIds: string[]; policyId?: string }) => apiFetch<KnowledgeOutputDraft>(base, key, { method: "POST", body: input });
export const editKnowledgeOutput = (key: string | null, id: string, input: { revision: number; title: string; edits: { id: string; text: string }[] }) => apiFetch<KnowledgeOutputDraft>(path(id), key, { method: "PUT", body: input });
export const revalidateKnowledgeOutput = (key: string | null, id: string, revision: number) => apiFetch<KnowledgeOutputDraft>(`${path(id)}/revalidate`, key, { method: "POST", body: { revision } });
export const exportKnowledgeOutput = (key: string | null, id: string, revision: number) => apiFetch<{ markdown: string; filename: string }>(`${path(id)}/export`, key, { method: "POST", body: { revision } });
