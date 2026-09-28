/**
 * packages/index/src/pipeline/speaker-name-rules.ts — "is this string, in this turn, a real
 * mention of a person's name?"
 *
 * Split out of `speakers-llm.ts` when that file crossed the 300-line budget. The seam is real
 * rather than convenient: these rules answer a question about NAMES and TEXT, know nothing about
 * providers, jobs or extraction, and are the part that three consecutive checker cycles attacked.
 * Keeping them together makes the whole anti-fabrication surface readable in one screen.
 *
 * The rules are four independent guards, each pinned by its own mutation test. They constrain
 * different things and none subsumes another:
 *
 *   looksLikeAName        the candidate is shaped like a name       (rejects "a lot", clauses)
 *   isDiscourseOnly       the candidate is not a function word      (rejects "Everyone", "To")
 *   containsNameVerbatim  the turn contains it as a whole name      (rejects "Ruby" in "Ruby-Anne")
 *   citesNameAsAnIntroduction  the turn is NAMING someone           (rejects passing mentions)
 *
 * The history is worth keeping: cycle 1 had containment only, and "Juben Thakur" -- a spelling the
 * summarizer invented for a real person -- would have shipped. Cycle 2 added shape, and 20 of 20
 * fabricated people still shipped because shape tests capitalisation, not nameness. Cycle 3 added
 * the discourse denylist and made the cues person-directed. Each cycle's fix was necessary and
 * none was sufficient.
 */

import { DEMONSTRATIVE_CUES, LOCATIVE_GOVERNORS, NEVER_A_PERSON } from "./speaker-name-data.js";

/**
 * Name particles that are legitimately lowercase INSIDE a name ("van der Berg", "de Souza").
 * Never valid as the first token, which is why `looksLikeAName` only allows them at i > 0.
 */
const NAME_PARTICLES = new Set([
  "van", "von", "der", "den", "de", "del", "della", "di", "da", "dos", "du", "la", "le",
  "bin", "binte", "ibn", "al", "el",
]);

/**
 * Is this string shaped like a person's name at all?
 *
 * The model supplies `displayName`, so "it appears in the transcript" is not sufficient -- a
 * greeting appears in the transcript too. The cycle-1 checker got `"Good morning"` shipped as
 * `person:good-morning` on exactly that gap. Requiring each token to be capitalised (bar interior
 * particles) rejects prose while keeping real names.
 *
 * Deliberately conservative, consistent with "leave low-confidence speakers unresolved rather than
 * guessing": an all-lowercase real name, or one longer than four tokens, is refused not guessed.
 */
