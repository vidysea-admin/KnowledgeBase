import type { Claims, Sessions, Turns } from "@lkb/core";
import type { KnowledgeOutputs } from "../../../../packages/core/src/generated/knowledge_outputs.js";
import type { Job, CompleteResult } from "@lkb/ai";
import type { PolicyLookup } from "../answer-policy/application.js";

export type OutputDraft = KnowledgeOutputs;
export type OutputKind = OutputDraft["kind"];
export type OutputSection = OutputDraft["sections"][number];
export type OutputItem = OutputSection["items"][number];
export type OutputCitation = OutputDraft["citations"][number];
export interface OutputInput { kind: OutputKind; title: string; purpose: string; sessionIds: string[]; policyId?: string }
export interface OutputSources { sessions: Sessions[]; claims: Claims[]; turns: Turns[]; withheldVisibleClaims?: number }
export interface OutputRepository {
  list(tenantId: string): Promise<OutputDraft[]>;
  get(tenantId: string, id: string): Promise<OutputDraft | null>;
  insert(tenantId: string, draft: OutputDraft): Promise<void>;
  replace(tenantId: string, draft: OutputDraft, expectedRevision: number): Promise<boolean>;
}
export interface OutputDeps {
  repository: OutputRepository;
  readSources(tenantId: string, sessionIds: string[]): Promise<OutputSources>;
  complete(tenantId: string, job: Job): Promise<CompleteResult>;
  /** Independently routed grounding assessor; composition supplies a distinct model chain. */
  verify?: (tenantId: string, job: Job) => Promise<CompleteResult>;
  policy(tenantId: string, input: { policyId?: string; questionClass: string }): Promise<PolicyLookup>;
  now?: () => Date;
}
export class OutputError extends Error {
  constructor(readonly code: "invalid_request" | "not_found" | "conflict" | "source_changed" | "unavailable" | "needs_review", readonly status: number) {
    super(code.replaceAll("_", " "));
  }
}
export const sectionDefinitions: Record<OutputKind, readonly { key: string; title: string; kind: OutputItem["kind"] }[]> = {
  faq: [{ key: "faq", title: "Questions and answers", kind: "fact" }],
  report: [
    { key: "executive-summary", title: "Executive summary", kind: "fact" },
    { key: "insights", title: "Insights", kind: "fact" },
    { key: "decisions", title: "Recorded decisions", kind: "fact" },
    { key: "risks", title: "Suggested risks to review", kind: "suggestion" },
  ],
  "meeting-brief": [
    { key: "background", title: "Relevant background", kind: "fact" },
    { key: "agenda", title: "Suggested agenda", kind: "suggestion" },
    { key: "questions", title: "Questions to ask", kind: "question" },
    { key: "risks", title: "Suggested risks to review", kind: "suggestion" },
  ],
};
export const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export function text(v: unknown, max: number): v is string { return typeof v === "string" && Boolean(v.trim()) && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v); }
export const faqFormat = (value: string): boolean => /^Q:\s*[^\r\n]+\r?\nA:\s*\S/u.test(value);
export function parseOutputInput(v: unknown): OutputInput {
  if (!record(v) || Object.keys(v).some((k) => !["kind", "title", "purpose", "sessionIds", "policyId"].includes(k))
    || typeof v.kind !== "string" || !["faq", "report", "meeting-brief"].includes(v.kind) || !text(v.title, 180) || !text(v.purpose, 2000)
    || !Array.isArray(v.sessionIds) || v.sessionIds.length < 1 || v.sessionIds.length > 10 || !v.sessionIds.every((id) => text(id, 250))
    || (v.policyId !== undefined && !text(v.policyId, 120))) throw new OutputError("invalid_request", 400);
  return { kind: v.kind as OutputKind, title: v.title.trim(), purpose: v.purpose.trim(), sessionIds: [...new Set(v.sessionIds)], ...(typeof v.policyId === "string" ? { policyId: v.policyId } : {}) };
}
