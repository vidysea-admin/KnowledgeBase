/**
 * packages/index/src/pipeline/speaker-tile-fusion.ts -- T-042 slice 2 (UNWIRED, PURE). Fuses the two name signals for a diarized
 * speaker LABEL: a platform display-name claim (`alignTileNamesToTurns`, @lkb/core) and clean self-introductions found in the
 * label's own turns. No I/O, no model, nothing imports this. Placement: packages/index, because the self-identification guards live
 * here and `core-imports-nothing` (.dependency-cruiser.cjs) forbids core -> index; index -> core is allowed.
 *
 * SELF-INTRODUCTION EVIDENCE IS NOT PARSED HERE. A name counts as introduced in a turn only if the EXISTING guards accept it:
 * `selfIntroductionCandidates` proposes names, `citesNameAsSelfIdentification` (relationGate: quoted/reported refusal, base naming
 * cue, whole-sentence allow-list, whole-turn second-introduction refusal) judges each. Each turn is judged ALONE: "I am" at the end of
 * one turn and a name at the start of the next never combine. Reported speech ("He said I am X") yields no evidence and no veto.
 *
 * RULES, per label (a wrong name is worse than none):
 *   intro names := distinct names (exact, whitespace/apostrophe-normalised, as the base does) accepted in the label's turns.
 *   - 2+ intro names                          -> none (`intro-names-conflict`: merged voices or self-correction)
 *   - tile refused for contradictory evidence -> none (`tile-contradicted`: two-strong-names, runner-up-too-strong, name-on-multiple-labels)
 *   - tile named + intro, names agree         -> name, basis `agree`
 *   - tile named + intro, names differ        -> none (`tile-intro-conflict`)
 *   - tile named only                         -> name, basis `tile-only` (alignment already demands duration/majority/lag stability)
 *   - intro only                              -> name, basis `intro-only` (the allow-list is whole-sentence; strong alone)
 *   - neither                                 -> none (`no-evidence`)
 *   Agreement = case/NFKC-folded equality, or one name's tokens are a contiguous run of the other's ("Priya" in "Priya Nair"); the
 *   fuller name is returned. A final name that agrees with another label's final name is refused for BOTH (`name-on-multiple-labels`).
 * The result is still a CLAIM about a label, not a verified identity and not a `person:` entity (owner policy on display names is open).
 */
import type { LabelResult, RefusalReason, TileAlignResult } from "@lkb/core";
import { foldKey, normalizeDisplayName } from "@lkb/core";
import { citesNameAsSelfIdentification } from "./speaker-relation-rules.js";
import { selfIntroductionCandidates } from "./speaker-selfid-rules.js";

export interface FusionTurn { id: string; tStart: number; tEnd: number; speakerRef: string; text: string }
export interface FusionOptions { allowTileOnly?: boolean; allowIntroOnly?: boolean; maxTurnChars?: number }
export const FUSION_DEFAULTS = { allowTileOnly: true, allowIntroOnly: true, maxTurnChars: 50_000 } as const;
export type FusionBasis = "agree" | "tile-only" | "intro-only";
export type FusionNoneReason = "no-evidence" | "intro-names-conflict" | "tile-contradicted" | "tile-intro-conflict" | "name-on-multiple-labels" | "source-disabled";
export type FusionErrorCode = "invalid-turn" | "invalid-id" | "duplicate-id" | "invalid-time" | "invalid-text" | "text-too-long";
export interface FusionError { index: number; id?: string; code: FusionErrorCode }
export interface SourceEvidence { name: string; turnIds: string[]; from: number; to: number }
export type LabelFusion = { speakerRef: string; tile: SourceEvidence | null; intro: SourceEvidence | null; introNames: string[]; tileRefusal: RefusalReason | null } & (
  | { status: "named"; name: string; basis: FusionBasis; verified: false }
  | { status: "none"; reason: FusionNoneReason });
export interface TurnName { turnId: string; speakerRef: string; tStart: number; tEnd: number; name: string | null; basis: FusionBasis | null; reason: FusionNoneReason | null }
export interface FusionResult { labels: LabelFusion[]; turns: TurnName[]; errors: FusionError[] }

const CONTRADICTED: ReadonlySet<RefusalReason> = new Set<RefusalReason>(["two-strong-names", "runner-up-too-strong", "name-on-multiple-labels"]);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const introKey = (s: string): string => s.replaceAll("’", "'").replace(/\s+/gu, " ").trim();
const tokens = (s: string): string[] => foldKey(normalizeDisplayName(s)).split(" ").filter(Boolean);
const contiguous = (small: string[], big: string[]): boolean => small.length > 0 && big.some((_, i) => small.every((t, k) => big[i + k] === t));
/** Same person-string: folded-equal, or one is a whole-token contiguous part of the other. */
export const namesAgree = (a: string, b: string): boolean => { const [x, y] = [tokens(a), tokens(b)]; return contiguous(x, y) || contiguous(y, x); };
const fuller = (a: string, b: string): string => (tokens(a).length >= tokens(b).length ? a : b);

/** Names the existing guards accept as a clean first-person self-introduction in ONE turn's text. Never throws. */
export function acceptedIntroNames(text: string): string[] {
  try {
    return [...new Set(selfIntroductionCandidates(text))].filter((n) => citesNameAsSelfIdentification(text, n));
  } catch { return []; }
}

