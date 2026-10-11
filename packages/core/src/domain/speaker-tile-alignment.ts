/**
 * packages/core/src/domain/speaker-tile-alignment.ts — T-042 slice 1 (UNWIRED, PURE). Proposes, per
 * diarized SPEAKER LABEL, at most one platform display name from an active-speaker log. No I/O, no
 * model, no storage; nothing imports this; no capture of tiles exists yet (see the manifest).
 *
 * WHAT THE OUTPUT MEANS. A named label carries a DISPLAY-NAME CLAIM (`source: "platform-display-name"`,
 * `verified: false`): "the platform DISPLAYED this string while this voice was speaking". Display names
 * are untrusted, user-chosen strings; this is never a verified identity and never a `person:` entity.
 * Turns are never rewritten; the output carries provenance (turn ids, time range) only.
 *
 * Time: seconds from session start, intervals half-open. An observation holds from its time until the
 * next observation, capped at `maxHoldSec`. `displayName: null`, blank, or confidence < `minConfidence`
 * is a RELEASE. Per label, turns are unioned (seconds never double counted); turns of DIFFERENT labels
 * may overlap and each is credited.
 *
 * SIMULTANEOUS OBSERVATIONS. Observations within CONFLICT_EPS_SEC of each other that differ (two names,
 * or a name and a release) are an AMBIGUOUS INSTANT: they collapse to one release, so that interval
 * counts for no name and lowers coverage; never chosen by sort order. Equal ones are one observation.
 *
 * LAG STABILITY. The delay between speech and the highlight is unknown and varies, and for short
 * alternating turns it decides the winner. So the per-label chain is evaluated at EVERY shift lag in
 * {0, 0.5, ..., maxLagSec} (log shifted earlier by lag; `speaker-tile-scan.ts`). A name is proposed for a
 * label only if the SAME name passes EVERY threshold at EVERY shift (worst case, not best case);
 * otherwise `lag-unstable`. A name that would win two labels at ANY shift is refused for both.
 * MISALIGNMENT: agreement A(lag) = sum over labels of the TOP name's seconds is also scanned over
 * [-10, maxLagSec + 30] s (step 1 outside the stable range). If some lag outside [0, maxLagSec] beats the
 * best inside by more than `misalignMarginFraction` of all label seconds, NO name is proposed for the
 * meeting (`timeline-misaligned`). A constant offset that preserves the structure is undetectable here.
 *
 * Per label per shift: top >= minNameSeconds and >= minNameFraction of "observed" (seconds of the label's
 * turns with SOME name highlighted); runner-up <= maxRunnerUpFraction of observed (one reaching
 * minNameSeconds is `two-strong-names`); observed >= minCoverageFraction of total; the top name is a
 * person name and not the bot. Names pool inside a label by NFC + whitespace collapse (no case-folding);
 * exclusion and cross-label refusal use `foldKey` (NFKC + case-fold), which can only add refusals.
 * Never throws; hostile items are excluded and reported in `errors`. Complexity: sorts O(n log n + m log m)
 * plus K shifts (K <= 101, a constant), each one binary search per effective turn plus the holds it
 * covers: O(K (m log n + covered holds)) (`options.counter.ops`).
 */
import { foldKey, normalizeDisplayName } from "./speaker-tile-names.js";
import { decide, scanShift, type Eff, type Gates, type Hold, type LabelScan, type Verdict } from "./speaker-tile-scan.js";

export { MAX_NAME_LENGTH, normalizeDisplayName } from "./speaker-tile-names.js";
export interface TileObservation { tSec: number; displayName: string | null; confidence?: number; source?: string }
export interface TileTurn { id: string; tStart: number; tEnd: number; speakerRef: string }
export interface TileAlignOptions {
  minNameSeconds?: number; minNameFraction?: number; maxRunnerUpFraction?: number; minCoverageFraction?: number;
  maxHoldSec?: number; minConfidence?: number; maxLagSec?: number; misalignMarginFraction?: number; botDisplayName?: string;
  isNonPersonName?: (normalizedName: string) => boolean; counter?: { ops: number };
}
export const TILE_DEFAULTS = {
  /** 10 s: a few seconds of highlight is flicker or lag, not evidence. */
  minNameSeconds: 10,
  /** 0.6: a clear majority of the time anyone was highlighted over this voice. */
  minNameFraction: 0.6,
  /** 0.2: a rename mid-meeting (<= 20% under the old name) still names the dominant string; more refuses. */
  maxRunnerUpFraction: 0.2,
  /** 0.25: indicator coverage below a quarter of the label's talk time is too thin to name anyone. */
  minCoverageFraction: 0.25,
  /** 5 s: the capture is assumed to sample at least this often; a longer silence in the log is not a hold. */
  maxHoldSec: 5,
  /** 0.5: weaker observations are releases, not votes. */
  minConfidence: 0.5,
  /** 6 s: the checker swapped names at 3 s and 5 s lag; the stable range must cover that with room. */
  maxLagSec: 6,
  /** 0.02: an out-of-range lag must beat the in-range best by 2% of all label seconds to call it misaligned. */
  misalignMarginFraction: 0.02,
} as const;
/** Stable-range grid step. Worst-case error vs the exact optimum is <= step per turn boundary. */
export const LAG_STEP_SEC = 0.5;
export const DIAG_NEG_SEC = 10;
export const DIAG_POS_SEC = 30;
export const CONFLICT_EPS_SEC = 1e-6;

