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
 * next observation, capped at `maxHoldSec` (so one stale sample cannot claim minutes). `displayName:
 * null`, blank, or confidence < `minConfidence` is a RELEASE (nobody highlighted from then on).
 * Per label, turns are unioned (a turn's start is clipped to the previous same-label turn's end), so
 * seconds are never double counted; turns of DIFFERENT labels may overlap and each is credited.
 *
 * Per label (all thresholds are options; defaults below; "observed" = seconds of the label's turns
 * during which SOME name was highlighted, including non-person names):
 *  (a) top name needs >= minNameSeconds AND >= minNameFraction of observed;
 *  (b) runner-up must be <= maxRunnerUpFraction of observed (clear winner); a runner-up that itself
 *      reaches minNameSeconds is reported as `two-strong-names` (diarizer merged two people);
 *  (c) observed must cover >= minCoverageFraction of the label's total turn seconds;
 *  (d) cross-label: a name that would win two labels is refused for BOTH (`name-on-multiple-labels`);
 *  (e) a top name that is not a person name (device/room/role/phone/bot/control chars) is never proposed.
 * Names are equal iff equal after NFC + whitespace collapse + trim; NO case-folding, no title stripping.
 * Never throws; hostile items are excluded and reported in `errors`. Complexity: sort O(n log n + m log m);
 * per effective turn one binary search over holds plus the holds it covers (`options.counter.ops`).
 */
export interface TileObservation { tSec: number; displayName: string | null; confidence?: number; source?: string }
export interface TileTurn { id: string; tStart: number; tEnd: number; speakerRef: string }
export interface TileAlignOptions {
  minNameSeconds?: number; minNameFraction?: number; maxRunnerUpFraction?: number; minCoverageFraction?: number;
  maxHoldSec?: number; minConfidence?: number; botDisplayName?: string;
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
} as const;

export type TileErrorCode = "invalid-input" | "invalid-id" | "duplicate-id" | "invalid-time" | "end-before-start"
  | "invalid-name" | "invalid-confidence" | "invalid-source" | "invalid-label" | "invalid-option";
export interface TileError { kind: "observation" | "turn" | "options"; index: number; id?: string; code: TileErrorCode }
export type RefusalReason = "no-observations" | "insufficient-coverage" | "insufficient-duration"
  | "insufficient-fraction" | "runner-up-too-strong" | "two-strong-names" | "non-person-name"
  | "bot-own-name" | "name-on-multiple-labels";

export interface DisplayNameClaim { kind: "display-name-claim"; source: "platform-display-name"; verified: false; displayName: string }
export interface TileEvidence {
  agreeSec: number; disagreeSec: number; observedSec: number; totalSec: number;
  runnerUp: { name: string; sec: number } | null; turnIds: string[]; from: number; to: number;
}
export type LabelDecision = { status: "named"; claim: DisplayNameClaim; evidence: TileEvidence } | { status: "refused"; reason: RefusalReason };
export interface LabelResult {
  speakerRef: string; totalSec: number; observedSec: number; candidates: { name: string; sec: number }[]; decision: LabelDecision;
}
export interface TileAlignResult { labels: LabelResult[]; errors: TileError[] }

type Rec = Record<string, unknown>;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const normalizeDisplayName = (s: string): string => s.normalize("NFC").replace(/\s+/gu, " ").trim();

/** Small documented set (NOT a full list; extend through `isNonPersonName`, which can only add refusals). */
const NON_PERSON_WORDS = /(?:^|[^\p{L}\p{N}])(?:iphone|ipad|android|galaxy|pixel|macbook|laptop|room|guest|host|co-host|presenter|panelist|attendee|participant|notetaker|recorder|bot|dial-in|phone|unknown|speaker|moderator|admin|zoom|webex)(?![\p{L}\p{N}])/iu;
const UNSAFE_CHARS = /[\p{Cc}\u{200B}\u{200E}\u{200F}\u{061C}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{FEFF}\u{2028}\u{2029}]/u;
export const MAX_NAME_LENGTH = 100;

function nonPerson(name: string, extra?: (n: string) => boolean): boolean {
  if (name.length > MAX_NAME_LENGTH || UNSAFE_CHARS.test(name) || !/\p{L}/u.test(name) || NON_PERSON_WORDS.test(name)) return true;
  if (extra) { try { return extra(name) !== false; } catch { return true; } }
  return false;
}

function pickNum(o: Rec, key: keyof typeof TILE_DEFAULTS, errors: TileError[]): number {
  const v = o[key];
  if (v === undefined) return TILE_DEFAULTS[key];
  const frac = key !== "minNameSeconds" && key !== "maxHoldSec";
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && (!frac || v <= 1)) return v;
  errors.push({ kind: "options", index: -1, code: "invalid-option" });
  return TILE_DEFAULTS[key];
}
const badTime = (v: unknown): boolean => typeof v !== "number" || !Number.isFinite(v) || v < 0;

interface Hold { from: number; to: number; name: string }
interface Eff { s: number; e: number; id: string }
interface Acc { sec: number; turns: Set<string>; from: number; to: number }

