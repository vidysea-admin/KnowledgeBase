/**
 * packages/index/src/pipeline/speaker-rules/speaker-following-rules.ts -- the two syntactic tests the `speaking` / `here`
 * after-cue needs, split out of speaker-name-rules.ts (300-line budget). Both are candidate-independent: they look at the
 * words AROUND a name, never at the name, so they carry no place or organisation knowledge (D-052 ruling 2).
 *
 *   followedByNoun   ISS-097 / ISS-098 / ISS-110: does a NOUN follow, which the word would then be modifying?
 *   opensAClause     ISS-104:                      does the name open its clause, so that "X speaking" is a self-introduction?
 */

/**
 * Words that may follow `speaking` / `here` in the self-identification idiom: prepositions, conjunctions, pronouns and a
 * few adverbs. This set is NOT the noun test (see `followedByNoun`); it only short-circuits the common cases.
 */
export const FUNCTION_FOLLOWERS = new Set([
  "from", "on", "at", "for", "with", "to", "in", "of", "about", "as", "over", "after", "before",
  "during", "via", "by", "into", "through", "under", "across", "per", "behalf", "alongside",
  "and", "or", "but", "so", "yet", "then",
  "here", "now", "today", "tonight", "again", "also", "too", "still", "just", "currently",
  "live", "remotely", "briefly", "finally", "actually", "obviously",
  "i", "we", "you", "my", "our", "this", "that",
]);

/**
 * Closed adverb classes that MODIFY something else, so they are looked through rather than read as the noun: degree
 * ("speaking very briefly") and sequencing ("speaking first, then Nilesh"). ISS-110. A word from here is skipped and
 * the word after it is judged, so "speaking first graders" still reads `first` as an adjective on a noun.
 */
const SKIPPABLE_ADVERBS = new Set([
  "very", "quite", "rather", "really", "pretty", "extremely", "truly", "so", "too", "just", "only", "even",
  "first", "second", "third", "next", "last", "later", "earlier", "soon", "already",
]);

const NEXT_WORD = /^\s*([\p{L}']+)/u;

/**
 * Does a NOUN follow `tail`'s start? Then the word before it is a participle or a deictic, not a cue.
 *
 * It is a noun test in the one direction that is safe: a following word is read as the noun unless it is positively
 * something else -- end of clause or punctuation (no word follows), a preposition / conjunction / pronoun
 * (FUNCTION_FOLLOWERS), another naming cue (`extraCues`), an -ly adverb, or a degree / sequencing adverb that is itself
 * not followed by a noun. An unknown word is therefore a noun and refuses: a fabricated person is the worse error
 * (C12), and widening the sets by guessing words is how this rule failed twice. Pin any widening to a recorded case.
 */
export function followedByNoun(tail: string, extraCues: readonly string[] = []): boolean {
  const next = NEXT_WORD.exec(tail);
  if (!next) return false;
  const word = next[1]!.toLowerCase();
  if (FUNCTION_FOLLOWERS.has(word) || extraCues.includes(word)) return false;
  if (SKIPPABLE_ADVERBS.has(word)) return followedByNoun(tail.slice(next[0].length), extraCues);
  return !(word.length > 3 && word.endsWith("ly"));
}

const OPENER_PREFIX = /^(?:(?:hi|hello|hey|namaste|good (?:morning|afternoon|evening|day)|okay|ok|so|well|alright|now|thanks|thank you|welcome|everyone|all|folks|friends|and|again|there)\b[\s,]*)*$/iu;

/**
 * Does the name at `at` OPEN its clause: start of the turn or of a sentence, after only greeting words?
 *
 * "Ruby speaking." names the speaker; "This is India speaking on the panel." does not bind India to anything the
 * sentence can verify, and it is byte-identical in shape to "This is Rahul speaking on the panel." -- so the weak cue is
 * withheld whenever the name sits inside a larger construction. Same discriminator the production self-identification
 * allow-list already uses (ISS-282 c1b): the multi-token "This is <Full Name>" form is a separate, stronger cue.
 */
export function opensAClause(text: string, at: number): boolean {
  const sentencePrefix = text.slice(0, at).split(/[.!?;:"(—\n]|--/u).pop() ?? "";
  return OPENER_PREFIX.test(sentencePrefix.trim());
}