export function looksLikeAName(name: string): boolean {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  return tokens.every((tok, i) => {
    if (/^\p{Lu}[\p{L}'’.-]*$/u.test(tok)) return true;
    return i > 0 && i < tokens.length - 1 && NAME_PARTICLES.has(tok.toLowerCase());
  });
}

/**
 * Does `text` contain `name` as a whole name?
 *
 * Two guards failed open before. A bare `includes()` let "Ruby" match "Rubykumar Shah" (ISS-092's
 * ancestor). Then a letters-and-digits boundary let "Ruby" match "Ruby-Anne Smith" -- because this
 * function treated "-" as a boundary while `looksLikeAName` admits "-" INSIDE a name. Two
 * contradictory definitions of where a name ends, and the containment side is the one that fails
 * open, so it is the one that had to move.
 *
 * `NAME_JOINERS` is therefore shared by both: a character that can sit inside a name can never
 * simultaneously mark its edge. "." is deliberately NOT a joiner here -- it ends far more sentences
 * than it joins names, and treating it as one would refuse "My name is Ruby."
 *
 * Deliberately not a RegExp: it would have to be built from a model-supplied string, and a
 * mis-escape fails OPEN by widening what matches. indexOf has no escaping surface.
 */
const NAME_JOINERS = new Set(["-", "'", "\u2019"]);

export function containsNameVerbatim(text: string, name: string): boolean {
  const isNameChar = (ch: string | undefined): boolean =>
    ch !== undefined && (/[\p{L}\p{N}]/u.test(ch) || NAME_JOINERS.has(ch));
  for (let from = 0; ; ) {
    const at = text.indexOf(name, from);
    if (at === -1) return false;
    if (!isNameChar(text[at - 1]) && !isNameChar(text[at + name.length])) return true;
    from = at + 1;
  }
}

/**
 * Cue phrases that mark an act of NAMING, checked immediately adjacent to the candidate.
 *
 * ISS-091: `looksLikeAName` tests capitalisation, not nameness, and transcript prose capitalises
 * nearly every sentence start -- so "Welcome", "Thanks", "Okay" and even the bare pronoun "I" all
 * shipped as people. "Good morning" was caught only because English lowercases "morning". Shape is
 * necessary, not sufficient.
 *
 * A naming cue is used rather than a stopword list because a stopword list is unbounded and
 * language-specific, while a cue is positive evidence that this turn introduces or addresses
 * someone -- which is exactly what the LLM path's prompt asks the model to find. It also costs
 * recall on purpose: a name mentioned with no cue in that turn is refused rather than guessed at.
 *
 * These are fixed constants, never model-supplied, so a RegExp here carries no injection surface.
 */

/** Is every token of this candidate a discourse word? Then it is not a person, whatever the cue. */
export function isDiscourseOnly(name: string): boolean {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => NEVER_A_PERSON.has(t.toLowerCase().replace(/[.,!?;:]+$/u, "")));
}

/**
 * Cue phrases that mark a PERSON-DIRECTED act of naming.
 *
 * ISS-093 also showed the cue list itself was too loose: bare "welcome" / "hi" / "thanks" precede
 * objects and greetings at least as often as people ("Welcome Diwali celebrations", "Hi Team"), so
 * they are gone as standalone cues. What remains either names the speaker explicitly, hands over
 * to them, or addresses them directly with punctuation that only address takes.
 *
 * ISS-094: cycle 2 over-corrected and refused the greeting / handover / third-party-mention class
 * this contract exists to admit -- "Good morning Prasanti, please go ahead." and "Prasanti, what do
 * you think?" were both dropped. Those are back, but only in their genuinely address-shaped forms.
 *
 * Fixed constants, never model-supplied, so the RegExps built from them carry no injection surface.
 */
const NAMING_CUES_BEFORE = [
  "my name is", "my name's", "i am", "i'm", "this side",
  "call me", "joined by", "joining us", "introduce", "introducing", "presenting",
  "over to", "hand over to", "handing over to", "next presenter is", "next up is",
  "speaker is", "presenter is", "please welcome",
];
/**
 * Handover markers (ISS-255): a turn whose before-context contains one of these is the CURRENT
 * speaker INTRODUCING SOMEONE ELSE — "I invite our next speaker, Ruby, from Uni-Italia". Such a
 * cue is evidence Ruby exists and speaks NEXT, never that the turn's own label IS Ruby. The live
 * U2.4 phase-3 eval shipped exactly that inversion: the moderator was accepted as `Ruby` off his
 * own handover turn while the real Ruby (spk:2) self-named one turn later.
 *
 * So when a handover marker sits in the before-context, only a SELF-NAMING cue can still bind
 * the name to the speaking label ("my name is X" inside the same turn); every other cue branch
 * (after-cues like `from`/`here`/`speaking`, greetings, demonstratives, address) is refused for
 * that occurrence.
 */
const HANDOVER_MARKERS = [
  "invite", "invited", "inviting", "welcome our next speaker", "next speaker",
  // ISS-104: "Coming up next, Mumbai from the west zone." was read as a place bypass for six
  // rounds. It is a handover — the person-valid twin "Coming up next, Nilesh from the west zone."
  // must be refused for THIS label too, whoever the name belongs to.
  "next presenter", "next up", "coming up next", "hand over", "handing over", "over to",
  "take us forward", "to take us through", "to take us into", "pass the mic",
];
/** Cues whose subject is the SPEAKER THEMSELF — the only ones that survive a handover context. */
const SELF_NAMING_CUES = ["my name is", "my name's", "i am", "i'm", "call me"];
/** Address greetings: only a cue when the name is followed by address punctuation (see below). */
const ADDRESS_GREETINGS = ["good morning", "good afternoon", "good evening", "welcome", "hi", "hello", "hey", "thank you", "thanks"];
const NAMING_CUES_AFTER = ["here", "speaking", "from", "with us", "joining us"];
/** Interrogatives that follow a direct address: "Prasanti, what do you think?" */
const ADDRESS_FOLLOWERS = ["what", "how", "would", "could", "do you", "can you", "any", "your", "please", "over to you"];

/** Is the occurrence of `name` at `at` a person-directed act of naming, not a passing mention? */
/**
 * Words that may follow `speaking` in the self-identification idiom: prepositions, conjunctions
 * and adverbs. Anything NOT here and not punctuation is taken to be a noun that `speaking` is
 * modifying, which makes it a participle rather than a cue (ISS-097 / ISS-098).
 *
 * Stated as the complement on purpose: the first attempt allowlisted what may follow and refused
 * the rest, which is the opposite rule and cost ten recorded introductions.
 */
const FUNCTION_FOLLOWERS = new Set([
  "from", "on", "at", "for", "with", "to", "in", "of", "about", "as", "over", "after", "before",
  "during", "via", "by", "into", "through", "under", "across", "per", "behalf", "alongside",
  "and", "or", "but", "so", "yet", "then",
  "here", "now", "today", "tonight", "again", "also", "too", "still", "just", "currently",
  "live", "remotely", "briefly", "finally", "actually", "obviously",
  "i", "we", "you", "my", "our", "this", "that",
]);

/**
 * Does `tail` END the clause rather than continue it? The `speaking` / `here` idiom discriminator.
 *
 * ISS-098's lesson stated once instead of twice: a following NOUN is the thing the word would be
 * modifying, so it is a participle or a deictic; punctuation, end of clause, a conjunction, an
 * adverb, any preposition or another naming cue all mean the self-identification idiom.
 */
function endsTheClause(tail: string): boolean {
  const nextWord = /^\s*([\p{L}']+)/u.exec(tail);
  if (!nextWord) return true;
  const word = nextWord[1]!.toLowerCase();
  return FUNCTION_FOLLOWERS.has(word) || NAMING_CUES_AFTER.includes(word);
}

/**
 * Does this turn use `name` as a PLACE or an ORGANISATION rather than as a person?
 *
 * D-052 ruling 2 (Approved-by: Umesh) chose a contextual signal and rejected a place-name lookup
 * list, because a list wrongly refuses real people named India or Paris and never finishes. So this
 * function knows no place names. It knows that a locative preposition cannot govern a person:
 * "students in Mumbai" is a place reading of that string and "Mumbai said" is not — the ruling's own
 * "I'm in Mumbai" vs "Mumbai said" distinction, made syntactically and candidate-independently.
 *
 * Two bounds keep the recall cost small and visible. Multi-token candidates are exempt, because
 * "Mumbai Sharma" is a person whatever the turn says about Mumbai. And a possessive occurrence is
 * not a place ("at Priya's desk" is a person's desk), so it is skipped.
 */
function readsAsAPlaceOrOrg(text: string, name: string): boolean {
  if (name.trim().split(/\s+/).filter(Boolean).length > 1) return false;
  const governed = new RegExp(`(?:^|\\s)(?:${LOCATIVE_GOVERNORS.join("|")})$`, "iu");
  return nameOccurrences(text, name).some((at) => {
    if (/^['’]s\b/u.test(text.slice(at + name.length))) return false;
    return governed.test(text.slice(Math.max(0, at - 24), at).trimEnd());
  });
}

function hasNamingCue(text: string, name: string, at: number, place: boolean): boolean {
  const rawBefore = text.slice(Math.max(0, at - 40), at);
  const before = rawBefore.toLowerCase().replace(/[\s,:;."'\u2019()\u2014-]+$/u, "");
  // ISS-255: a handover marker in the before-context means the CURRENT speaker is introducing
  // someone else ("I invite our next speaker, Ruby"). Only an explicit self-naming cue may then
  // bind the name to this label; every other branch would credit the moderator with the
  // introduced person's name. The marker is checked against the wider before-context because
  // the cue phrase sits immediately before the name while the marker can sit a clause earlier.
  const handover = HANDOVER_MARKERS.some((m) => before.includes(m) || rawBefore.toLowerCase().includes(m));
  if (handover && !SELF_NAMING_CUES.some((cue) => before.endsWith(cue))) return false;
  if (NAMING_CUES_BEFORE.some((cue) => before.endsWith(cue))) return true;
  const multiToken = name.trim().split(/\s+/).filter(Boolean).length > 1;
  if (multiToken && DEMONSTRATIVE_CUES.some((cue) => before.endsWith(cue))) return true;

  const rawAfter = text.slice(at + name.length, at + name.length + 28);
  const after = rawAfter.toLowerCase().replace(/^[\s,:;."'\u2019()\u2014-]+/u, "");
  // The after-cues are the WEAK half of the evidence: `here` / `from` / `speaking` / `with us` are
  // the affiliation idiom, and that is exactly the shape a place or an organisation mimics
  // ("Mumbai from the west zone."). So a turn that reads its own candidate locatively loses all of
  // them (D-052 ruling 2) and keeps only the explicit-naming and direct-address branches above and
  // below \u2014 "my name is Paris" and "Paris, what do you think?" still resolve a real Paris.
  if (!place) {
    if (NAMING_CUES_AFTER.some((cue) => cue !== "speaking" && cue !== "here" && after.startsWith(cue))) return true;
    // `X here` is the self-identification idiom only when nothing follows it -- "Ruby here." /
    // "Ruby here, from admissions." A finite verb after it makes the turn a THIRD-PARTY deictic:
    // "Ruby here has an announcement." is the moderator pointing AT Ruby, so binding that name to
    // this turn's own label is the ISS-255 inversion whoever the name belongs to. That, not any
    // place knowledge, is what closed ISS-104's "Google here has an announcement."
    const HERE_AT = /^[\s,:;.'"()\u2019-]*here\b/iu;
    if (HERE_AT.test(rawAfter) && endsTheClause(rawAfter.replace(HERE_AT, ""))) return true;
    // `speaking` is the self-identification idiom -- Ruby speaking. -- but it is also a plain
    // participial modifier: English speaking students may apply would otherwise ship
    // person:english (ISS-097). The distinction is syntactic and candidate-independent:
    // Prasanti speaking students may apply is not a naming construction either.
    //
    // ISS-098: the first attempt inverted the rule. It ALLOWLISTED nine prepositions and refused
    // everything else, dropping ten recorded self-introductions -- speaking here, speaking and I
    // lead admissions, speaking again, speaking as the panel chair, speaking over Zoom -- and it
    // did so with an unconditional early return that vetoed every LATER cue branch too.
    //
    // Both were wrong. The discriminator is a following NOUN (the thing speaking would modify);
    // end of clause, punctuation, a conjunction, an adverb or ANY preposition all mean the idiom.
    // And a non-match must fall through, never veto the predicate.
    const SPEAKING_AT = /^[\s,:;.'"()\u2019-]*speaking\b/iu;
    // A bare noun after either word means participle or deictic, not a cue. Fall through rather than
    // returning false: an unconditional veto here was ISS-098's second defect.
    if (SPEAKING_AT.test(rawAfter) && endsTheClause(rawAfter.replace(SPEAKING_AT, ""))) return true;
  }

  // Direct address takes a comma the greeting-of-an-object form does not: "Good morning Prasanti,"
  // is an address; "Welcome Diwali celebrations" is not. The comma is doing real work here.
  const addressed = /^\s*,/u.test(rawAfter);
  if (addressed) {
    if (ADDRESS_GREETINGS.some((cue) => before.endsWith(cue))) return true;
    const afterComma = rawAfter.replace(/^\s*,\s*/u, "").toLowerCase();
    if (ADDRESS_FOLLOWERS.some((cue) => afterComma.startsWith(cue))) return true;
  }
  return false;
}

/** Every whole-name occurrence of `name` in `text`, as start offsets. */
function nameOccurrences(text: string, name: string): number[] {
  const isNameChar = (ch: string | undefined): boolean =>
    ch !== undefined && (/[\p{L}\p{N}]/u.test(ch) || NAME_JOINERS.has(ch));
  const out: number[] = [];
  for (let from = 0; ; ) {
    const at = text.indexOf(name, from);
    if (at === -1) return out;
    if (!isNameChar(text[at - 1]) && !isNameChar(text[at + name.length])) out.push(at);
    from = at + 1;
  }
}

/** Whole-name containment AND positive evidence that the turn is naming someone. */
export function citesNameAsAnIntroduction(text: string, name: string): boolean {
  const place = readsAsAPlaceOrOrg(text, name);
  return nameOccurrences(text, name).some((at) => hasNamingCue(text, name, at, place));
}
