/** Recompute transcript ordering, overlap and repetition from turns.json itself; never trust transcript-qa.json for these. */
import { qaReportFailureReasons } from "../../lib/transcription/transcript-qa-generation.mjs";

/** `qa` is the transcript-qa module (clampAndValidateTurns plus the writer's own tolerance constant). */
export function turnIntegrityReasons({ turns, durationSec, qa }) {
  const reasons = [];
  try {
    reasons.push(...qaReportFailureReasons(qa.clampAndValidateTurns(turns, durationSec).report, "turns.json"));
  } catch (error) { reasons.push(`turns.json: ${error.message}`); }
  // Overlap: a turn may not start before the previous turn ended, beyond the writer's floating-point tolerance.
  const overlapping = [];
  turns.forEach((turn, i) => {
    const prev = turns[i - 1];
    if (i > 0 && Number.isFinite(turn?.tStart) && Number.isFinite(prev?.tEnd) && turn.tStart < prev.tEnd - qa.DEFAULT_TOLERANCE_SEC) overlapping.push(i);
  });
  if (overlapping.length) reasons.push(`turns.json: ${overlapping.length} overlapping turn(s) (first at index ${overlapping[0]})`);
  return reasons;
}
