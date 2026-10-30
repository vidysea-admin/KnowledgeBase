/**
 * apps/api/src/route/bm25.ts - D-206 /route. Pure, dependency-free Okapi BM25 plus the tokenizer the
 * router and the turn ranker share. No I/O, no LLM, no vectors (the operating brain's own retrieval
 * shape: a small page index searched lexically). The only other lexical scorers in the repo are the
 * query-overlap ratio in `@lkb/index` (`lexicalSearchTurns`) and the passage scorer in `ask/passage-lexical.ts`,
 * both tied to their own callers; neither is BM25 over an arbitrary document set.
 */
const STOP = new Set(("a an and are as at be been being but by can could did do does for from get has have how i if in into is it its "
  + "me my of on or our so that the their there these they this to us was we were what when where which who why will with would you your "
  + "about tell please need want like some any also than then very just give show find").split(" "));
/** Light plural stemming only (never rewrites source text; query/doc symmetric). */
export const stem = (w: string): string => (w.length > 4 && w.endsWith("s") && !/(ss|us|is|ics)$/.test(w) ? w.slice(0, -1) : w);

/** Lowercased unicode word tokens, stopwords removed, plurals folded. Digits and 2-letter tokens such as "uk" are kept. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []) if (!STOP.has(w)) out.push(stem(w));
  return out;
}

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
export interface Bm25Index { n: number; avgLen: number; lens: number[]; postings: Map<string, [number, number][]> }

export function buildBm25(docs: readonly (readonly string[])[]): Bm25Index {
  const postings = new Map<string, [number, number][]>();
  const lens = docs.map((d) => d.length);
  docs.forEach((tokens, i) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, c] of tf) { const p = postings.get(t); if (p) p.push([i, c]); else postings.set(t, [[i, c]]); }
  });
  return { n: docs.length, avgLen: lens.reduce((a, b) => a + b, 0) / Math.max(1, docs.length), lens, postings };
}

const idf = (n: number, df: number): number => Math.log(1 + (n - df + 0.5) / (df + 0.5));

/** Dense per-document BM25 scores for the (deduplicated) query terms; 0 for a document with no query term. */
export function bm25Scores(index: Bm25Index, query: readonly string[]): number[] {
  const scores = new Array<number>(index.n).fill(0);
  for (const term of new Set(query)) {
    const p = index.postings.get(term);
    if (!p) continue;
    const w = idf(index.n, p.length);
    for (const [doc, tf] of p) {
      const norm = 1 - BM25_B + BM25_B * (index.lens[doc]! / (index.avgLen || 1));
      scores[doc]! += w * (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
    }
  }
  return scores;
}

/** Upper bound of one document's score for this query (every present term at saturation); divides a score into 0..1. */
export function bm25Ceiling(index: Bm25Index, query: readonly string[]): number {
  let sum = 0;
  for (const term of new Set(query)) { const p = index.postings.get(term); if (p) sum += idf(index.n, p.length) * (BM25_K1 + 1); }
  return sum;
}
