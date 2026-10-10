/** Pure figure functions for the analytics page. Every number shown is computed here from fetched rows. */
export interface Ratio { numerator: number; denominator: number; percent: number | null }
export interface MonthCount { month: string; count: number }
export interface SessionDetailRow { sessionId: string; claims: unknown; turns: unknown }

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** percent is null when the denominator is 0 or either side is not a finite, valid count. */
export function ratio(numerator: number, denominator: number): Ratio {
  const ok = Number.isFinite(numerator) && Number.isFinite(denominator) && numerator >= 0 && denominator > 0 && numerator <= denominator;
  return { numerator, denominator, percent: ok ? Math.round((numerator / denominator) * 1000) / 10 : null };
}
export function formatPercent(r: Ratio): string {
  return r.percent === null ? "n/a (no rows)" : `${r.percent}% (${r.numerator} of ${r.denominator})`;
}
function rows(value: unknown): { good: Record<string, unknown>[]; malformed: number } {
  if (!Array.isArray(value)) return { good: [], malformed: 0 };
  const good = value.filter(obj);
  return { good, malformed: value.length - good.length };
}

export interface SessionsFigure { total: number; months: MonthCount[]; undated: number; indexed: number; malformed: number }
/** Sessions per calendar month of `date` (YYYY-MM-DD prefix, real month only). */
export function sessionsOverTime(value: unknown): SessionsFigure {
  const { good, malformed } = rows(value);
  const counts = new Map<string, number>();
  let undated = 0, indexed = 0;
  for (const s of good) {
    const m = typeof s.date === "string" ? /^(\d{4})-(0[1-9]|1[0-2])-\d{2}/.exec(s.date) : null;
    if (m) counts.set(`${m[1]}-${m[2]}`, (counts.get(`${m[1]}-${m[2]}`) ?? 0) + 1); else undated++;
    if (obj(s.status) && s.status.index === "done") indexed++;
  }
  const months = [...counts].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));
  return { total: good.length, months, undated, indexed, malformed };
}

export interface ClaimsFigure { sessionsSampled: number; sessionsWithClaims: number; totalClaims: number; verified: Ratio; perSession: { sessionId: string; claims: number }[]; malformed: number }
export function claimsPerSession(details: readonly SessionDetailRow[]): ClaimsFigure {
  let totalClaims = 0, verified = 0, malformed = 0, withClaims = 0;
  const perSession: ClaimsFigure["perSession"] = [];
  for (const d of details) {
    const { good, malformed: bad } = rows(d.claims);
    const valid = good.filter(c => nonEmpty(c._id) && typeof c.status === "string");
    malformed += bad + (good.length - valid.length);
    totalClaims += valid.length; verified += valid.filter(c => c.status === "verified").length;
    if (valid.length > 0) withClaims++;
    perSession.push({ sessionId: d.sessionId, claims: valid.length });
  }
  return { sessionsSampled: details.length, sessionsWithClaims: withClaims, totalClaims, verified: ratio(verified, totalClaims), perSession, malformed };
}

export interface SpeakersFigure { turns: number; resolved: Ratio; malformed: number }
/** A turn has a resolved speaker when it carries a non-empty `speakerLabel`; the raw `speakerRef` alone does not count. */
export function speakerResolution(details: readonly SessionDetailRow[]): SpeakersFigure {
  let turns = 0, resolved = 0, malformed = 0;
  for (const d of details) {
    const { good, malformed: bad } = rows(d.turns);
    malformed += bad; turns += good.length; resolved += good.filter(t => nonEmpty(t.speakerLabel)).length;
  }
  return { turns, resolved: ratio(resolved, turns), malformed };
}

export interface EvidenceFigure { edges: number; withEvidence: Ratio; sessionsInGraph: number | null; sessionsTotal: number | null; malformed: number }
/** Citation coverage: share of graph edges carrying at least one evidence entry with a turnId. */
export function graphEvidence(graph: unknown): EvidenceFigure {
  const g = obj(graph) ? graph : {};
  const { good, malformed } = rows(g.edges);
  const cited = good.filter(e => Array.isArray(e.evidence) && e.evidence.some(x => obj(x) && nonEmpty(x.turnId))).length;
  const st = obj(g.stats) ? g.stats : {};
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  return { edges: good.length, withEvidence: ratio(cited, good.length), sessionsInGraph: n(st.sessionsInGraph), sessionsTotal: n(st.sessionsTotal), malformed };
}

export interface CountsFigure { total: number; counts: Record<string, number>; other: number; malformed: number }
function countBy(value: unknown, known: readonly string[]): CountsFigure {
  const { good, malformed } = rows(value);
  const counts = Object.fromEntries(known.map(k => [k, 0])) as Record<string, number>;
  let other = 0;
  for (const r of good) { if (typeof r.status === "string" && known.includes(r.status)) counts[r.status]!++; else other++; }
  return { total: good.length, counts, other, malformed };
}
export const gapStatusList = ["open", "received", "expired"] as const;
export const jobStatusList = ["pending", "processing", "done", "failed"] as const;
export const gapCounts = (gaps: unknown): CountsFigure => countBy(gaps, gapStatusList);
export const jobCounts = (jobs: unknown): CountsFigure => countBy(jobs, jobStatusList);
