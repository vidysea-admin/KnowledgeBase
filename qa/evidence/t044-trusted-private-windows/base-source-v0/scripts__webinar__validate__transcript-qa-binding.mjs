/** Validate generation-bound QA against one frozen transcript snapshot and probed audio duration. */
import { assertQaGenerationShape, qaReportFailureReasons, transcriptBytesSha256 } from "../../lib/transcription/transcript-qa-generation.mjs";

export function evaluateTranscriptQaGeneration({ proof, turnsBytes, turns, durationSec, clamp }) {
  const reasons = [];
  try { assertQaGenerationShape(proof); } catch (error) { return { qa: null, reasons: [error.message] }; }
  if (proof.turnsSha256 !== transcriptBytesSha256(turnsBytes)) reasons.push("QA report is stale: transcript generation hash mismatch");
  if (proof.durationSec !== durationSec) reasons.push("QA report: independently probed audio duration mismatch");
  if (proof.merged.outputCount !== turns.length) reasons.push(`QA report is stale: it covers ${proof.merged.outputCount} turns, turns.json has ${turns.length}`);
  reasons.push(...qaReportFailureReasons(proof.merged, "QA merged"));
  const selected = proof.spans.filter(span => span.accepted);
  for (const span of selected) reasons.push(...qaReportFailureReasons(span.report, `QA accepted span ${span.id}`));
  // The clamp snaps floating-point overshoot within its tolerance without counting a clamp.
  // Admission checks the original committed timestamps, so even that uncounted overshoot refuses.
  if (turns.some(t => !t || !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) ||
      !(0 <= t.tStart && t.tStart <= t.tEnd && t.tEnd <= durationSec))) {
    reasons.push("QA current transcript: committed timing outside exact audio bounds");
  }
  try {
    const current = clamp(turns, durationSec).report;
    if (!current.durationValid || current.dropped.length || current.clampedCount) reasons.push("QA current transcript: invalid or out-of-duration timing");
    reasons.push(...qaReportFailureReasons(current, "QA current transcript"));
  } catch (error) { reasons.push(`QA current transcript: ${error.message}`); }
  const m = proof.merged, h = m.hallucination;
  return { qa: { version: proof.version, turnsSha256: proof.turnsSha256, durationValid: m.durationValid,
    inputCount: m.inputCount, outputCount: m.outputCount, clampedCount: m.clampedCount, dropped: m.dropped.length,
    overshootSec: m.overshootSec, pastEnd: h.pastEndIndices.length, repeatedRuns: h.repeatedRuns.length,
    nonMonotonic: m.nonMonotonicIndices.length, acceptedSpans: selected.length, rejectedAttempts: proof.spans.length - selected.length }, reasons };
}
