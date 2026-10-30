/**
 * apps/api/src/route/facets.ts - D-206 /route. Derives the country / university / topic-axis view the
 * VC asked for from node TEXT (no LLM, no schema change): a document gains facet tokens (`fc:canada`,
 * `fa:cost`, `fu:xavier-university`), and a query is expanded with the facet tokens its own words imply
 * ("Toronto" -> `fc:canada`). Facets only widen routing recall; answer text still comes from turns.
 */
import { stem, tokenize } from "./bm25.js";

/** Country slug -> trigger words (already in `tokenize` form: lowercase, plural-folded, stopwords removed). */
export const COUNTRIES: Readonly<Record<string, readonly string[]>> = {
  canada: ["canada", "canadian", "toronto", "vancouver", "ontario", "montreal", "mcgill", "ubc", "waterloo", "alberta", "pgwp"],
  uk: ["uk", "britain", "british", "england", "london", "scotland", "ucas", "oxford", "cambridge", "russell", "edinburgh"],
  usa: ["usa", "america", "american", "california", "ucla", "berkeley", "harvard", "stanford", "mit", "f1", "opt", "uc"],
  australia: ["australia", "australian", "sydney", "melbourne", "go8"],
  "new-zealand": ["zealand", "nz", "auckland", "wellington"],
  germany: ["germany", "german", "berlin", "munich", "daad", "tum", "blocked"],
  ireland: ["ireland", "irish", "dublin"],
  france: ["france", "french", "paris"],
  italy: ["italy", "italian", "rome", "milan"],
  singapore: ["singapore", "nus", "ntu"],
  india: ["india", "indian", "delhi", "mumbai"],
  uae: ["uae", "dubai", "emirates"],
};
/** Topic axes (what the question is about) -> trigger words. */
export const AXES: Readonly<Record<string, readonly string[]>> = {
  cost: ["cost", "fee", "tuition", "budget", "living", "expense", "afford", "price", "expensive", "cheap", "rent", "accommodation"],
  funding: ["scholarship", "funding", "loan", "grant", "bursary", "fellowship", "forex", "financial"],
  visa: ["visa", "permit", "immigration", "biometrics", "sevis", "residence", "stamp"],
  tests: ["ielts", "toefl", "pte", "duolingo", "gre", "gmat", "sat", "act", "score", "test"],
  admissions: ["admission", "apply", "application", "deadline", "intake", "ucas", "offer", "sop", "lor", "requirement", "eligibility"],
  careers: ["job", "placement", "career", "internship", "salary", "employment", "work"],
  ranking: ["best", "top", "ranking", "rank", "rated"],
};
const UNI = /\b(?:(?:University|Institute|College|School) of [A-Z][\w&'-]+(?: [A-Z][\w&'-]+){0,3}|[A-Z][\w&'-]+(?: [A-Z][\w&'-]+){0,2} (?:University|Institute|College))\b/g;
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Facets { countries: string[]; axes: string[]; universities: string[] }

function hits(words: ReadonlySet<string>, lexicon: Readonly<Record<string, readonly string[]>>): string[] {
  return Object.entries(lexicon).filter(([, triggers]) => triggers.some((t) => words.has(stem(t)))).map(([name]) => name);
}
/** Facets of free text (node title + summary). University names need the original casing. */
export function facetsOf(text: string): Facets {
  const words = new Set(tokenize(text));
  const universities = [...new Set((text.match(UNI) ?? []).map(slug).filter(Boolean))];
  return { countries: hits(words, COUNTRIES), axes: hits(words, AXES), universities };
}
export const facetTokens = (f: Facets): string[] => [
  ...f.countries.map((c) => `fc:${c}`), ...f.axes.map((a) => `fa:${a}`), ...f.universities.map((u) => `fu:${u}`),
];
/** Query-side expansion: country and axis tokens implied by the question's words. */
export const queryFacetTokens = (query: string): string[] => facetTokens({ ...facetsOf(query), universities: [] });
