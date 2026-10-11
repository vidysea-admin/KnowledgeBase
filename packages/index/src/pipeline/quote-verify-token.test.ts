/**
 * packages/index/src/pipeline/quote-verify-token.test.ts — fix cycle 1 of T-040 (ISS-T040QUOTE-001):
 * token-boundary rule clause by clause, the ledger's own reproductions (D-015), speaker-before-cap,
 * wrapper policy, exact length/cap boundaries, and a seeded token-aligned/token-interior property.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyQuote, verifyQuotes, MAX_LOCATIONS, MIN_QUOTE_CODE_POINTS, type QuoteSourceTurn, type QuoteVerdict } from "./quote-verify.js";

const one = (text: string): QuoteSourceTurn[] => [{ id: "t", text }];
const reason = (v: QuoteVerdict) => (v.ok ? "ok" : v.reason);
const ok = (src: string, q: string) => { const v = verifyQuote(one(src), q); assert.equal(reason(v), "ok", `${q} | ${src}`); return v as Extract<QuoteVerdict, { ok: true }>; };
const cut = (src: string, q: string) => assert.equal(reason(verifyQuote(one(src), q)), "partial-word", `${q} | ${src}`);

test("ISS-T040QUOTE-001: the ledger's own recorded reproductions are all refused (n/n by id)", () => {
  const row = readFileSync(new URL("../../../../qa/issues.t040quote.jsonl", import.meta.url), "utf8").split("\n")
    .filter(Boolean).map((l) => JSON.parse(l) as { id: string; evidence: string }).find((r) => r.id === "ISS-T040QUOTE-001")!;
  const cases = [...row.evidence.matchAll(/verifyQuote\(\[\{id:'t',text:'([^']*)'\}\], '([^']*)'\)/g)].map((m) => [m[1]!, m[2]!] as const);
  assert.equal(cases.length, 3, "the row records three verbatim calls");
  let refused = 0;
  for (const [src, q] of cases) { cut(src, q); refused++; }
  console.log(`ISS-T040QUOTE-001: ${refused}/${cases.length} refused (recorded verbatim)`);
  cut("the fee is 1,000 rupees today", "the fee is 1"); // the row's "same for 1,000" remark
  assert.equal(refused, cases.length);
});

test("token rule C1 alnum|alnum: inside a word, ordinal or unit suffix", () => {
  cut("our total revenue is up", "our total reven");
  cut("he came in the 3rd position", "he came in the 3");
  cut("our budget is 5k per month", "our budget is 5");
  cut("our budget is 5k per month", "udget is 5k per month");
  cut("the code is 1,0000 only", "the code is 1,0");
});

test("token rule C2 joiner: a cut before . , - / : @ _ ' % that continues the token", () => {
  cut("the price is 3.5 dollars today", "the price is 3");
  cut("the fee is 1,000 rupees today", "the fee is 1");
  cut("our margin is 5-10 percent", "our margin is 5");
  cut("we are open 24/7 every day", "we are open 24");
  cut("we meet at 10:30 sharp today", "we meet at 10");
  cut("e-mail me at bob@x.com now", "e-mail me at bob");
  cut("visit the site x.com/path today", "visit the site x");
  cut("visit the site x.com/path today", "visit the site x.com");
  cut("i think we don't know yet", "i think we don");
  cut("see the file a_b is gone now", "see the file a");
  cut("our margin is 5-$10 total", "our margin is 5");
});

test("token rule C2 percent: a digit cut off its percent sign", () => {
  cut("growth was 50% last year", "growth was 50");
  ok("growth was 50% last year", "growth was 50% last year");
});

test("token rule C3 joiner|alnum: a quote starting right after a joiner that is glued to a token", () => {
  cut("meet at 10:30 sharp today", "30 sharp today");
  cut("we are open 24/7 every single day", "7 every single day");
  cut("the file a_b is gone now", "b is gone now");
  cut("i think we don't know yet really", "t know yet really");
  cut("the price is 3.5 dollars today", "5 dollars today");
  cut("e-mail me at bob@x.com now please", "x.com now please");
});

test("token rule C4 prefix|alnum: currency and sign prefixes stay attached", () => {
  cut("it costs $5 per month today", "5 per month today");
  cut("so it costs $5 per month today", "so it costs $");
  cut("it costs ₹500 per month today", "500 per month today");
  cut("a drop of -5 points overall", "5 points overall");
  cut("call me on +91 98765 43210", "call me on +");
  cut("call me on +91 98765 43210", "91 98765 43210");
});

test("token rule: sentence punctuation after a token is a legal cut, a joint inside a number is not", () => {
  ok("the price is 3. Then it rose", "the price is 3");
  ok("the price is 3, and it rose", "the price is 3");
  ok("the price is 3", "the price is 3");
  ok("so the price is 3.\nNext", "the price is 3");
  ok("so the price is 3... maybe", "the price is 3");
  ok("the price is 3.5. Then it rose", "the price is 3.5");
  ok("the price is 3.5. Then it rose", "the price is 3.5.");
  cut("the price is 3.5. Then it rose", "the price is 3");
  ok("see bob@x.com. Then reply now", "see bob@x.com");
  ok("a drop of -5 points overall", "a drop of -5 points overall");
  ok("it costs $5 per month today", "it costs $5 per month");
});

test("token rule: invisible characters cannot hide a joint; fullwidth and Devanagari digits; danda and CJK unchanged", () => {
  cut("the price is 3​.5 dollars today", "the price is 3");
  cut("the price is 3.​5 dollars today", "the price is 3.");
  cut("the price is ３．５ dollars today", "the price is ３");
  cut("आज की कीमत ३.५ रुपये है", "आज की कीमत ३");
  ok("आज हम प्रवेश प्रक्रिया के बारे में बात करेंगे और शुल्क भी बताएंगे।", "और शुल्क भी बताएंगे");
  cut("我们今天讨论入学流程安排 然后继续讨论", "入学流程安排 然后继续讨论");
  assert.equal(reason(verifyQuote(one("我们今天讨论入学流程安排"), "我们今天讨论入学流程")), "too-short");
});

test("speaker filter runs BEFORE the location cap: a real hit by the claimed speaker is never hidden", () => {
  const a = Array.from({ length: 25 }, (_, i) => ({ id: `a${i}`, speakerRef: "A", text: "go home right now" }));
  const turns = [...a, { id: "b0", speakerRef: "B", text: "we said go home right now" }];
  const vb = verifyQuote(turns, { text: "go home right now", speakerRef: "B" });
  assert.equal(vb.ok, true);
  if (vb.ok) { assert.deepEqual(vb.locations.map((l) => l.turnId), ["b0"]); assert.equal(vb.truncated, false); }
  const va = verifyQuote(turns, { text: "go home right now", speakerRef: "A" });
  assert.equal(va.ok && va.locations.length, 20);
  assert.equal(va.ok && va.truncated, true);
  assert.equal(reason(verifyQuote(turns, { text: "go home right now", speakerRef: "C" })), "wrong-speaker");
  const vu = verifyQuote(turns, "go home right now");
  assert.equal(vu.ok && vu.locations.length, 20);
});

test("location cap is exactly 20: 19 and 20 are complete, 21 is truncated to 20", () => {
  assert.equal(MAX_LOCATIONS, 20);
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, speakerRef: "A", text: "go home right now" }));
  const r = (n: number) => { const v = verifyQuote(many(n), "go home right now"); assert.equal(v.ok, true); return v.ok ? [v.locations.length, v.truncated] : []; };
  assert.deepEqual(r(19), [19, false]);
  assert.deepEqual(r(20), [20, false]);
  assert.deepEqual(r(21), [20, true]);
});

test("minimum length: exactly 11 code points refused, exactly 12 verifies (astral code point counts once)", () => {
  assert.equal(MIN_QUOTE_CODE_POINTS, 12);
  const src = one("say fee is paid now and fees are due now");
  assert.equal(reason(verifyQuote(src, "fee is paid")), "too-short");
  assert.equal(reason(verifyQuote(src, "fees are due")), "ok");
  const emoji = one("say ab cd 😀 efgh now and ab cd 😀 efg now");
  assert.equal(reason(verifyQuote(emoji, "ab cd 😀 efg")), "too-short"); // 11 code points, 12 UTF-16 units
  assert.equal(reason(verifyQuote(emoji, "ab cd 😀 efgh")), "ok"); // 12 code points
});

const SRC = 'he said "we agree" and "we wait" today, fee is paid now. The fees are due; the deadline for the scholarship form is 15 March,';
test("wrappers: ONE matching pair of quote marks is stripped and reported; the inside must verify", () => {
  const v = ok(SRC, '"fee is paid now"');
  assert.equal(v.unwrapped, true);
  assert.equal(SRC.slice(v.locations[0]!.start, v.locations[0]!.end), "fee is paid now");
  assert.equal(ok(SRC, "“fee is paid now”").unwrapped, true);
  assert.equal(ok(SRC, "'fee is paid now'").unwrapped, true);
  assert.equal(ok(SRC, '"we agree" and "we wait"').unwrapped, false); // verbatim with its marks: not stripped
  assert.equal(ok(SRC, "fee is paid now").unwrapped, false);
});

test("wrappers: stripping can never turn a non-verbatim quote into a verified one", () => {
  const bad: Array<[string, string]> = [
    ['"fee is paid later"', "not-found"], ['"fee is paid now\'', "not-found"], ['"fee is paid now', "not-found"],
    ['fee is paid now"', "not-found"], ["*fee is paid now*", "not-found"], ["(fee is paid now)", "not-found"],
    ["“fee is paid now’", "not-found"], ['"fee is paid now".', "not-found"],
    ['"The deadline for the scholarship form is 15 March."', "not-found"], // full stop is NOT dropped or swapped
    ['"fee is paid" and "fee is due"', "not-found"], // inner contains the same mark: never stripped
    ['"...fee is paid now"', "ellipsis-stitched"],
  ];
  for (const [q, why] of bad) assert.equal(reason(verifyQuote(one(SRC), q)), why, q);
  const rows = one('they wrote fee is paid" and "fee is due now');
  assert.equal(reason(verifyQuote(rows, '"fee is paid" and "fee is due"')), "not-found");
});

test("wrappers: minimum length applies AFTER stripping", () => {
  const s = one("the fee is paid now and the fees are due now");
  assert.equal(reason(verifyQuote(s, '"fee is paid"')), "too-short"); // 13 wrapped, 11 inside
  assert.equal(reason(verifyQuote(s, '"fees are due"')), "ok");
});

test("property (seeded): quotes cut strictly inside a number/e-mail/hyphenated/price token are refused; token-aligned ones verify with exact offsets", () => {
  let seed = 4242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const TOKENS = ["3.5", "1,000", "5-10", "24/7", "10:30", "50%", "5k", "3rd", "$5", "₹500", "-5", "+91", "bob@x.com", "non-compliant", "don't", "x.com/path", "@handle", "a_b", "e-mail", "12.50", "2026-10-11", "v1.2.3", "U.S.A"];
  const turns: QuoteSourceTurn[] = [];
  const specs: Array<{ i: number; tok: string; punct: string }> = [];
  for (let i = 0; i < 160; i++) {
    const tok = TOKENS[Math.floor(rnd() * TOKENS.length)]!;
    const punct = ["", ".", ",", ";"][Math.floor(rnd() * 4)]!;
    turns.push({ id: `p${i}`, text: `zqmark${i}a zqmark${i}b ${tok}${punct} zqmark${i}c zqmark${i}d` });
    specs.push({ i, tok, punct });
  }
  const inQ: Array<{ q: string; end: boolean }> = [], okQ: Array<{ q: string; i: number }> = [];
  for (const { i, tok, punct } of specs) {
    const pre = `zqmark${i}a zqmark${i}b `, post = ` zqmark${i}c zqmark${i}d`;
    for (let k = 1; k < tok.length; k++) {
      inQ.push({ q: pre + tok.slice(0, k), end: true }, { q: tok.slice(k) + punct + post, end: false });
    }
    for (const q of [pre + tok, pre + tok + punct, `zqmark${i}b ${tok}${punct}${post}`, tok + punct + post]) okQ.push({ q, i });
  }
  const inside = inQ.length;
  verifyQuotes(turns, inQ.map((x) => x.q)).forEach((v, n) => assert.equal(reason(v), "partial-word", inQ[n]!.q));
  let aligned = 0;
  verifyQuotes(turns, okQ.map((x) => x.q)).forEach((v, n) => {
    const { q, i } = okQ[n]!;
    assert.equal(v.ok, true, q);
    if (v.ok) { const l = v.locations[0]!; assert.equal(l.turnId, `p${i}`); assert.equal(turns[i]!.text.slice(l.start, l.end), q); aligned++; }
  });
  assert.ok(inside > 1000 && aligned === 640, `inside=${inside} aligned=${aligned}`);
  console.log(`property: ${inside} interior cuts refused, ${aligned} token-aligned quotes verified with exact offsets`);
});