export type TileErrorCode = "invalid-input" | "invalid-id" | "duplicate-id" | "invalid-time" | "end-before-start"
  | "invalid-name" | "invalid-confidence" | "invalid-source" | "invalid-label" | "invalid-option";
export interface TileError { kind: "observation" | "turn" | "options"; index: number; id?: string; code: TileErrorCode }
export type RefusalReason = "no-observations" | "insufficient-coverage" | "insufficient-duration"
  | "insufficient-fraction" | "runner-up-too-strong" | "two-strong-names" | "non-person-name"
  | "bot-own-name" | "name-on-multiple-labels" | "lag-unstable" | "timeline-misaligned";

export interface DisplayNameClaim { kind: "display-name-claim"; source: "platform-display-name"; verified: false; displayName: string }
export interface TileEvidence {
  /** Seconds at lag 0 (the log as given). */
  agreeSec: number; disagreeSec: number; observedSec: number; totalSec: number;
  runnerUp: { name: string; sec: number } | null; turnIds: string[]; from: number; to: number;
  /** Worst case over every stable shift; all thresholds held at each one. */
  lagStability: { maxLagSec: number; stepSec: number; shifts: number; worstWinnerFraction: number; worstRunnerUpFraction: number; minAgreeSec: number };
}
export type LabelDecision = { status: "named"; claim: DisplayNameClaim; evidence: TileEvidence } | { status: "refused"; reason: RefusalReason };
export interface LabelResult {
  speakerRef: string; totalSec: number; observedSec: number; candidates: { name: string; sec: number }[]; decision: LabelDecision;
}
export interface TileMeeting {
  status: "ok" | "timeline-misaligned"; conflictInstants: number; shiftsEvaluated: number;
  diagnostics: { inRangeBestLagSec: number; inRangeAgreementSec: number; outOfRangeBestLagSec: number; outOfRangeAgreementSec: number; gainSec: number; marginSec: number } | null;
}
export interface TileAlignResult { labels: LabelResult[]; errors: TileError[]; meeting: TileMeeting }

type Rec = Record<string, unknown>;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function pickNum(o: Rec, key: keyof typeof TILE_DEFAULTS, errors: TileError[]): number {
  const v = o[key];
  if (v === undefined) return TILE_DEFAULTS[key];
  const max = key === "maxLagSec" ? 30 : key === "minNameSeconds" || key === "maxHoldSec" ? Infinity : 1;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max) return v;
  errors.push({ kind: "options", index: -1, code: "invalid-option" });
  return TILE_DEFAULTS[key];
}
const badTime = (v: unknown): boolean => typeof v !== "number" || !Number.isFinite(v) || v < 0;
const agreement = (m: Map<string, LabelScan>): number => { let a = 0; for (const l of m.values()) a += l.cands.length ? l.cands[0]!.sec : 0; return a; };

