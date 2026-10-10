/**
 * packages/index/src/pipeline/speaker-relation-rules.ts -- ISS-282 / ISS-104 (U2.4 phase-3 re-gate).
 *
 * Split from speaker-name-rules.ts (300-line budget). The cue rule there says a turn NAMES someone,
 * never WHO. Every wrong identity in the re-gate was a third party ("Thank you, Sonal", "Let me first
 * introduce Shithij") credited to the speaking label. These split it by DIRECTION; `speakers-llm.ts`
 * pairs each with a RELATION between the evidence turn and the label's block.
 *
 * FIX CYCLE 3 (ISS-PH3-002 / ISS-PH3-001, critical). Every predicate is built through `relationGate`, the
 * only place that decides an occurrence may bind. Handover and thanks are OFF: a third-party address of a
 * bare capitalised word ("Over to you, India.") is not distinguishable from a person without the place
 * lookup D-052 ruled out. Re-enable only after the live run.
 *
 * FIX CYCLE 4 (ISS-PH3-004 critical, ISS-PH3-005 low). The guards are now ROUTE-INDEPENDENT: quoted and
 * reported speech are refused for every route before any pattern is looked at (cycle 3 skipped the reported
 * guard on self-identification, so "He said I am Nikhil." shipped through a neighbouring citation). The route
 * table is frozen and the per-call `routes` override is gone: production code cannot switch a route on.
 * Self-identification additionally passes `isCleanSelfIdentificationAt` (questions, hedges, negation, comma
 * address, longer possessive names; speaker-selfid-rules.ts).
 */
import type { Turns } from "@lkb/core";
import { HANDOVER_MARKERS, containsNameVerbatim, hasNamingCueAt, isDiscourseOnly, looksLikeAName, nameOccurrences, readsAsAPlaceOrOrg } from "./speaker-name-rules.js";
import { isReportedAt } from "./speaker-reported-rules.js";
import { isCleanSelfIdentificationAt } from "./speaker-selfid-rules.js";

export type RelationRoute = "selfIdentification" | "handover" | "thanks";
/** Which relation routes may bind a name. Frozen: a route is switched on by editing this line, in a reviewed change. */
export const RELATION_ROUTES: Readonly<Record<RelationRoute, boolean>> = Object.freeze({ selfIdentification: true, handover: false, thanks: false } as const);

/** Forward cues: the named person speaks NEXT. Thanks look backward. */
const HANDOVER_CUES_BEFORE = ["over to", "hand over to", "handing over to", "introduce", "introducing",
  "please welcome", "joined by", "next presenter is", "next up is", "speaker is", "presenter is"];
