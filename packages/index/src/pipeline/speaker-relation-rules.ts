/**
 * packages/index/src/pipeline/speaker-relation-rules.ts -- ISS-282 / ISS-104 (U2.4 phase-3 re-gate).
 *
 * Split from speaker-name-rules.ts (300-line budget). The cue rule there says a turn NAMES someone,
 * never WHO. Every wrong identity in the re-gate was a third party ("Thank you, Sonal", "Let me first
 * introduce Shithij") credited to the speaking label. These split it by DIRECTION; `speakers-llm.ts`
 * pairs each with a RELATION between the evidence turn and the label's block.
 *
 * FIX CYCLE 3 (ISS-PH3-002 / ISS-PH3-001, critical). Cycle 2 claimed every predicate sat on top of the
 * base cue; only self-identification did, so handover and thanks shipped places, organisations and
 * quoted speech the base refused. Now EVERY predicate is built through `relationGate`, the only place
 * that decides an occurrence may bind; a predicate supplies just its pattern-specific check and cannot
 * be exported without it. Handover and thanks are switched OFF in `RELATION_ROUTES`: a third-party
 * address of a bare capitalised word ("Over to you, India." / "Thank you, Google.") is not
 * distinguishable from a person without the place lookup D-052 ruled out, and the base protections
 * cannot be applied to it (the base refuses a handover context by design). Re-enable only after the
 * live run, with the differential test (speakers-differential.test.ts) re-read.
 */
import type { Turns } from "@lkb/core";
import {
  FUNCTION_FOLLOWERS, HANDOVER_MARKERS, SELF_NAMING_CUES, containsNameVerbatim, hasNamingCueAt, isDiscourseOnly, looksLikeAName,
  nameOccurrences, readsAsAPlaceOrOrg,
} from "./speaker-name-rules.js";
import { isQuotedAt, isReportedAt } from "./speaker-reported-rules.js";

export type RelationRoute = "selfIdentification" | "handover" | "thanks";
/** Which relation routes may bind a name. Production values; tests may pass an override to `relationGate`. */
export const RELATION_ROUTES: Readonly<Record<RelationRoute, boolean>> = { selfIdentification: true, handover: false, thanks: false };

/**
 * THE gate. An occurrence of `name` may bind only if the route is on, the candidate is name-shaped and
 * not a function word, the occurrence is not inside quoted speech, and then:
 *  - selfIdentification: the BASE cue `hasNamingCueAt` (place-vs-person, organisation, handover refusal);
 *  - handover / thanks (third-party routes): not a place/organisation reading, not reported speech.
 * The pattern-specific `check(at)` may only ADD conditions on top of that.
 */
export function relationGate(route: RelationRoute, text: string, name: string, check: (at: number) => boolean,
  routes: Readonly<Record<RelationRoute, boolean>> = RELATION_ROUTES): boolean {
  if (!routes[route] || !looksLikeAName(name) || isDiscourseOnly(name)) return false;
  const thirdParty = route !== "selfIdentification";
  if (thirdParty && readsAsAPlaceOrOrg(text, name)) return false;
  return nameOccurrences(text, name).some((at) => !isQuotedAt(text, at) &&
    (thirdParty ? !isReportedAt(text, name, at) : hasNamingCueAt(text, name, at)) && check(at));
}

/** Forward cues: the named person speaks NEXT. Thanks look backward (`citesNameAsThanks`). */
const HANDOVER_CUES_BEFORE = ["over to", "hand over to", "handing over to", "introduce", "introducing",
  "please welcome", "joined by", "next presenter is", "next up is", "speaker is", "presenter is"];