export function alignTileNamesToTurns(logIn: unknown, turnsIn: unknown, optionsIn?: TileAlignOptions): TileAlignResult {
  const errors: TileError[] = [];
  const o: Rec = optionsIn && typeof optionsIn === "object" ? (optionsIn as unknown as Rec) : {};
  const minSec = pickNum(o, "minNameSeconds", errors), minFrac = pickNum(o, "minNameFraction", errors);
  const maxRun = pickNum(o, "maxRunnerUpFraction", errors), minCov = pickNum(o, "minCoverageFraction", errors);
  const maxHold = pickNum(o, "maxHoldSec", errors), minConf = pickNum(o, "minConfidence", errors);
  const maxLag = pickNum(o, "maxLagSec", errors), margin = pickNum(o, "misalignMarginFraction", errors);
  const extra = typeof o.isNonPersonName === "function" ? (o.isNonPersonName as (n: string) => boolean) : undefined;
  let botKey = "";
  if (o.botDisplayName !== undefined) {
    if (typeof o.botDisplayName === "string") botKey = foldKey(o.botDisplayName);
    else errors.push({ kind: "options", index: -1, code: "invalid-option" });
  }
  const gates: Gates = { minSec, minFrac, maxRun, minCov, botKey, ...(extra ? { extra } : {}) };
  const counter = o.counter && typeof o.counter === "object" ? (o.counter as { ops: number }) : undefined;
  const tick = (): void => { if (counter) counter.ops++; };

  // ---- observations -> (ambiguous instants collapsed) -> holds (disjoint, time-ordered) ----
  const raw0: { t: number; name: string | null }[] = [];
  if (Array.isArray(logIn)) {
    logIn.forEach((raw: unknown, index) => {
      if (typeof raw !== "object" || raw === null) { errors.push({ kind: "observation", index, code: "invalid-input" }); return; }
      const r = raw as Rec;
      const code: TileErrorCode | null = badTime(r.tSec) ? "invalid-time"
        : r.displayName !== null && typeof r.displayName !== "string" ? "invalid-name"
        : r.confidence !== undefined && !(typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1) ? "invalid-confidence"
        : r.source !== undefined && typeof r.source !== "string" ? "invalid-source" : null;
      if (code) { errors.push({ kind: "observation", index, code }); return; }
      const name = r.displayName === null ? "" : normalizeDisplayName(r.displayName as string);
      const weak = r.confidence !== undefined && (r.confidence as number) < minConf;
      raw0.push({ t: r.tSec as number, name: name === "" || weak ? null : name });
    });
  } else if (logIn !== undefined) errors.push({ kind: "observation", index: -1, code: "invalid-input" });
  raw0.sort((a, b) => a.t - b.t || cmp(a.name ?? "", b.name ?? ""));
  const obs: { t: number; name: string | null }[] = [];
  let conflictInstants = 0;
  for (let i = 0; i < raw0.length;) {
    let j = i;
    const names = new Set<string | null>();
    while (j < raw0.length && raw0[j]!.t - raw0[i]!.t <= CONFLICT_EPS_SEC) names.add(raw0[j++]!.name);
    if (names.size > 1) { conflictInstants++; obs.push({ t: raw0[i]!.t, name: null }); } else obs.push({ t: raw0[i]!.t, name: [...names][0]! });
    i = j;
  }
  const holds: Hold[] = [];
  obs.forEach((ob, i) => {
    if (ob.name === null) return;
    const next = i + 1 < obs.length ? obs[i + 1]!.t : Infinity;
    const to = Math.min(next, ob.t + maxHold);
    if (to > ob.t) holds.push({ from: ob.t, to, name: ob.name });
  });

  // ---- turns -> per-label effective (unioned) intervals ----
  const good: { r: Rec; index: number }[] = [];
  const seen = new Map<string, number>();
  if (Array.isArray(turnsIn)) {
    turnsIn.forEach((raw: unknown, index) => {
      if (typeof raw !== "object" || raw === null) { errors.push({ kind: "turn", index, code: "invalid-input" }); return; }
      const r = raw as Rec;
      if (typeof r.id !== "string" || r.id === "") { errors.push({ kind: "turn", index, code: "invalid-id" }); return; }
      const code: TileErrorCode | null = badTime(r.tStart) || badTime(r.tEnd) ? "invalid-time"
        : (r.tEnd as number) < (r.tStart as number) ? "end-before-start"
        : typeof r.speakerRef !== "string" || r.speakerRef === "" ? "invalid-label" : null;
      if (code) { errors.push({ kind: "turn", index, id: r.id, code }); return; }
      good.push({ r, index });
      seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
    });
  } else if (turnsIn !== undefined) errors.push({ kind: "turn", index: -1, code: "invalid-input" });
  const byLabel = new Map<string, Eff[]>();
  const ordered = good.filter(({ r, index }) => {
    if ((seen.get(r.id as string) ?? 0) > 1) { errors.push({ kind: "turn", index, id: r.id as string, code: "duplicate-id" }); return false; }
    return true;
  }).map(({ r }) => r).sort((a, b) => (a.tStart as number) - (b.tStart as number) || (a.tEnd as number) - (b.tEnd as number) || cmp(a.id as string, b.id as string));
  const reach = new Map<string, number>();
  for (const t of ordered) {
    const label = t.speakerRef as string;
    const s = Math.max(t.tStart as number, reach.get(label) ?? -Infinity), e = t.tEnd as number;
    reach.set(label, Math.max(e, reach.get(label) ?? -Infinity));
    let list = byLabel.get(label);
    if (!list) byLabel.set(label, (list = []));
    if (e > s) list.push({ s, e, id: t.id as string });
  }

  // ---- shifts: stable range [0, maxLag] step 0.5 (per-label verdicts), then outer diagnostic lags ----
  const inner: number[] = [];
  for (let k = 0; k * LAG_STEP_SEC <= maxLag + 1e-9; k++) inner.push(k * LAG_STEP_SEC);
  if (inner[inner.length - 1]! < maxLag - 1e-9) inner.push(maxLag);
  const verdicts: Map<string, Verdict>[] = [];
  let scan0 = new Map<string, LabelScan>();
  let inBest = { lag: 0, a: -Infinity };
  for (const lag of inner) {
    const sc = scanShift(holds, byLabel, lag, tick);
    if (lag === 0) scan0 = sc;
    const a = agreement(sc);
    if (a > inBest.a + 1e-9) inBest = { lag, a };
    verdicts.push(new Map([...sc.entries()].map(([l, s]) => [l, decide(s, gates)] as const)));
  }
  let outBest = { lag: 0, a: -Infinity };
  let shifts = inner.length;
  if (holds.length > 0 && byLabel.size > 0) {
    const outer: number[] = [];
    for (let k = 1; k <= DIAG_NEG_SEC; k++) outer.push(-k);
    for (let k = 1; k <= DIAG_POS_SEC; k++) outer.push(maxLag + k);
    for (const lag of outer) {
      const a = agreement(scanShift(holds, byLabel, lag, tick));
      if (a > outBest.a + 1e-9) outBest = { lag, a };
    }
    shifts += outer.length;
  } else outBest = { lag: inBest.lag, a: inBest.a };
  let totalAll = 0;
  for (const l of scan0.values()) totalAll += l.total;
  const marginSec = margin * totalAll, gainSec = outBest.a - inBest.a;
  const misaligned = gainSec > marginSec + 1e-9;
  const meeting: TileMeeting = {
    status: misaligned ? "timeline-misaligned" : "ok", conflictInstants, shiftsEvaluated: shifts,
    diagnostics: scan0.size === 0 ? null : { inRangeBestLagSec: inBest.lag, inRangeAgreementSec: inBest.a, outOfRangeBestLagSec: outBest.lag, outOfRangeAgreementSec: outBest.a, gainSec, marginSec },
  };

  // ---- cross-label: a name (foldKey) that wins two labels at ANY stable shift is refused for both ----
  const dup = new Set<string>();
  for (const vm of verdicts) {
    const wins = new Map<string, number>();
    for (const v of vm.values()) if ("name" in v) { const k = foldKey(v.name); wins.set(k, (wins.get(k) ?? 0) + 1); }
    for (const [k, n] of wins) if (n > 1) dup.add(k);
  }

  const labels: LabelResult[] = [];
  for (const [label, s0] of scan0) {
    const base = { speakerRef: label, totalSec: s0.total, observedSec: s0.observed, candidates: s0.cands };
    const refused = (reason: RefusalReason): LabelResult => ({ ...base, decision: { status: "refused", reason } });
    if (misaligned) { labels.push(refused("timeline-misaligned")); continue; }
    const vs = verdicts.map((vm) => vm.get(label)!);
    const first = vs[0]!;
    const named = vs.filter((v): v is Extract<Verdict, { name: string }> => "name" in v);
    if (named.length === 0) { labels.push(refused("reason" in first ? first.reason : "no-observations")); continue; }
    if (named.length < vs.length || named.some((v) => v.name !== named[0]!.name)) { labels.push(refused("lag-unstable")); continue; }
    const name = named[0]!.name;
    if (dup.has(foldKey(name))) { labels.push(refused("name-on-multiple-labels")); continue; }
    const a = s0.acc.get(name)!, second = s0.cands[1];
    labels.push({ ...base, decision: { status: "named", claim: { kind: "display-name-claim", source: "platform-display-name", verified: false, displayName: name }, evidence: {
      agreeSec: s0.cands[0]!.sec, disagreeSec: s0.observed - s0.cands[0]!.sec, observedSec: s0.observed, totalSec: s0.total,
      runnerUp: second ? { name: second.name, sec: second.sec } : null, turnIds: [...a.turns], from: a.from, to: a.to,
      lagStability: { maxLagSec: maxLag, stepSec: LAG_STEP_SEC, shifts: inner.length, worstWinnerFraction: Math.min(...named.map((v) => v.topFrac)),
        worstRunnerUpFraction: Math.max(...named.map((v) => v.runFrac)), minAgreeSec: Math.min(...named.map((v) => v.agreeSec)) },
    } } });
  }
  return { labels, errors, meeting };
}
