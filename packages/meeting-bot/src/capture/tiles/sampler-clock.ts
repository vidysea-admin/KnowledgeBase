/** Ingest actual sampler witnesses. These are corroboration, never decoded-media authority.
 * Identity/ranges/bounds must come from independent committed capture measurement.
 */
export interface SamplerClockBinding {
  captureGeneration: string; hostId: string; samplerInstance: string;
  samplerZeroEpochSec: { earliest: number; latest: number };
  driftBoundSec: number; uncertaintySec: number;
}
type Row = Record<string, unknown>;
const object = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
function clock(v: unknown): v is Row & { epochBeforeSec: number; epochAfterSec: number; monotonicSec: number } {
  return object(v) && nonnegative(v.epochBeforeSec) && nonnegative(v.epochAfterSec)
    && v.epochAfterSec >= v.epochBeforeSec && nonnegative(v.monotonicSec);
}
/** Validates the complete stream before any names are returned. Older uninstrumented
 * sidecars deliberately refuse. A later invalidation poisons all earlier observations.
 */
export function ingestSamplerClock(text: string, expected: SamplerClockBinding): Row[] | null {
  if (typeof text !== "string" || text.length > 16 * 1024 * 1024 || !object(expected)
    || !nonnegative(expected.driftBoundSec) || !nonnegative(expected.uncertaintySec)
    || !object(expected.samplerZeroEpochSec) || !nonnegative(expected.samplerZeroEpochSec.earliest)
    || !nonnegative(expected.samplerZeroEpochSec.latest) || expected.samplerZeroEpochSec.latest < expected.samplerZeroEpochSec.earliest
    || ![expected.captureGeneration, expected.hostId, expected.samplerInstance].every(v => typeof v === "string" && v.length > 0)) return null;
  const lines = text.split(/\r?\n/u).filter(v => v.trim());
  if (lines.length < 2 || lines.length > 200_000 || lines.some(v => v.length > 2_000)) return null;
  let rows: unknown[];
  try { rows = lines.map(v => JSON.parse(v) as unknown); } catch { return null; }
  const meta = rows[0];
  if (!object(meta) || meta.kind !== "meta" || meta.source !== "meet-dom" || !clock(meta.samplerClock)) return null;
  const origin = meta.samplerClock;
  if (origin.version !== 1 || origin.captureGeneration !== expected.captureGeneration || origin.hostId !== expected.hostId
    || origin.samplerInstance !== expected.samplerInstance || meta.startedAtEpoch !== origin.epochBeforeSec
    || origin.epochBeforeSec < expected.samplerZeroEpochSec.earliest || origin.epochAfterSec > expected.samplerZeroEpochSec.latest
    || origin.epochAfterSec - origin.epochBeforeSec > expected.uncertaintySec) return null;
  let prior = origin.monotonicSec;
  const out: Row[] = [{ kind: "meta", source: "meet-dom", startedAtEpoch: meta.startedAtEpoch }];
  for (const row of rows.slice(1)) {
    if (!object(row) || row.kind !== undefined || row.source !== "meet-dom" || !clock(row.samplerClock)
      || !nonnegative(row.tSec) || (row.displayName !== null && typeof row.displayName !== "string")
      || row.confidence !== undefined && (!nonnegative(row.confidence) || row.confidence > 1)) return null;
    const observed = row.samplerClock, elapsed = observed.monotonicSec - origin.monotonicSec;
    if (observed.monotonicSec < prior || elapsed < 0 || Math.abs(row.tSec - elapsed) > 0.000501
      || observed.epochAfterSec - observed.epochBeforeSec > expected.uncertaintySec
      || elapsed < observed.epochBeforeSec - origin.epochAfterSec - expected.driftBoundSec - 0.000001
      || elapsed > observed.epochAfterSec - origin.epochBeforeSec + expected.driftBoundSec + 0.000001) return null;
    prior = observed.monotonicSec;
    out.push({ tSec: row.tSec, displayName: row.displayName, source: "meet-dom",
      ...(row.confidence === undefined ? {} : { confidence: row.confidence }) });
  }
  return out;
}
