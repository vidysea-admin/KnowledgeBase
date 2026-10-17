/** Unicode passage slicing and query-time lexical scoring for transcript and native source hydration. */
import { lexicalQueryTokens } from "@lkb/index";

export interface Span { charStart: number; charEnd: number }
/** Unicode-safe half-open slices; no new turns or invented sub-turn timestamps. */
export function slices(text: string): Span[] {
  const result: Span[] = [];
  let start = 0, end = 0, bytes = 0;
  for (const char of text) {
    const next = Buffer.byteLength(char, "utf8");
    if (bytes + next > 1024) { result.push({ charStart: start, charEnd: end }); start = end; bytes = 0; }
    bytes += next; end += char.length;
  }
  if (end > start) result.push({ charStart: start, charEnd: end });
  return result;
}
const QUERY_FUNCTION_WORDS = new Set(("a an and are as at be before by can could did do does for from had has have how "
  + "i if in is it its of on or our that the their them these they this to was were what when where which who why "
  + "will with would you your say said describe described recommend recommended explain explained tell told").split(" "));
// Retrieval-only English inflection families; these never rewrite quoted source text.
// Explicit families avoid stripping suffixes from nouns such as business, news, or physics.
const VERB_FORMS = new Map([
  "lead leads leading led", "choose chooses choosing chose chosen", "teach teaches teaching taught",
  "buy buys buying bought", "sell sells selling sold", "send sends sending sent",
  "pay pays paying paid", "grow grows growing grew grown", "speak speaks speaking spoke spoken",
  "write writes writing wrote written", "run runs running ran", "take takes taking took taken",
  "give gives giving gave given", "make makes making made", "know knows knowing knew known",
  "think thinks thinking thought", "bring brings bringing brought", "build builds building built",
  "find finds finding found", "hold holds holding held", "meet meets meeting met",
].flatMap((family) => { const forms = family.split(" "); return forms.map((form) => [form, forms[0]!] as const); }));
const term = (word: string) => VERB_FORMS.get(word) ??
  (word.length > 4 && word.endsWith("s") && !/(ss|us|is|ics)$/.test(word) ? word.slice(0, -1) : word);
/** Only explicit, calendrical apostrophe shorthand may match a unique query year.
 * Bare quantities, percentages, quoted numbers, and ambiguous centuries stay literal.
 * A match guides retrieval; it never resolves the century or edits a source assertion. */
function passageTokenizer(query: string) {
  const years = new Map<string, string | null>();
  for (const full of lexicalQueryTokens(query).filter((word) => /^(?:19|20)\d{2}$/.test(word))) {
    const short = full.slice(-2), prior = years.get(short);
    years.set(short, prior === undefined || prior === full ? full : null);
  }
  return (text: string) => {
    const expanded = text.replace(/['’](\d{2})(?![\d'’%])(?=\s+(?:placements?|admissions?|intakes?|cohorts?|batches?|graduates?|graduation|classes?|academic\s+years?)\b)/gi,
      (literal, short: string) => years.get(short) ?? literal)
      .replace(/\b(year|class of|cohort of|batch of|intake of|spring|summer|autumn|fall|winter)\s+['’](\d{2})(?![\d'’%])\b/gi,
        (literal, prefix: string, short: string) => years.get(short) ? prefix + " " + years.get(short) : literal);
    // Same lexical token boundaries as lexicalQueryTokens, with actual frequencies retained.
    return expanded.split(/[^\p{L}\p{N}\p{M}_]+/u).filter(Boolean).map((word) => word === "LED" ? "led-device" : term(word.toLowerCase()));
  };
}
/** Query-independent document frequencies reduce boilerplate overlap; source labels remain unverified metadata. */
export function passageLexicalScorer(query: string, turns: readonly { text: string; speakerRef?: string }[]) {
  const wordsFor = passageTokenizer(query);
  const all = wordsFor(query);
  const content = all.filter((word) => !QUERY_FUNCTION_WORDS.has(word));
  const terms = [...new Set((content.length ? content : all).map(term))];
  const docs = turns.map((turn) => new Set(wordsFor(turn.text + " " + (turn.speakerRef ?? ""))));
  const weights = new Map(terms.map((word) => {
    const count = docs.filter((words) => words.has(word)).length;
    return [word, count ? Math.log(1 + (turns.length - count + 0.5) / (count + 0.5)) : 0];
  }));
  const denominator = [...weights.values()].reduce((a, b) => a + b, 0);
  const lengths = turns.flatMap((turn) => slices(turn.text).map((span) => wordsFor(turn.text.slice(span.charStart, span.charEnd)).length));
  const average = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  return (text: string, speakerRef?: string) => {
    const words = wordsFor(text), speakers = new Set(wordsFor(speakerRef ?? ""));
    const counts = new Map<string, number>();
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    let textContribution = 0, speakerContribution = 0;
    const lengthFactor = 1.2 * (0.25 + 0.75 * words.length / Math.max(1, average));
    for (const [word, weight] of weights) {
      const tf = counts.get(word) ?? 0;
      const contribution = weight * tf / (tf + lengthFactor);
      textContribution += contribution;
      if (!tf && speakers.has(word)) speakerContribution += weight / (1 + lengthFactor);
    }
    return { textContribution: textContribution / Math.max(1e-9, denominator),
      speakerContribution: speakerContribution / Math.max(1e-9, denominator) };
  };
}
