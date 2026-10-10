/**
 * packages/index/src/pipeline/speaker-reported-rules.ts -- ISS-PH3-001 (critical).
 *
 * "Is this occurrence of a name inside QUOTED or REPORTED speech?" A handover or thanks inside a
 * quotation ("People go, 'Priya, what do you think'"), or after a reporting verb ("He said over to
 * you, Nikhil") is somebody else's sentence, never a live act of this turn. Both guards fail toward
 * REFUSING: a missed correct name costs recall; a wrong name is the critical defect.
 *
 * `isQuotedAt` is applied on EVERY relation route. `isReportedAt` (reporting verbs, which also
 * match ordinary speech such as "I would like to introduce myself, I'm Ruby") is applied only to the
 * third-party routes, where nothing needs to survive it.
 */

const REPORTING = "said|says|say|saying|told|tells|tell|telling|asked|asks|asking|replied|replies|wrote|writes|written|"
  + "mentioned|mentions|announced|added|claimed|claims|stated|explained|heard|shouted|whispered|texted|messaged|"
  + "according to|apparently|reportedly|supposedly|reckon|like|go|goes|went|goin'|gone";
const REPORTING_BEFORE = new RegExp(String.raw`\b(?:${REPORTING})\b`, "iu");
const REPORTING_COLON = new RegExp(String.raw`\b(?:${REPORTING})\b[^:]{0,60}:`, "iu");
const REPORTING_AFTER = /^[\s,]*(?:said|says|told|asked|replied|wrote|mentioned|added|announced|claimed|stated|explained|shouted|whispered|texted)\b/iu;

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

/** Open quote marks of any style (straight, curly, guillemets, CJK corner brackets, single quotes) before `at`. */
export function isQuotedAt(text: string, at: number): boolean {
  const before = text.slice(0, at);
  if (/["“”„«»「」『』][\s,:]*$/u.test(text.slice(Math.max(0, at - 4), at))) return true;
  if (count(before, /["“”„]/gu) % 2 === 1) return true;
  if (count(before, /«/gu) > count(before, /»/gu) || count(before, /[「『]/gu) > count(before, /[」』]/gu)) return true;
  // Single quotes: an opening one follows a space/start/bracket; a closing one follows a letter/punctuation and
  // precedes a space/end/punctuation. A mid-word apostrophe ("I'm", "Priya's") is neither.
  const opens = count(before, /(?:^|[\s(\[—-])['‘](?=\S)/gu);
  const closes = count(before, /(?<=[\p{L}\p{N}.,!?])['’](?=$|[\s.,;:!?)\]—-])/gu);
  return opens > closes;
}

/** Is the occurrence at `at` quoted, or framed by a reporting verb earlier in its clause or right after the name? */
export function isReportedAt(text: string, name: string, at: number): boolean {
  if (isQuotedAt(text, at)) return true;
  const clause = text.slice(0, at).replace(/^[\s\S]*[.!?]/u, "");   // since the last sentence terminator
  if (REPORTING_BEFORE.test(clause)) return true;
  if (REPORTING_COLON.test(text.slice(Math.max(0, at - 120), at))) return true;
  return REPORTING_AFTER.test(text.slice(at + name.length, at + name.length + 24));
}