const HANDOVER_FOLLOWERS = ["please go ahead", "go ahead", "over to you", "the stage is yours", "the floor is yours"];
const tidyBefore = (text: string, at: number): string => text.slice(Math.max(0, at - 40), at).toLowerCase().replace(/[\s,:;."'’()—-]+$/u, "");
const tidyAfter = (text: string, name: string, at: number): string => text.slice(at + name.length, at + name.length + 28).toLowerCase().replace(/^[\s,:;."'’()—-]+/u, "");

/** Relation cues are an ALLOWLIST of address SHAPES: an address counts only when it OPENS a clause. */
const LEAD_IN = String.raw`(?:^|[.!?]|\b(?:uh|um|so|okay|ok|and|now|alright|right|well|yes|perfect|great|with that|ask you|to you))[\s,]*`;
const OPENS_VOCATIVE = new RegExp(`${LEAD_IN}$`, "iu");
const OPENS_GREETING = new RegExp(`${LEAD_IN}(?:hi|hello|hey|welcome|good (?:morning|afternoon|evening))[\\s,]*$`, "iu");
const OPENS_THANKS = new RegExp(`${LEAD_IN}(?:thank you|thanks)(?: (?:so|very) much| a lot| a ton| a bunch| again)?[\\s,]*$`, "iu");
const CLOSING = 200;
const CALLED_ON = ["what", "how", "would", "could", "can you", "do you", "did you", "any ", "your", "please", "i'll pass", "i will pass"];
/** A clause-opening "Thank you, X" in a turn's first 120 chars thanks the person who JUST spoke; a turn thanking two people binds neither. */
const THANKED = /\b[Tt]hank(?:s| you)(?: (?:so|very) much| a lot| a ton| a bunch| again| also)?(?: to)?[\s,]+(\p{Lu}[\p{L}'’-]*)/gu;

/** The pattern-specific check of each route, at ONE occurrence. It can only ADD conditions to the gate's guards. */
const PATTERNS: Record<RelationRoute, (text: string, name: string, at: number) => boolean> = {
  selfIdentification: (text, name, at) => isCleanSelfIdentificationAt(text, name, at),
  handover: (text, name, at) => {
    const [before, after, rest, lead] = [tidyBefore(text, at), tidyAfter(text, name, at), text.slice(at + name.length), text.slice(0, at)];
    return text.length - at <= CLOSING && (HANDOVER_CUES_BEFORE.some((c) => before.endsWith(c)) ||
      HANDOVER_MARKERS.some((m) => text.slice(Math.max(0, at - 40), at).toLowerCase().includes(m)) ||
      (OPENS_GREETING.test(lead) && /^\s*[,.!]/u.test(rest)) ||
      (OPENS_VOCATIVE.test(lead) && /^\s*,/u.test(rest) && [...HANDOVER_FOLLOWERS, ...CALLED_ON].some((c) => after.startsWith(c))));
  },
  thanks: (text, name, at) => {
    const first = name.trim().split(/\s+/)[0] ?? "";
    if ([...text.matchAll(THANKED)].some((m) => m[1] !== first && !isDiscourseOnly(m[1] ?? ""))) return false;
    return at <= 120 && OPENS_THANKS.test(text.slice(0, at)) && /^(\s*[.!?]|\s*$|,?\s+for\b|,\s+and\b)/u.test(text.slice(at + name.length));
  },
};

/**
 * ONE occurrence, every guard, NO route switch. Order: name-shaped and not a function word; then, for EVERY route
 * and before any pattern, not quoted and not reported speech (`isReportedAt`); then the route's own base
 * protection (self-identification: the base cue `hasNamingCueAt`; third parties: not a place/organisation
 * reading); then the pattern. TEST SEAM ONLY: it ignores `RELATION_ROUTES`, so the tests can ask what a route
 * WOULD ship if switched on. No production module may import it (pinned by a test that scans src/).
 */
export function occurrenceAccepted(route: RelationRoute, text: string, name: string, at: number): boolean {
  if (!looksLikeAName(name) || isDiscourseOnly(name)) return false;
  if (isReportedAt(text, name, at)) return false;
  if (route === "selfIdentification" ? !hasNamingCueAt(text, name, at) : readsAsAPlaceOrOrg(text, name)) return false;
  return PATTERNS[route](text, name, at);
}

/** THE gate: the route must be on (frozen table) and some occurrence of `name` must pass every guard. */
export function relationGate(route: RelationRoute, text: string, name: string): boolean {
  return RELATION_ROUTES[route] === true && nameOccurrences(text, name).some((at) => occurrenceAccepted(route, text, name, at));
}

/** The speaker names ITSELF: "my name is X", "I am X", "X here", "X speaking.", "This is X Y". */
export const citesNameAsSelfIdentification = (text: string, name: string): boolean => relationGate("selfIdentification", text, name);
/** Forward address: a handover, a clause-opening greeting or call-on. OFF in production. */
export const citesNameAsHandover = (text: string, name: string): boolean => relationGate("handover", text, name);
/** Backward address: a clause-opening "Thank you, X". OFF in production. */
export const citesNameAsThanks = (text: string, name: string): boolean => relationGate("thanks", text, name);

/**
 * ISS-282: the turns that NAME `label` as `name` for ONE block, by relation to it.
 * BLOCK-BINDING RULE (cycle 4): a self-identification binds only the label whose OWN turn holds it. The block is
 * the label's own run of turns, so a model citation of a NEIGHBOURING turn (another label's, or a turn that
 * merely sits next to the block) only LOCATES the block; it ships only if a turn of this label inside the block,
 * itself spoken by this label, is a clean self-identification (relationGate). A neighbour's turn is never
 * evidence for this label (handover and thanks are OFF). A block that mentions the name in the third person
 * ("I think Sonal is not having any questions") can only be bound by its own self-identification.
 */
export function namingTurns(turns: Turns[], label: string, name: string, b: { startTurnIndex: number; endTurnIndex: number }): number[] {
  const text = (k: number) => turns[k]?.text ?? "";
  const inBlock = Array.from({ length: b.endTurnIndex - b.startTurnIndex + 1 }, (_, k) => b.startTurnIndex + k).filter((k) => turns[k]?.speakerRef === label);
  const own = inBlock.filter((k) => citesNameAsSelfIdentification(text(k), name));
  if (inBlock.some((k) => !own.includes(k) && containsNameVerbatim(text(k), name))) return own;
  const [before, after] = [b.startTurnIndex - 1, b.endTurnIndex + 1];
  const fwd = turns[before] && turns[before].speakerRef !== label && citesNameAsHandover(text(before), name) ? [before] : [];
  const back = turns[after] && turns[after].speakerRef !== label && citesNameAsThanks(text(after), name) ? [after] : [];
  return [...fwd, ...own, ...back];
}
