/**
 * packages/index/src/pipeline/quote-verify-boundary.test.ts — fix cycle 2 of T-040 (ISS-T040QUOTE-002/-003):
 * the allow-list boundary rule. The ledger's own recorded reproductions are re-run verbatim (D-015),
 * every hard case has a named decision, and the Cf category is covered as a property, not a list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyQuote, normaliseForQuote, type QuoteSourceTurn, type QuoteVerdict } from "./quote-verify.js";
import { isWhitespace, quoteMayEnd, quoteMayStart } from "./quote-token-rule.js";

const one = (text: string): QuoteSourceTurn[] => [{ id: "t", text }];
const reason = (v: QuoteVerdict) => (v.ok ? "ok" : v.reason);
const ledger = readFileSync(new URL("../../../../../qa/issues.t040quote.jsonl", import.meta.url), "utf8").split("\n")
  .filter(Boolean).map((l) => JSON.parse(l) as { id: string; evidence: string });
const row = (id: string) => ledger.find((r) => r.id === id)!;

/** Every recorded call of a row: the verbatim `verifyQuote([...], '...')` forms plus the prose `'quote' of 'fragment'` forms. */
function recorded(id: string): Array<[string, string]> {
  const ev = row(id).evidence;
  const calls = [...ev.matchAll(/verifyQuote\(\[\{id:'t',text:'([^']*)'\}\],\s*'([^']*)'\)/g)].map((m) => [m[1]!, m[2]!] as [string, string]);
  const prose = [...ev.matchAll(/'([^']+)' of '([^']+)'/g)].map((m) => {
    const [q, frag] = [m[1]!, m[2]!];
    let k = Math.min(q.length, frag.length);
    while (k > 0 && !q.endsWith(frag.slice(0, k))) k--;
    return [q + frag.slice(k), q] as [string, string]; // the source is the quote continued by the recorded fragment
  });
  return [...calls, ...prose];
}

test("ISS-T040QUOTE-002: every recorded reproduction is refused (n/n by id)", () => {
  const cases = recorded("ISS-T040QUOTE-002");
  assert.equal(cases.length, 7, "one verbatim call + six 'quote of fragment' pairs");
  let refused = 0;
  for (const [src, q] of cases) { assert.equal(reason(verifyQuote(one(src), q)), "partial-word", `${q} | ${src}`); refused++; }
  console.log(`ISS-T040QUOTE-002: ${refused}/${cases.length} refused (recorded verbatim)`);
  assert.equal(refused, cases.length);
});

test("ISS-T040QUOTE-002: the symbol scan the row mentions, as START cuts and END cuts, is refused", () => {
  for (const sym of [..."&*=~^|<>×÷±°+·∗′″©®™"]) {
    assert.equal(reason(verifyQuote(one(`we use the fast${sym}slow tool today`), "we use the fast")), "partial-word", `end ${sym}`);
    assert.equal(reason(verifyQuote(one(`we use the fast${sym}slow tool today`), "slow tool today")), "partial-word", `start ${sym}`);
    assert.equal(reason(verifyQuote(one(`it was ${sym}fast and good today`), "fast and good today")), "partial-word", `start-prefix ${sym}`);
  }
});

test("ISS-T040QUOTE-003: the recorded U+FEFF reproduction is refused (n/n by id), and U+FEFF is not whitespace", () => {
  const cases = recorded("ISS-T040QUOTE-003");
  assert.equal(cases.length, 1);
  let refused = 0;
  for (const [src, q] of cases) { assert.ok(src.includes("﻿")); assert.equal(reason(verifyQuote(one(src), q)), "partial-word"); refused++; }
  console.log(`ISS-T040QUOTE-003: ${refused}/${cases.length} refused (recorded verbatim)`);
  assert.equal(isWhitespace("﻿"), false);
  // the row's "reverse" remark: a quote containing U+FEFF no longer equals a source with a real space
  assert.equal(reason(verifyQuote(one("the fee is paid now ok"), "the fee is﻿paid now")), "not-found");
  assert.equal(reason(verifyQuote(one("the fee is﻿paid now ok"), "the fee is paid now")), "not-found");
  assert.notEqual(normaliseForQuote("a﻿b"), normaliseForQuote("a b"));
});

test("ISS-T040QUOTE-001 reproductions still refused under the new rule", () => {
  const cases = recorded("ISS-T040QUOTE-001");
  assert.equal(cases.length, 3);
  for (const [src, q] of cases) assert.equal(reason(verifyQuote(one(src), q)), "partial-word", q);
  assert.equal(reason(verifyQuote(one("the fee is 1,000 rupees today"), "the fee is 1")), "partial-word");
  console.log(`ISS-T040QUOTE-001: ${cases.length}/${cases.length} refused (recorded verbatim)`);
});

type Expect = "ok" | "cut";
const HARD: Array<[string, string, string, Expect]> = [
  ["3. at end of turn", "so the price is 3.", "the price is 3", "ok"],
  ["3. then sentence", "the price is 3. Next one", "the price is 3", "ok"],
  ["3.5 decimal", "the price is 3.5 dollars", "the price is 3", "cut"],
  ["3 of 3.5. sentence end", "the price is 3.5. Next", "the price is 3", "cut"],
  ["U.S. quoting U.S", "we said the U.S. policy is clear", "we said the U.S", "ok"],
  ["U.S. quoting U", "we said the U.S. policy is clear", "we said the U", "cut"],
  ["e.g.", "we use tools e.g. hammers and saws", "we use tools e.g", "ok"],
  ["e.g. quoting e", "we use tools e.g. hammers and saws", "we use tools e", "cut"],
  ["Dr. Rao quoting Dr (abbreviation period = sentence period; accepted)", "please ask Dr. Rao about it today", "please ask Dr", "ok"],
  ["wait...", "we should wait... then decide", "we should wait", "ok"],
  ["(as I said) quoting the inside", "(as I said before) we wait", "as I said before", "ok"],
  ["(as I said) quoting without the closer", "so (as I said before) we wait", "so (as I said before", "ok"],
  ["50% quoting 50", "growth was 50% last year", "growth was 50", "cut"],
  ["$5 quoting 5", "it costs $5 per month today", "5 per month today", "cut"],
  ["$5 whole token", "it costs $5 per month today", "it costs $5 per month", "ok"],
  ["don't quoting don", "i think we don't know", "i think we don", "cut"],
  ["Rashi's quoting Rashi (FALSE REFUSAL, documented)", "that is Rashi's decision now", "that is Rashi", "cut"],
  ["re-sign quoting re", "kindly please re-sign the form today", "kindly please re", "cut"],
  ["em dash without spaces becomes a hyphen: interior", "this is a clear word—another word here", "this is a clear word", "cut"],
  ["interrupted speech dash (FALSE REFUSAL, documented)", "so I think no I— I mean it really", "so I think no I", "cut"],
  ["leading ellipsis in source (FALSE REFUSAL, documented)", "...so we agreed on this", "so we agreed on this", "cut"],
  ["5' (feet) quoting 5", "yes he is about 5' tall and strong", "yes he is about 5", "cut"],
  ["astral digit then unit mark", "yes he is about \u{1D7D3}' tall and strong", "yes he is about \u{1D7D3}", "cut"],
  ["5\" (inches) quoting 5", 'yes it is about 5" long and wide', "yes it is about 5", "cut"],
  ["curly-quoted phrase, inside", "he said “we agree on this” today", "we agree on this", "ok"],
  ["signed number whole", "a -5 drop overall now", "-5 drop overall now", "ok"],
  ["signed number sign dropped", "a -5 drop overall now", "5 drop overall now", "cut"],
  ["10+ with the plus included", "who has 10+ years of experience", "has 10+ years of", "ok"],
  ["C++ whole", "our language is C++ for the backend", "our language is C++", "ok"],
  ["NBSP is whitespace", "the fee is paid now ok", "fee is paid now", "ok"],
  ["ideographic space is whitespace", "the fee　is paid now ok", "fee is paid now", "ok"],
  ["tab and newline are whitespace", "the\tfee\nis paid now ok", "fee is paid now", "ok"],
  ["Cf character after the quote", "the fee is paid​ now ok", "the fee is paid", "cut"],
  ["Cf character before the quote", "the fee is ​paid now ok then", "paid now ok then", "cut"],
  ["Thai, no spaces: interior cut refused (scripts without spaces fail closed)", "สวัสดี ครับวันนี้เราจะคุยกัน", "สวัสดี ครับวันนี้", "cut"],
  ["Thai, space-delimited whole turn verifies", "สวัสดี ครับวันนี้เราจะคุยกัน", "สวัสดี ครับวันนี้เราจะคุยกัน", "ok"],
  ["Han, no spaces: interior cut refused", "我们今天讨论入学流程安排 然后继续讨论", "入学流程安排 然后继续讨论", "cut"],
  ["Devanagari danda is closing punctuation", "आज हम प्रवेश प्रक्रिया पर बात करेंगे। फिर शुल्क", "आज हम प्रवेश प्रक्रिया पर बात करेंगे", "ok"],
];
for (const [name, src, q, want] of HARD) {
  test(`hard case: ${name} -> ${want}`, () => {
    assert.equal(reason(verifyQuote(one(src), q)), want === "ok" ? "ok" : "partial-word", `${q} | ${src}`);
  });
}

test("wrappers: a curly-open/straight-close pair is the same mark (documented); a kind mismatch is not", () => {
  const src = one("he said we agree on this today, fee is paid now.");
  assert.equal(reason(verifyQuote(src, "“fee is paid now\"")), "ok");
  assert.equal(reason(verifyQuote(src, "“fee is paid now’")), "not-found");
});

test("wrappers: a wrapped quote by the wrong speaker reports wrong-speaker, not not-found", () => {
  const turns: QuoteSourceTurn[] = [{ id: "a", speakerRef: "A", text: "the fee is paid now" }, { id: "b", speakerRef: "B", text: "ok then" }];
  assert.equal(reason(verifyQuote(turns, { text: '"the fee is paid now"', speakerRef: "B" })), "wrong-speaker");
  assert.equal(reason(verifyQuote(turns, { text: "the fee is paid now", speakerRef: "B" })), "wrong-speaker");
  assert.equal(reason(verifyQuote(turns, { text: '"the fee is paid now"', speakerRef: "A" })), "ok");
});

test("rule predicates: a long run of closing or opening characters is refused (bounded scan)", () => {
  const s = `x ${"(".repeat(20)}word ok`;
  assert.equal(quoteMayStart(s, s.indexOf("word")), false);
  assert.equal(quoteMayStart(`x ${"(".repeat(8)}word ok`, 10), true);
  assert.equal(quoteMayEnd(`word${".".repeat(20)} ok`, 4), false);
  assert.equal(quoteMayEnd(`word${".".repeat(8)} ok`, 4), true);
  // astral neighbours: an emoji directly after the cut is not whitespace/closing
  assert.equal(quoteMayEnd("word\u{1F600} ok", 4), false);
  assert.equal(quoteMayStart("\u{1F600}word ok", 2), false);
});

test("property over the WHOLE Cf category (not a list): no cut adjacent to a format character verifies", () => {
  const cf: number[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) if (cp < 0xd800 || cp > 0xdfff) if (/^\p{Cf}$/u.test(String.fromCodePoint(cp))) cf.push(cp);
  assert.ok(cf.length > 100 && cf.includes(0xfeff) && cf.includes(0x200b) && cf.includes(0xe0001), `Cf count ${cf.length}`);
  let refused = 0;
  for (const cp of cf) {
    const c = String.fromCodePoint(cp);
    const src = one(`the fee is paid${c}now and later`);
    for (const q of ["the fee is paid", "now and later"]) { assert.equal(reason(verifyQuote(src, q)), "partial-word", `U+${cp.toString(16)} ${q}`); refused++; }
    const mid = one(`the fee is pa${c}id now and later`);
    for (const q of ["the fee is pa", "id now and later"]) { assert.equal(reason(verifyQuote(mid, q)), "partial-word", `U+${cp.toString(16)} mid ${q}`); refused++; }
  }
  console.log(`Cf property: ${cf.length} format characters, ${refused} adjacent cuts refused`);
});
