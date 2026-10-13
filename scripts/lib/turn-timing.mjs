/**
 * Write-time turn timing validation (lane badturns). A turn needs finite numeric tStart >= 0 and finite
 * numeric tEnd >= tStart. The /ask source hydrator (apps/api/src/ask/source-context.ts validTurn) refuses
 * the WHOLE request on one bad row, so a bad row must never be written. A bad turn is REFUSED with an error
 * that names the session and turn; its values are never swapped or clamped. Mirror: apps/api/src/turn-timing.ts.
 */
export function turnTimingProblem(turn) {
  const { tStart, tEnd } = turn ?? {};
  if (typeof tStart !== "number" || !Number.isFinite(tStart)) return `tStart is not a finite number (${String(tStart)})`;
  if (typeof tEnd !== "number" || !Number.isFinite(tEnd)) return `tEnd is not a finite number (${String(tEnd)})`;
  if (tStart < 0) return `tStart ${tStart} is negative`;
  if (tEnd < tStart) return `tEnd ${tEnd} is before tStart ${tStart}`;
  return null;
}
/** Throws one Error listing EVERY offending turn as `session <id> turn <id>: <problem>`; returns the turns untouched. */
export function assertTurnTimings(turns, sessionId) {
  const bad = [];
  for (const turn of turns) {
    const problem = turnTimingProblem(turn);
    if (problem) bad.push(`session ${turn?.sessionId ?? sessionId} turn ${turn?._id ?? "(no id)"}: ${problem}`);
  }
  if (bad.length) throw new Error(`invalid turn timing, write refused (${bad.length} turn(s)): ${bad.join("; ")}`);
  return turns;
}