function cleanTurns(turnsIn: unknown, maxTurnChars: number, errors: FusionError[]): FusionTurn[] {
  const raw: unknown[] = Array.isArray(turnsIn) ? turnsIn : [];
  const idCount = new Map<string, number>();
  for (const t of raw) { const id = (t as FusionTurn | null)?.id; if (typeof id === "string") idCount.set(id, (idCount.get(id) ?? 0) + 1); }
  const turns: FusionTurn[] = [];
  raw.forEach((t, index) => {
    const r = (t !== null && typeof t === "object" ? t : null) as Record<string, unknown> | null;
    if (!r) return void errors.push({ index, code: "invalid-turn" });
    const id = typeof r.id === "string" && r.id !== "" ? r.id : undefined;
    if (id === undefined || typeof r.speakerRef !== "string" || r.speakerRef === "") return void errors.push({ index, code: "invalid-id" });
    if ((idCount.get(id) ?? 0) > 1) return void errors.push({ index, id, code: "duplicate-id" });
    if (!isNum(r.tStart) || !isNum(r.tEnd) || r.tEnd < r.tStart || r.tStart < 0) return void errors.push({ index, id, code: "invalid-time" });
    if (typeof r.text !== "string") return void errors.push({ index, id, code: "invalid-text" });
    if (r.text.length > maxTurnChars) return void errors.push({ index, id, code: "text-too-long" });
    turns.push({ id, tStart: r.tStart, tEnd: r.tEnd, speakerRef: r.speakerRef, text: r.text });
  });
  return turns.sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd || cmp(a.id, b.id));
}

export function fuseSpeakerNames(tileIn: TileAlignResult | readonly LabelResult[] | null | undefined, turnsIn: unknown, optionsIn?: FusionOptions): FusionResult {
  const o = { ...FUSION_DEFAULTS, ...(optionsIn ?? {}) };
  const errors: FusionError[] = [];
  const turns = cleanTurns(turnsIn, o.maxTurnChars, errors);

  const tileLabels = new Map<string, LabelResult>();
  const tileList: readonly unknown[] = Array.isArray(tileIn) ? tileIn : ((tileIn as TileAlignResult | null)?.labels ?? []);
  for (const l of tileList) { const r = l as LabelResult | null; if (r && typeof r.speakerRef === "string" && r.decision) tileLabels.set(r.speakerRef, r); }

  const byLabel = new Map<string, FusionTurn[]>();
  for (const t of turns) { const a = byLabel.get(t.speakerRef); if (a) a.push(t); else byLabel.set(t.speakerRef, [t]); }

  const labels: LabelFusion[] = [];
  for (const ref of [...byLabel.keys()].sort(cmp)) {
    const mine = byLabel.get(ref)!;
    const introBy = new Map<string, FusionTurn[]>();                 // key -> turns that accepted it
    for (const t of mine) for (const n of acceptedIntroNames(t.text)) { const k = introKey(n); const a = introBy.get(k); if (a) a.push(t); else introBy.set(k, [t]); }
    const introNames = [...introBy.keys()].sort(cmp);
    const first = introNames[0];
    const src = first === undefined ? [] : introBy.get(first)!;
    const intro: SourceEvidence | null = introNames.length === 1 && first !== undefined
      ? { name: first, turnIds: src.map((t) => t.id), from: Math.min(...src.map((t) => t.tStart)), to: Math.max(...src.map((t) => t.tEnd)) } : null;
    const tl = tileLabels.get(ref)?.decision;
    const tile: SourceEvidence | null = tl?.status === "named" ? { name: tl.claim.displayName, turnIds: [...tl.evidence.turnIds], from: tl.evidence.from, to: tl.evidence.to } : null;
    const tileRefusal = tl?.status === "refused" ? tl.reason : null;
    const base = { speakerRef: ref, tile, intro, introNames, tileRefusal };
    const none = (reason: FusionNoneReason): LabelFusion => ({ ...base, status: "none", reason });
    const named = (name: string, basis: FusionBasis): LabelFusion => ({ ...base, status: "named", name, basis, verified: false });
    if (introNames.length > 1) labels.push(none("intro-names-conflict"));
    else if (tileRefusal !== null && CONTRADICTED.has(tileRefusal)) labels.push(none("tile-contradicted"));
    else if (tile && intro) labels.push(namesAgree(tile.name, intro.name) ? named(fuller(tile.name, intro.name), "agree") : none("tile-intro-conflict"));
    else if (tile) labels.push(o.allowTileOnly ? named(tile.name, "tile-only") : none("source-disabled"));
    else if (intro) labels.push(o.allowIntroOnly ? named(intro.name, "intro-only") : none("source-disabled"));
    else labels.push(none("no-evidence"));
  }
  // A name that two labels would carry is refused for both (diarizer split, or two people on one device).
  const finals = labels.flatMap((l, i) => (l.status === "named" ? [{ i, name: l.name }] : []));
  const clash = new Set<number>();
  for (const a of finals) for (const b of finals) if (a.i < b.i && namesAgree(a.name, b.name)) { clash.add(a.i); clash.add(b.i); }
  const out = labels.map((l, i): LabelFusion => (clash.has(i)
    ? { speakerRef: l.speakerRef, tile: l.tile, intro: l.intro, introNames: l.introNames, tileRefusal: l.tileRefusal, status: "none", reason: "name-on-multiple-labels" } : l));
  const byRef = new Map(out.map((l) => [l.speakerRef, l]));
  const turnNames: TurnName[] = turns.map((t) => {
    const l = byRef.get(t.speakerRef)!;
    return { turnId: t.id, speakerRef: t.speakerRef, tStart: t.tStart, tEnd: t.tEnd, name: l.status === "named" ? l.name : null, basis: l.status === "named" ? l.basis : null, reason: l.status === "none" ? l.reason : null };
  });
  return { labels: out, turns: turnNames, errors };
}
