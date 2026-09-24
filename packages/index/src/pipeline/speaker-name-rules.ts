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
 * History: containment alone shipped "Juben Thakur"; shape alone shipped 20/20 fabricated people;
 * the discourse denylist and person-directed cues followed. Each was necessary, none sufficient.
 */

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
 * A bare `includes()` let "Ruby" match "Rubykumar Shah"; a letters-and-digits boundary let it match
 * "Ruby-Anne Smith". `NAME_JOINERS` is shared with `looksLikeAName`: a character that can sit inside
 * a name never marks its edge. "." is NOT a joiner -- that would refuse "My name is Ruby."
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
 * Discourse words that are never a person, as a WHOLE candidate.
 *
 * ISS-093: the cue rule alone let 20 of 20 fabricated people through -- "Welcome Everyone" gave
 * `person:everyone`, "Hi Guys" gave `person:guys`, "Welcome To the conference" gave `person:to`.
 * The checker's diagnosis was exact: a cue evidences that the TURN names someone, never that the
 * CANDIDATE is a name. The two guards constrain different things and both are needed.
 *
 * I resisted a denylist in cycle 1 on the grounds that "everything that is not a name" is
 * unbounded. That objection was wrong-headed: this list is not that. It is the CLOSED class of
 * English function words, discourse markers and calendar terms -- pronouns, determiners,
 * prepositions, conjunctions, greetings, quantifiers, collective address nouns, days and months.
 * Closed classes are enumerable; "not a name" is not. Real names that happen to be ordinary nouns
 * ("Grace", "Hope", "Summer") are deliberately absent, because they are not function words.
 */
const NEVER_A_PERSON = new Set([
  // pronouns and quantifiers
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "everyone",
  "everybody", "somebody", "someone", "anyone", "nobody", "all", "both", "each", "every", "any",
  "many", "most", "some", "none", "several", "few",
  // collective address
  "guys", "folks", "team", "everyone", "people", "friends", "members", "gentlemen", "ladies",
  "audience", "participants", "attendees", "colleagues",
  // greetings, discourse markers, fillers
  "hi", "hello", "hey", "welcome", "thanks", "thank", "please", "sorry", "okay", "ok", "right",
  "yeah", "yes", "no", "well", "now", "so", "just", "actually", "basically", "great", "good",
  // negation and intensifier particles -- ISS-095. ISS-093's fix_direction named the target set as
  // "prepositions/particles to/so/back/not"; to/so/back went in and `not` did not, so
  // "I am Not sure about that." still shipped person:not through the `i am` cue.
  "not", "nor", "never", "very", "really", "quite", "too", "also", "still", "even",
  "morning", "afternoon", "evening", "night", "back", "again", "here", "there", "today",
  "tomorrow", "yesterday", "next", "last", "first", "second",
  // determiners, prepositions, conjunctions
  "the", "a", "an", "and", "but", "or", "if", "then", "than", "that", "this", "these", "those",
  "to", "from", "with", "without", "for", "of", "in", "on", "at", "by", "as", "about", "into",
  "over", "under", "up", "down", "out", "off", "our", "your", "my", "his", "their", "its",
  // calendar
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august", "september",
  "october", "november", "december",
]);

/** Is every token of this candidate a discourse word? Then it is not a person, whatever the cue. */
export function isDiscourseOnly(name: string): boolean {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => NEVER_A_PERSON.has(t.toLowerCase().replace(/[.,!?;:]+$/u, "")));
}

/**
 * Cue phrases that mark a PERSON-DIRECTED act of naming. ISS-091: shape tests capitalisation, not
 * nameness ("Welcome", "Thanks", "I" all shipped), so a name with no adjacent cue is refused.
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
  "next presenter", "next up", "hand over", "handing over", "over to",
  "take us forward", "to take us through", "to take us into", "pass the mic",
];
/** Cues whose subject is the SPEAKER THEMSELF — the only ones that survive a handover context. */
const SELF_NAMING_CUES = ["my name is", "my name's", "i am", "i'm", "call me"];
/**
 * Demonstratives point at anything -- "This is India calling.", "This is Wednesday.", "This is
 * Great news." A bare demonstrative plus ONE capitalised token is not evidence of a person, so it
 * counts only for a multi-token name ("This is Makrand Rajadhyaksha"). Single-token candidates
 * need a cue that is specifically about a person: an explicit self-naming, a handover, or a direct
 * address. This is the last of the ISS-093 attacks and the only one a closed-class list cannot
 * reach, since telling a country from a person is a gazetteer problem, not a pattern problem.
 */
const DEMONSTRATIVE_CUES = ["this is", "that is", "that's"];
/** Address greetings: only a cue when the name is followed by address punctuation (see below). */
const ADDRESS_GREETINGS = ["good morning", "good afternoon", "good evening", "welcome", "hi", "hello", "hey", "thank you", "thanks"];
const NAMING_CUES_AFTER = ["here", "speaking", "from", "with us", "joining us"];
/** Interrogatives that follow a direct address: "Prasanti, what do you think?" */
const ADDRESS_FOLLOWERS = ["what", "how", "would", "could", "do you", "can you", "any", "your", "please", "over to you"];

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