export function alignTileNamesToTurns(logIn: unknown, turnsIn: unknown, optionsIn?: TileAlignOptions): TileAlignResult {
  const errors: TileError[] = [];
  const o: Rec = optionsIn && typeof optionsIn === "object" ? (optionsIn as unknown as Rec) : {};
  const minSec = pickNum(o, "minNameSeconds", errors), minFrac = pickNum(o, "minNameFraction", errors);
  const maxRun = pickNum(o, "maxRunnerUpFraction", errors), minCov = pickNum(o, "minCoverageFraction", errors);
  const maxHold = pickNum(o, "maxHoldSec", errors), minConf = pickNum(o, "minConfidence", errors);
  const extra = typeof o.isNonPersonName === "function" ? (o.isNonPersonName as (n: string) => boolean) : undefined;
  let bot = "";
  if (o.botDisplayName !== undefined) {
    if (typeof o.botDisplayName === "string") bot = normalizeDisplayName(o.botDisplayName).toLowerCase();
    else errors.push({ kind: "options", index: -1, code: "invalid-option" });
  }
  const counter = o.counter && typeof o.counter === "object" ? (o.counter as { ops: number }) : undefined;
  const tick = (): void => { if (counter) counter.ops++; };

  // ---- observations -> holds (disjoint, time-ordered) ----
  const obs: { t: number; name: string | null }[] = [];
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
      obs.push({ t: r.tSec as number, name: name === "" || weak ? null : name });
    });
  } else if (logIn !== undefined) errors.push({ kind: "observation", index: -1, code: "invalid-input" });
  obs.sort((a, b) => a.t - b.t || cmp(a.name ?? "", b.name ?? ""));
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

  // ---- per label: seconds per (name) via binary search + covered-hold walk ----
  const firstEndingAfter = (x: number): number => {
    let lo = 0, hi = holds.length;
    while (lo < hi) { tick(); const mid = (lo + hi) >> 1; if (holds[mid]!.to <= x) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const pre = new Map<string, { res: LabelResult; name: string | null }>();
  for (const label of [...byLabel.keys()].sort(cmp)) {
    const effs = byLabel.get(label)!;
    const acc = new Map<string, Acc>();
    let total = 0;
    for (const { s, e, id } of effs) {
      total += e - s;
      for (let j = firstEndingAfter(s); j < holds.length && holds[j]!.from < e; j++) {
        tick();
        const h = holds[j]!, from = Math.max(s, h.from), to = Math.min(e, h.to);
        if (to <= from) continue;
        let a = acc.get(h.name);
        if (!a) acc.set(h.name, (a = { sec: 0, turns: new Set(), from, to }));
        a.sec += to - from; a.turns.add(id); a.from = Math.min(a.from, from); a.to = Math.max(a.to, to);
      }
    }
    const cands = [...acc.entries()].map(([name, a]) => ({ name, sec: a.sec })).sort((x, y) => y.sec - x.sec || cmp(x.name, y.name));
    const observed = cands.reduce((n, c) => n + c.sec, 0);
    const top = cands[0], second = cands[1];
    const refuse = (reason: RefusalReason): { res: LabelResult; name: null } =>
      ({ res: { speakerRef: label, totalSec: total, observedSec: observed, candidates: cands, decision: { status: "refused", reason } }, name: null });
    const eps = 1e-9;
    let outcome: { res: LabelResult; name: string | null };
    if (!top || observed <= 0) outcome = refuse("no-observations");
    else if (observed + eps < minCov * total) outcome = refuse("insufficient-coverage");
    else if (bot !== "" && top.name.toLowerCase() === bot) outcome = refuse("bot-own-name");
    else if (nonPerson(top.name, extra)) outcome = refuse("non-person-name");
    else if (top.sec + eps < minSec) outcome = refuse("insufficient-duration");
    else if (second && second.sec > maxRun * observed + eps) outcome = refuse(second.sec + eps >= minSec ? "two-strong-names" : "runner-up-too-strong");
    else if (top.sec + eps < minFrac * observed) outcome = refuse("insufficient-fraction");
    else {
      const a = acc.get(top.name)!;
      const evidence: TileEvidence = {
        agreeSec: top.sec, disagreeSec: observed - top.sec, observedSec: observed, totalSec: total,
        runnerUp: second ? { name: second.name, sec: second.sec } : null,
        turnIds: [...a.turns], from: a.from, to: a.to,
      };
      outcome = {
        res: { speakerRef: label, totalSec: total, observedSec: observed, candidates: cands,
          decision: { status: "named", claim: { kind: "display-name-claim", source: "platform-display-name", verified: false, displayName: top.name }, evidence } },
        name: top.name,
      };
    }
    pre.set(label, outcome);
  }

  // ---- cross-label: one display name may not win two labels ----
  const wins = new Map<string, number>();
  for (const { name } of pre.values()) if (name !== null) wins.set(name, (wins.get(name) ?? 0) + 1);
  const labels: LabelResult[] = [];
  for (const { res, name } of pre.values()) {
    if (name !== null && (wins.get(name) ?? 0) > 1) labels.push({ ...res, decision: { status: "refused", reason: "name-on-multiple-labels" } });
    else labels.push(res);
  }
  return { labels, errors };
}
