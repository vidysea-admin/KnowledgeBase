/**
 * Write-time turn timing validation (lane badturns). Mirrors scripts/lib/turn-timing.mjs. /ask refuses the
 * whole request on one bad row (ask/source-context.ts validTurn), so a bad turn is refused at write time with
 * an error naming the session and turn. Values are never swapped or clamped.
 */
export function turnTimingProblem(turn: { tStart?: unknown; tEnd?: unknown } | null | undefined): string | null {
  const { tStart, tEnd } = turn ?? {};
  if (typeof tStart !== "number" || !Number.isFinite(tStart)) return `tStart is not a finite number (${String(tStart)})`;
  if (typeof tEnd !== "number" || !Number.isFinite(tEnd)) return `tEnd is not a finite number (${String(tEnd)})`;
  if (tStart < 0) return `tStart ${tStart} is negative`;
  if (tEnd < tStart) return `tEnd ${tEnd} is before tStart ${tStart}`;
  return null;
}
export function assertTurnTimings<T extends { _id?: string; sessionId?: string; tStart?: unknown; tEnd?: unknown }>(turns: readonly T[], sessionId: string): readonly T[] {
  const bad: string[] = [];
  for (const turn of turns) {
    const problem = turnTimingProblem(turn);
    if (problem) bad.push(`session ${turn?.sessionId ?? sessionId} turn ${turn?._id ?? "(no id)"}: ${problem}`);
  }
  if (bad.length) throw new Error(`invalid turn timing, write refused (${bad.length} turn(s)): ${bad.join("; ")}`);
  return turns;
}
