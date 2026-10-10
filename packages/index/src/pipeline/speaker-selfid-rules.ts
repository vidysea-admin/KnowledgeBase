/**
 * packages/index/src/pipeline/speaker-selfid-rules.ts -- ISS-PH3-004 (critical), fix cycle 4.
 *
 * "Is THIS occurrence of a name a clean first-person self-identification?" The base cue
 * (`hasNamingCueAt`) strips commas and colons and never looks at the sentence around the cue, so it read
 * "Do you think I am Nikhil?", "I am, Nikhil, still waiting" and "I was told my name is Nikhil" as the
 * speaker naming themself. Reporting and quoting are refused in `relationGate` for every route; THIS module
 * adds what only a self-identification needs. Every rule fails toward REFUSING: a missed name costs recall,
 * a wrong name is the critical defect.
 *
 * Accepted (deliberately): "my name is X", "I am X", "I'm X", "call me X" ("they call me X" included: it
 * states the speaker's own name), "this side X", "X here", "X speaking", "This is <Full Name>" opening a clause.
 * Refused: questions ("Am I X?", "Do you think I am X?"), hypotheticals and hedges (if, suppose, wish, think,
 * maybe), negation in the clause, a comma or full stop between the cue and the name ("I am, X, still waiting"),
 * the name as the start of a longer possessive name ("This is Makrand Rajadhyaksha Sharma's view").
 * Relation instead of identity ("I am with X", "I am next to X", "This is for X", "I am sure X") has no cue
 * directly before the name, so it never matches. Places, organisations and role words ("Hello, I'm Google.")
 * are NOT refused here: D-052 ruling 2 keeps an explicit self-naming cue so a real person named Paris resolves.
 */
import { FUNCTION_FOLLOWERS } from "./speaker-name-rules.js";

const CUE_BEFORE = /(?:^|[^\p{L}'])(?:my name is|my name's|i am|i'm|call me|this side)\s+$/iu;
const THIS_IS_BEFORE = /^([\s\S]*?)(?<![\p{L}'])this is\s+$/iu;
const OPENS = /(?:^|[.!?,;:—-]|\b(?:hi|hello|hey|yes|yeah|okay|ok|so|and|well|now|everyone|all|again|welcome))\s*$/iu;
const QUESTION_OPENER = /^\W*(?:(?:so|and|but|well|okay|ok|now|then|hi|hello|hey)\b[\s,]*)*(?:am|is|are|was|were|do|does|did|can|could|would|will|shall|should|what|who|why|how|where|when|which|isn't|aren't|don't|wasn't)\b/iu;
const HEDGE = /\b(?:if|suppose|supposing|imagine|imagining|assuming|assume|whether|unless|wish|pretend|pretending|maybe|perhaps|might|probably|guess|think\w*|thought|believ\w*|wonder\w*|hope\w*|doubt\w*|were)\b/iu;
const NEGATION = /\b(?:not|never|no|nobody|neither|nor|cannot)\b|n't\b/iu;
const LONGER_POSSESSIVE = /^\s+\p{Lu}[\p{L}'-]*'s\b/u;
/** "Ruby here" / "Ruby speaking" idiom opens a clause: after a verb it is that verb's object ("I do see Ankit here"). */
const OPENS_CLAUSE = /(^|[.!?,;:—-]|\b(hi|hello|hey|yes|yeah|okay|ok))\s*$/iu;

const tidyAfter = (text: string, name: string, at: number): string => text.slice(at + name.length, at + name.length + 28).toLowerCase().replace(/^[\s,:;."'()—-]+/u, "");

export function isCleanSelfIdentificationAt(raw: string, name: string, at: number): boolean {
  const text = raw.replaceAll("’", "'");              // same length, so offsets agree
  const head = text.slice(0, at);
  const sentStart = Math.max(head.lastIndexOf("."), head.lastIndexOf("!"), head.lastIndexOf("?")) + 1;
  const endRel = text.slice(at + name.length).search(/[.!?]/u);
  const sentence = text.slice(sentStart, endRel === -1 ? text.length : at + name.length + endRel + 1);
  if (sentence.trimEnd().endsWith("?") || QUESTION_OPENER.test(sentence.trimStart())) return false;
  const beforeInSentence = text.slice(sentStart, at);
  if (HEDGE.test(beforeInSentence)) return false;
  if (NEGATION.test(beforeInSentence.slice(Math.max(beforeInSentence.lastIndexOf(","), beforeInSentence.lastIndexOf(";"), beforeInSentence.lastIndexOf(":")) + 1))) return false;
  if (LONGER_POSSESSIVE.test(text.slice(at + name.length))) return false;
  if (CUE_BEFORE.test(head)) return true;
  const thisIs = THIS_IS_BEFORE.exec(head);
  if (name.trim().split(/\s+/).length > 1 && thisIs && OPENS.test(thisIs[1] ?? "")) return true;
  const after = tidyAfter(text, name, at);
  const speaking = /^speaking\b\s*([\p{L}']+)?/u.exec(after);
  const afterCue = after.startsWith("here") || after.startsWith("this side") || (!!speaking && (!speaking[1] || FUNCTION_FOLLOWERS.has(speaking[1])));
  return afterCue && OPENS_CLAUSE.test(head.slice(Math.max(0, at - 40)));
}
