/**
 * packages/index/src/pipeline/speaker-suggestions.ts -- U2.4 suggested speaker names (D-141, pending append). The PURE half.
 *
 * `extractSpeakersGrounded(..., { suggest: true })` returns `suggested`: identities that passed deterministic grounding and a
 * verifier "yes" on SINGLE evidence. This module turns them into `speaker_suggestions` documents. It is deliberately NOT
 * `buildSpeakerDocs`: a suggestion must never become a `speakers` row (the final-identity collection) on its own. The only
 * path from a suggestion to a final name is a human confirmation (packages/db `confirmSpeakerSuggestion`).
 *
 * Generation is behind an explicit flag that is OFF by default, and no production indexing run passes it.
 */
import type { SpeakerSuggestions } from "@lkb/core";
import type { SuggestedSpeaker } from "./speakers-grounded.js";

/** Deterministic id: re-suggesting the same (session, label, person) is an idempotent no-op, and a rejection tombstone is findable. */
export function suggestionId(tenantId: string, sessionId: string, speakerRef: string, personId: string): string {
  return `${tenantId}-${sessionId}-${speakerRef}-${personId}`;
}

/**
 * `speaker_suggestions` documents (status "suggested") for one session. A suggestion with no quote is dropped, never written:
 * the schema requires provenance, and "each one carries its quote and kind" is the contract. `tenantId` is stamped by the
 * scoped accessor on write, but it is carried here so the document satisfies the schema on its own.
 */
export function buildSuggestionDocs(tenantId: string, sessionId: string, suggested: readonly SuggestedSpeaker[], now: Date = new Date()): SpeakerSuggestions[] {
  const out: SpeakerSuggestions[] = [];
  for (const s of suggested) {
    const provenance = s.provenance.filter((p) => p.evidenceQuote.trim() !== "");
    const first = provenance[0];
    const evidence = s.evidence.filter((e) => e.sessionId === sessionId);
    const firstEvidence = evidence[0];
    if (!first || !firstEvidence) continue;
    out.push({
      _id: suggestionId(tenantId, sessionId, s.speakerRef, s.personId),
      tenantId, sessionId,
      speakerRef: s.speakerRef, personId: s.personId, displayName: s.displayName,
      status: "suggested",
      provenance: [first, ...provenance.slice(1)].map((p) => ({ turnId: p.turnId, evidenceQuote: p.evidenceQuote, evidenceKind: p.evidenceKind as SpeakerSuggestions["provenance"][number]["evidenceKind"] })) as SpeakerSuggestions["provenance"],
      evidence: [firstEvidence, ...evidence.slice(1)].map((e) => ({ turnId: e.turnId, sessionId: e.sessionId })) as SpeakerSuggestions["evidence"],
      blocks: s.blocks.map((b) => ({ startTurnIndex: b.startTurnIndex, endTurnIndex: b.endTurnIndex })),
      suggestedAt: now.toISOString(),
    });
  }
  return out.sort((a, b) => a._id.localeCompare(b._id));
}