const HANDOVER_FOLLOWERS = ["please go ahead", "go ahead", "over to you", "the stage is yours", "the floor is yours"];
const tidyBefore = (text: string, at: number): string => text.slice(Math.max(0, at - 40), at).toLowerCase().replace(/[\s,:;."'’()—-]+$/u, "");
const tidyAfter = (text: string, name: string, at: number): string => text.slice(at + name.length, at + name.length + 28).toLowerCase().replace(/^[\s,:;."'’()—-]+/u, "");

/**
 * "X here" / "X speaking" / "X this side" name the speaker only when X OPENS a clause ("Hi all,
 * Ruby here"). After a verb it is that verb's object: "I do see Ankit here" is the host spotting a
 * panelist (c1 replay: spk:0 -> Ankit, gold Jubin Thakkar, 3/3 runs).
 */
const opensClause = (text: string, at: number): boolean =>
  /(^|[.!?,;:—-]|\b(hi|hello|hey|yes|yeah|okay|ok))\s*$/iu.test(text.slice(Math.max(0, at - 40), at));

/** The speaker names ITSELF: "my name is X", "this side X", "X here", "X speaking.", "This is X Y". */
export function citesNameAsSelfIdentification(text: string, name: string, routes?: Readonly<Record<RelationRoute, boolean>>): boolean {
  return relationGate("selfIdentification", text, name, (at) => {
    const [before, after] = [tidyBefore(text, at), tidyAfter(text, name, at)];
    const speaking = /^speaking\b\s*([\p{L}']+)?/u.exec(after);
    const afterCue = after.startsWith("here") || after.startsWith("this side") || (!!speaking && (!speaking[1] || FUNCTION_FOLLOWERS.has(speaking[1])));
    return [...SELF_NAMING_CUES, "this side"].some((c) => before.endsWith(c)) ||
      (afterCue && opensClause(text, at)) || (name.trim().split(/\s+/).length > 1 && before.endsWith("this is"));
  }, routes);
}

/**
 * Relation cues are an ALLOWLIST of address SHAPES: an address counts only when it OPENS a clause
 * (turn start, sentence punctuation, a filler, a fixed call-on lead-in). Quoted and reported speech
 * is refused in `relationGate` by speaker-reported-rules.ts, which only ever adds refusals.
 */
const LEAD_IN = String.raw`(?:^|[.!?]|\b(?:uh|um|so|okay|ok|and|now|alright|right|well|yes|perfect|great|with that|ask you|to you))[\s,]*`;
const OPENS_VOCATIVE = new RegExp(`${LEAD_IN}$`, "iu");
const OPENS_GREETING = new RegExp(`${LEAD_IN}(?:hi|hello|hey|welcome|good (?:morning|afternoon|evening))[\\s,]*$`, "iu");
const OPENS_THANKS = new RegExp(`${LEAD_IN}(?:thank you|thanks)(?: (?:so|very) much| a lot| a ton| a bunch| again)?[\\s,]*$`, "iu");

/**
 * Forward address, in the turn's closing stretch where the floor is handed on: a handover ("over
 * to you, Nikhil", "I invite ... X"), a clause-opening greeting ("Hi, Nikhil."), or a clause-opening
 * call ("Rashi, I'll pass it on back to you", "ask you, Nupur, what do you think").
 */
const CLOSING = 200;
const CALLED_ON = ["what", "how", "would", "could", "can you", "do you", "did you", "any ", "your", "please", "i'll pass", "i will pass"];
export function citesNameAsHandover(text: string, name: string, routes?: Readonly<Record<RelationRoute, boolean>>): boolean {
  return relationGate("handover", text, name, (at) => {
    const [before, after, rest, lead] = [tidyBefore(text, at), tidyAfter(text, name, at), text.slice(at + name.length), text.slice(0, at)];
    return text.length - at <= CLOSING && (HANDOVER_CUES_BEFORE.some((c) => before.endsWith(c)) ||
      HANDOVER_MARKERS.some((m) => text.slice(Math.max(0, at - 40), at).toLowerCase().includes(m)) ||
      (OPENS_GREETING.test(lead) && /^\s*[,.!]/u.test(rest)) ||
      (OPENS_VOCATIVE.test(lead) && /^\s*,/u.test(rest) && [...HANDOVER_FOLLOWERS, ...CALLED_ON].some((c) => after.startsWith(c))));
  }, routes);
}

/**
 * Backward address: a clause-opening "Thank you, X" in a turn's first 120 chars, closed by
 * punctuation, "for" or "and", thanks the person who JUST spoke. A turn thanking two people
 * ("Thank you, Kshitij. Thanks, Anisha") does not say which of them spoke last: it binds neither.
 */
const THANKED = /\b[Tt]hank(?:s| you)(?: (?:so|very) much| a lot| a ton| a bunch| again| also)?(?: to)?[\s,]+(\p{Lu}[\p{L}'’-]*)/gu;
export function citesNameAsThanks(text: string, name: string, routes?: Readonly<Record<RelationRoute, boolean>>): boolean {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if ([...text.matchAll(THANKED)].some((m) => m[1] !== first && !isDiscourseOnly(m[1] ?? ""))) return false;
  return relationGate("thanks", text, name, (at) => at <= 120 &&
    OPENS_THANKS.test(text.slice(0, at)) && /^(\s*[.!?]|\s*$|,?\s+for\b|,\s+and\b)/u.test(text.slice(at + name.length)), routes);
}

/**
 * ISS-282: the turns that NAME `label` as `name` for ONE block, by relation to it: the block's own
 * self-identification; the turn just BEFORE it handing over / greeting / calling on the name; or
 * the turn just AFTER it thanking the name. A block that mentions the name itself in the third
 * person ("I think Sonal is not having any questions") is talking ABOUT that person, so only its
 * own self-identification can bind it. Every returned turn contains the name verbatim.
 */
export function namingTurns(turns: Turns[], label: string, name: string, b: { startTurnIndex: number; endTurnIndex: number }): number[] {
  const text = (k: number) => turns[k]?.text ?? "";
  const inBlock = Array.from({ length: b.endTurnIndex - b.startTurnIndex + 1 }, (_, k) => b.startTurnIndex + k);
  const own = inBlock.filter((k) => citesNameAsSelfIdentification(text(k), name));
  if (inBlock.some((k) => !own.includes(k) && containsNameVerbatim(text(k), name))) return own;
  const [before, after] = [b.startTurnIndex - 1, b.endTurnIndex + 1];
  const fwd = turns[before] && turns[before].speakerRef !== label && citesNameAsHandover(text(before), name) ? [before] : [];
  const back = turns[after] && turns[after].speakerRef !== label && citesNameAsThanks(text(after), name) ? [after] : [];
  return [...fwd, ...own, ...back];
}
