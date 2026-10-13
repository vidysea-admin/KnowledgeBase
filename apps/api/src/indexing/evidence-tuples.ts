import type { CitedItem, QaEntry } from "@lkb/core";

export function toEvidenceTuple<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) throw new Error("toEvidenceTuple: evidence must be non-empty");
  return items as [T, ...T[]];
}

/**
 * Runtime grounded items carry `evidence: RuntimeEvidence[]`; the canonical schema (D-057/D-126) requires a
 * non-empty QuotedEvidence tuple. Runtime validation already rejects empty evidence, so a throw here is a
 * defensive backstop: an evidence-less item is never emitted as a CitedItem/QaEntry.
 */
type QuotedEv = { turnId: string; sessionId: string; quote: string };
export function toCitedItems(items: ReadonlyArray<Pick<CitedItem, "id" | "kind" | "text" | "origin" | "verification"> & { evidence: QuotedEv[] }>): CitedItem[] {
  return items.map((i) => ({ ...i, evidence: toEvidenceTuple(i.evidence.map((e) => ({ ...e }))) }));
}
export function toQaEntries(entries: ReadonlyArray<Pick<QaEntry, "id" | "question" | "answer" | "status"> & { questionEvidence: QuotedEv[]; answerEvidence: QuotedEv[] }>): QaEntry[] {
  return entries.map((q) => ({ ...q, questionEvidence: toEvidenceTuple(q.questionEvidence.map((e) => ({ ...e }))), answerEvidence: q.answerEvidence.map((e) => ({ ...e })) }));
}
