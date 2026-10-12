/**
 * packages/ingest/src/retention/retention-report/clock.ts - T-046 dry-run report. `now` sanity check.
 * A wrong system clock is the one input every verdict depends on and no single record can disprove
 * a clock that is too FAR AHEAD. The rule (simple, fail-closed):
 *   - the report always prints the as-of instant it used;
 *   - if the operator passes --as-of <ISO instant> (the date they believe it is) and it differs from
 *     the system clock by more than AS_OF_TOLERANCE_MS, the clock is refused;
 *   - if no --as-of is given and `now` is more than CLOCK_HORIZON_MS after the NEWEST evidence in the
 *     state (a media mtime or processedAt not itself in the future), the clock is unconfirmed:
 *     a quiet system and a clock set years ahead look the same, so the operator must confirm.
 * Refusal means no recording is reported ELIGIBLE (each becomes KEEP `clock-unconfirmed`, not
 * assessable); the report is still printed. A clock BEHIND the data is caught per record by the
 * existing `clock-skew` guard.
 */
export const CLOCK_HORIZON_MS = 90 * 86_400_000;
export const AS_OF_TOLERANCE_MS = 24 * 3_600_000;
const SKEW_MS = 5 * 60_000;

export interface ClockCheck { refused: boolean; asOfLine: string; banner: string[] }

export function checkClock(now: number, evidence: readonly (number | null)[], asOf: number | undefined): ClockCheck {
  const asOfLine = `as of: ${new Date(now).toISOString()} (UTC, the system clock)${asOf !== undefined ? `; operator confirmed ${new Date(asOf).toISOString()}` : ""}`;
  const usable = evidence.filter((t): t is number => t !== null && Number.isFinite(t) && t <= now + SKEW_MS);
  const newest = usable.length > 0 ? Math.max(...usable) : null;
  const banner: string[] = [];
  if (asOf !== undefined && Math.abs(asOf - now) > AS_OF_TOLERANCE_MS) {
    banner.push(`!! CLOCK MISMATCH: --as-of ${new Date(asOf).toISOString()} differs from the system clock by more than ${AS_OF_TOLERANCE_MS / 3_600_000} h. No recording is reported ELIGIBLE. Fix the clock or the --as-of value.`);
  } else if (asOf === undefined && newest !== null && now - newest > CLOCK_HORIZON_MS) {
    banner.push(`!! CLOCK UNCONFIRMED: the system clock is ${((now - newest) / 86_400_000).toFixed(0)} days after the newest recording activity in the state (limit ${CLOCK_HORIZON_MS / 86_400_000} d). A wrong clock makes everything look old. No recording is reported ELIGIBLE until you re-run with --as-of <today's ISO instant, e.g. 2026-10-11T12:00:00Z> after checking the date.`);
  }
  return { refused: banner.length > 0, asOfLine, banner };
}
