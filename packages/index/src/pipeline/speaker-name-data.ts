/**
 * packages/index/src/pipeline/speaker-name-data.ts — the DATA half of speaker-name-rules.ts.
 *
 * Split out under D-050 ruling 1 (Approved-by: Umesh, docs/DECISIONS.md): speaker-name-rules.ts
 * sat at exactly 300 non-blank lines — the loc.max ceiling, zero headroom — so the next ISS-104
 * (open, critical) denylist word did not fit. This module holds only the two constants that are
 * pure enumerated data: `NEVER_A_PERSON` (409 audited closed-class/role words) and
 * `DEMONSTRATIVE_CUES`. The LOGIC that reads them (`isDiscourseOnly`, `hasNamingCue`) stays in
 * speaker-name-rules.ts, which imports both constants back from here. Neither constant is
 * exported anywhere else in the codebase (grep confirmed before this split), so no other caller
 * needed updating.
 *
 * This is a pure data move: no word was added, removed, reordered or re-spelled, and the
 * pre-existing duplicate `everyone` entry (collective-address + pronoun/quantifier sections)
 * stays duplicated exactly as it was — outside this unit's scope. See
 * qa/manifests/speaker-rules-data-module-extraction.md for the mechanical sorted-word-set diff
 * that proves it.
 */

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
export const NEVER_A_PERSON = new Set([
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
  // ISS-104 cycle 4 — the ENUMERATION replacing the anecdote. Every word above went in because an issue named it (`not` from ISS-095; `to`/`so`/`back` from ISS-093):
  // never wrong, only never FINISHED, and nothing in it said what was still missing. SET A is enumerated from the grammatically CLOSED classes of English — closed =
  // membership does not grow with the language, and that property, not diligence, makes it completable. SET B is the four sets C2b names by ROLE not grammar, bounded
  // by enumeration only: a later gap in SET B is a real finding, one in SET A means the enumeration was done wrong. Method, the measurement that all 277 then-missing
  // words shipped a fabricated person, and the `will`/`can`/`dare`/`need`/`day`/`true` name-collision cost knowingly accepted here (bare "Will" refused; "Will Smith"
  // untouched — isDiscourseOnly needs EVERY token): qa/manifests/iss-104-closed-class-function-words.md
  "thou", "thee", "ye", "mine", "yours", "hers", "ours", "theirs", "myself", "yourself", "himself", "herself", "itself", "oneself", "ourselves", "yourselves", "themselves",  // pron: personal/possessive/reflexive
  "everything", "something", "anything", "anybody", "nothing", "either", "neither", "another", "other", "others", "much", "enough", "such", "one", "ones",  // pron: indefinite
  "who", "whom", "whose", "what", "which", "whatever", "whichever", "whoever", "whomever", "whether",  // pron/det: interrogative + relative
  "yet", "because", "although", "though", "while", "whereas", "unless", "until", "till", "since", "once", "lest", "whereupon", "however", "therefore", "thus",  // conj + conjunctive adverbs
  "hence", "moreover", "furthermore", "nevertheless", "nonetheless", "otherwise", "meanwhile", "besides", "anyway",
  "onto", "underneath", "above", "across", "after", "against", "along", "alongside", "among", "amongst", "around", "before", "behind", "below", "beneath",  // prepositions
  "beside", "between", "beyond", "concerning", "despite", "during", "except", "inside", "like", "near", "outside", "past", "per", "regarding", "through",
  "throughout", "toward", "towards", "unto", "upon", "within", "amid", "amidst", "notwithstanding", "barring", "via",
  "am", "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "done", "have", "has", "had", "having", "will", "would", "shall", "should",  // auxiliary + modal verbs
  "can", "could", "might", "must", "ought", "need", "dare", "let", "going", "gonna",
  "away", "forward", "ahead", "aside", "apart", "together", "onward", "onwards",  // adverbial particles
  "nowhere", "nope", "nah",  // negators
  "rather", "almost", "nearly", "hardly", "barely", "scarcely", "only", "merely", "simply", "totally", "completely", "entirely", "fairly", "pretty",  // degree + focusing adverbs
  "somewhat", "more", "less", "least",
  "when", "where", "why", "how", "tonight", "noon", "midnight", "soon", "later", "already", "ever", "always", "sometimes", "often",  // deictic + temporal adverbs
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "thirty", "hundred", "thousand", "million", "billion",  // numerals + ordinals
  "twice", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "hiya", "howdy", "greetings", "namaste", "namaskar", "salaam", "bye", "goodbye", "ciao", "adios", "hola", "regards", "cheers",  // SET B: greetings + farewells
  "pardon", "excuse", "alright", "sure", "exactly", "indeed", "absolutely", "definitely", "certainly", "correct", "true", "agreed", "understood", "noted",  // SET B: acknowledgements
  "yep", "yup", "congrats", "congratulations", "bravo",
  "um", "uh", "er", "erm", "hmm", "hm", "ah", "aha", "oh", "ooh", "oops", "wow", "huh", "eh", "alas", "ouch", "hurray", "hooray", "literally",  // SET B: interjections + fillers
  "nice", "cool", "fine", "super", "lovely", "wonderful", "amazing", "awesome", "excellent", "perfect", "brilliant",  // SET B: evaluative responses
  "week", "weekend", "month", "year", "day", "hour", "minute",  // SET B: calendar terms
]);

/**
 * Demonstratives point at anything -- "This is India calling.", "This is Wednesday.", "This is
 * Great news." A bare demonstrative plus ONE capitalised token is not evidence of a person, so it
 * counts only for a multi-token name ("This is Makrand Rajadhyaksha"). Single-token candidates
 * need a cue that is specifically about a person: an explicit self-naming, a handover, or a direct
 * address. This is the last of the ISS-093 attacks and the only one a closed-class list cannot
 * reach, since telling a country from a person is a gazetteer problem, not a pattern problem.
 */
export const DEMONSTRATIVE_CUES = ["this is", "that is", "that's"];