function hasNamingCue(text: string, name: string, at: number): boolean {
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
  if (NAMING_CUES_AFTER.some((cue) => cue !== "speaking" && after.startsWith(cue))) return true;
  // `speaking` is the self-identification idiom (Ruby speaking.) but also a participle: "English
  // speaking students" shipped person:english (ISS-097); allowlisting what may follow dropped ten
  // real introductions (ISS-098). The discriminator is a following NOUN; end of clause,
  // punctuation, a conjunction, an adverb or ANY preposition mean the idiom. A non-match falls through.
  const SPEAKING_AT = /^[\s,:;.'"()\u2019-]*speaking\b/iu;
  if (SPEAKING_AT.test(rawAfter)) {
    const tail = rawAfter.replace(SPEAKING_AT, "");
    const nextWord = /^\s*([\p{L}']+)/u.exec(tail);
    if (!nextWord || FUNCTION_FOLLOWERS.has(nextWord[1]!.toLowerCase())) return true;
    // A bare noun follows: participle, not a cue. Fall through; a later branch may supply one.
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
  return nameOccurrences(text, name).some((at) => hasNamingCue(text, name, at));
}

/**
 * ISS-282 (phase-3 re-gate, 0/8 correct): the cue rule says a turn NAMES someone, never WHO. Every
 * wrong identity was a third party ("Thank you, Sonal", "Let me first introduce Shithij") credited
 * to the speaking label. These split it by DIRECTION; `speakers-llm.ts` pairs each with a relation.
 */
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
export function citesNameAsSelfIdentification(text: string, name: string): boolean {
  return nameOccurrences(text, name).some((at) => {
    const [before, after] = [tidyBefore(text, at), tidyAfter(text, name, at)];
    const speaking = /^speaking\b\s*([\p{L}']+)?/u.exec(after);
    const afterCue = after.startsWith("here") || after.startsWith("this side") || (!!speaking && (!speaking[1] || FUNCTION_FOLLOWERS.has(speaking[1])));
    return hasNamingCue(text, name, at) && ([...SELF_NAMING_CUES, "this side"].some((c) => before.endsWith(c)) ||
      (afterCue && opensClause(text, at)) || (name.trim().split(/\s+/).length > 1 && before.endsWith("this is")));
  });
}

/**
 * Forward address: the named person speaks NEXT. A handover ("over to X", "I invite ... X",
 * "X, please go ahead"), or -- only in the turn's closing stretch, where the floor is handed on --
 * a greeting ("Hi, Nikhil.") or a question calling on them ("Rashi, I'll pass it on back to you").
 * Mid-turn the same shapes are quoted or rhetorical: everybody ask me, "Jubin, what is a good
 * portfolio?" / "Shweta, any more takers" (exhaustive 240-block check, fix cycle 1b).
 */
const CLOSING = 200;
const GREETING_BEFORE = /(^|\W)(hi|hello|hey|welcome|good (morning|afternoon|evening))$/u;
const CALLED_ON = ["what", "how", "would", "could", "can you", "do you", "did you", "any ", "your", "please", "i'll pass", "i will pass"];
export function citesNameAsHandover(text: string, name: string): boolean {
  return nameOccurrences(text, name).some((at) => {
    const [before, after, rest] = [tidyBefore(text, at), tidyAfter(text, name, at), text.slice(at + name.length)];
    return HANDOVER_CUES_BEFORE.some((c) => before.endsWith(c)) ||
      HANDOVER_MARKERS.some((m) => text.slice(Math.max(0, at - 40), at).toLowerCase().includes(m)) ||
      (text.length - at <= CLOSING && GREETING_BEFORE.test(before) && /^\s*[,.!]/u.test(rest)) ||
      (text.length - at <= CLOSING && /^\s*,/u.test(rest) && [...HANDOVER_FOLLOWERS, ...CALLED_ON].some((c) => after.startsWith(c)));
  });
}

/**
 * Backward address: "Thank you, X" / "Thanks so much X, for ..." OPENING a turn thanks the person
 * who JUST spoke. A turn thanking two people ("Thank you, Kshitij. Thanks, Anisha", "thank you
 * Bhakti, thank you TOC team") does not say which of them spoke last, so it binds neither.
 */
const THANKED = /\b[Tt]hank(?:s| you)(?: (?:so|very) much| a lot)?[\s,]+(\p{Lu}[\p{L}'’-]*)/gu;
export function citesNameAsThanks(text: string, name: string): boolean {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if ([...text.matchAll(THANKED)].some((m) => m[1] !== first && !isDiscourseOnly(m[1] ?? ""))) return false;
  return nameOccurrences(text, name).some((at) => at <= 120 &&
    /(thank you|thanks)( (so|very) much| a lot)?$/u.test(tidyBefore(text, at)) && /^(\s*[,.!?]|\s*$|\s+for\b)/u.test(text.slice(at + name.length)));
}
