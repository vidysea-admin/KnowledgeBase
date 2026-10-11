/**
 * packages/index/src/pipeline/quote-verify.test.ts — strict verbatim-quote verifier (T-040 slice).
 * Pure/unwired. Includes a fake-provider test showing how a summarizer's claimed quotes would be
 * checked, without touching summarize.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyQuote, verifyQuotes, normaliseForQuote, MAX_LOCATIONS, type QuoteSourceTurn, type QuoteVerdict } from "./quote-verify.js";

const T: QuoteSourceTurn[] = [
  { id: "t1", speakerRef: "spk:0", text: "Welcome everyone. The admission fee is not refundable after the first week." },
  { id: "t2", speakerRef: "spk:1", text: "The deadline for the scholarship form is 15 March, and the fee is 4500 rupees." },
  { id: "t3", speakerRef: "spk:0", text: "Hum log aaj admission process discuss karenge, phir fees ke baare mein baat hogi." },
  { id: "t4", speakerRef: "spk:1", text: "आज हम प्रवेश प्रक्रिया के बारे में बात करेंगे और शुल्क भी बताएंगे।" },
];
const ok = (v: QuoteVerdict) => { assert.equal(v.ok, true, JSON.stringify(v)); return v.ok ? v : (undefined as never); };
const refused = (v: QuoteVerdict, reason: string) => { assert.equal(v.ok, false, JSON.stringify(v)); assert.equal(v.ok ? "" : v.reason, reason); };

test("verbatim hit maps back to the right turn and exact offsets", () => {
  const q = "fee is not refundable after the first week";
  const v = ok(verifyQuote(T, q));
  assert.equal(v.locations.length, 1);
  const l = v.locations[0]!;
  assert.equal(l.turnId, "t1");
  assert.equal(T[0]!.text.slice(l.start, l.end), q);
});

test("miss: paraphrase, reordered words, changed number, dropped negation, merged passages", () => {
  refused(verifyQuote(T, "the admission fee cannot be refunded after week one"), "not-found");
  refused(verifyQuote(T, "refundable not is fee admission the"), "not-found");
  refused(verifyQuote(T, "the fee is 4600 rupees"), "not-found");
  refused(verifyQuote(T, "the admission fee is refundable after the first week"), "not-found");
  refused(verifyQuote(T, "the admission fee is not refundable and the fee is 4500 rupees"), "not-found");
  ok(verifyQuote(T, "the fee is 4500 rupees"));
});

test("a quote spanning a turn boundary is refused, and so is another speaker's turn when scoped", () => {
  refused(verifyQuote(T, "after the first week. The deadline for the scholarship"), "spans-turn-boundary");
  refused(verifyQuote(T, "the first week. The deadline"), "spans-turn-boundary");
  ok(verifyQuote(T, { text: "the fee is 4500 rupees", speakerRef: "spk:1" }));
  refused(verifyQuote(T, { text: "the fee is 4500 rupees", speakerRef: "spk:0" }), "wrong-speaker");
});

test("ellipsis stitching is refused unless the exact ellipsis is in the source", () => {
  refused(verifyQuote(T, "Welcome everyone ... not refundable after the first week"), "ellipsis-stitched");
  refused(verifyQuote(T, "Welcome everyone… not refundable after the first week"), "ellipsis-stitched");
  const src = [{ id: "e1", text: "Well... I think we should wait for results." }];
  ok(verifyQuote(src, "Well... I think we should wait"));
});

test("minimum length and token count; mid-word and mid-cluster matches are refused", () => {
  refused(verifyQuote(T, "fee"), "too-short");
  refused(verifyQuote(T, "refundable"), "too-short");
  refused(verifyQuote(T, "is not"), "too-short");
  refused(verifyQuote(T, "admissionfee"), "too-short");
  refused(verifyQuote(T, "ission fee is not ref"), "partial-word");
  refused(verifyQuote(T, "प्रवेश प्रक्रिय"), "partial-word");
  ok(verifyQuote(T, "प्रवेश प्रक्रिया के बारे"));
});

test("multiple occurrences report all locations, capped with truncated", () => {
  const src = [{ id: "a", text: "we agree on this point. we agree on this point." }, { id: "b", text: "we agree on this point" }];
  const v = ok(verifyQuote(src, "we agree on this point"));
  assert.deepEqual(v.locations.map((l) => [l.turnId, l.start]), [["a", 0], ["a", 24], ["b", 0]]);
  const many = [{ id: "m", text: "go home right now. ".repeat(MAX_LOCATIONS + 5) }];
  const mv = ok(verifyQuote(many, "go home right now"));
  assert.equal(mv.locations.length, MAX_LOCATIONS);
  assert.equal(mv.truncated, true);
});

test("Hindi, Hinglish and Devanagari verify with original-text offsets", () => {
  const dv = ok(verifyQuote(T, "हम प्रवेश प्रक्रिया के बारे में बात करेंगे"));
  assert.equal(dv.locations[0]!.turnId, "t4");
  assert.equal(T[3]!.text.slice(dv.locations[0]!.start, dv.locations[0]!.end), "हम प्रवेश प्रक्रिया के बारे में बात करेंगे");
  const hv = ok(verifyQuote(T, "admission process discuss karenge"));
  assert.equal(hv.locations[0]!.turnId, "t3");
  refused(verifyQuote(T, "आज हम प्रवेश प्रक्रिया के बारे में बात नहीं करेंगे"), "not-found");
});

const RULES: Array<[string, string, string, string, string]> = [
  // [rule, source, quote that must verify, source, quote that must NOT verify]
  ["NFC", "the café is open now", "the café is open now", "the café is open now", "the cafe is open now"],
  ["whitespace", "the  fee\n\tis   paid now", "the fee is paid now", "the fee is paid now", "thefee is paid now"],
  ["curly single", "we don’t know yet really", "we don't know yet really", "we don’t know yet really", "we dont know yet really"],
  ["curly double", "he said “we agree” today", 'he said "we agree" today', 'he said "we agree" today', "he said we agree today"],
  ["dash", "pay 5–10 lakh rupees total", "pay 5-10 lakh rupees total", "pay 5–10 lakh rupees total", "pay 5 10 lakh rupees total"],
  ["minus", "a drop of −5 points overall", "a drop of -5 points overall", "a drop of −5 points overall", "a drop of 5 points overall"],
  ["case is NOT folded", "Fee Is Paid Today ok", "Fee Is Paid Today ok", "Fee Is Paid Today ok", "fee is paid today ok"],
  ["NFKC is NOT applied", "read the ﬁne print here", "read the ﬁne print here", "read the ﬁne print here", "read the fine print here"],
  ["zero-width is NOT stripped", "read the fine​print here", "read the fine​print here", "read the fine​print here", "read the fineprint here"],
];
for (const [rule, s1, q1, s2, q2] of RULES) {
  test(`normalisation rule: ${rule} (equates one pair, refuses the other)`, () => {
    ok(verifyQuote([{ id: "r", text: s1 }], q1));
    refused(verifyQuote([{ id: "r", text: s2 }], q2), "not-found");
  });
}

test("normalisation never makes quotes with different letters/digits/word counts equal (seeded)", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)]!;
  const sig = (s: string) => (s.match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).join("|");
  const wsVar = [" ", "  ", "\n", "\t ", " "], dashVar = ["-", "–", "—", "−"], quoteVar = ["'", "’", "‘"];
  for (let i = 0; i < 300; i++) {
    const words = Array.from({ length: 2 + Math.floor(rnd() * 4) }, () => pick(["fee", "4500", "नहीं", "not", "é", "Fee"]));
    const a = words.map((w) => w + pick(wsVar)).join("");
    const b = words.map((w) => w + pick(wsVar)).join("").replace(/-/g, pick(dashVar)).replace(/'/g, pick(quoteVar));
    assert.equal(normaliseForQuote(a), normaliseForQuote(b));
    const c = [...words.slice(1), words[0]!].join(" ");
    if (sig(c) !== sig(a)) assert.notEqual(normaliseForQuote(c), normaliseForQuote(a));
    const d = words.join("") + " x";
    assert.notEqual(normaliseForQuote(d), normaliseForQuote(words.join(" ") + " x"));
  }
});

test("property: seeded token-aligned substrings verify and map back; one-letter change never verifies", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const vocab = ["alpha", "beta", "gamma", "delta", "admission", "fees", "scholarship", "नमस्ते", "प्रवेश", "बारे", "karenge", "42", "2026"];
  const turns: QuoteSourceTurn[] = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`, text: Array.from({ length: 6 + Math.floor(rnd() * 20) }, () => vocab[Math.floor(rnd() * vocab.length)]!).join(" "),
  }));
  let verified = 0, mutated = 0;
  for (let i = 0; i < 150; i++) {
    const ti = Math.floor(rnd() * turns.length);
    const toks = turns[ti]!.text.split(" ");
    const from = Math.floor(rnd() * (toks.length - 2));
    const to = from + 2 + Math.floor(rnd() * Math.min(5, toks.length - from - 1));
    const quote = toks.slice(from, to).join(" ");
    if ([...quote].length < 12) continue;
    const v = verifyQuote(turns, quote);
    assert.equal(v.ok, true, quote);
    if (v.ok) {
      const mine = v.locations.find((l) => l.turnId === turns[ti]!.id);
      assert.ok(mine, "maps back to the originating turn");
      assert.equal(turns[ti]!.text.slice(mine!.start, mine!.end), quote);
      verified++;
    }
    const letters = [...quote].map((c, k) => [c, k] as const).filter(([c]) => /[a-z]/.test(c));
    if (letters.length) {
      const [, k] = letters[Math.floor(rnd() * letters.length)]!;
      const bad = quote.slice(0, k) + "Q" + quote.slice(k + 1);
      refused(verifyQuote(turns, bad), "not-found"); mutated++;
    }
    const digits = [...quote].map((c, k) => [c, k] as const).filter(([c]) => /[0-9]/.test(c));
    if (digits.length) {
      const [c, k] = digits[0]!;
      const bad = quote.slice(0, k) + (c === "9" ? "8" : String(Number(c) + 1)) + quote.slice(k + 1);
      const v2 = verifyQuote(turns, bad);
      assert.equal(v2.ok, turns.some((t) => t.text.includes(bad)), bad);
    }
  }
  assert.ok(verified > 40 && mutated > 40, `verified=${verified} mutated=${mutated}`);
});

test("total on hostile input: never throws, typed refusals", () => {
  const hostile: unknown[] = ["", "   ", "\u0000\u0001 control chars here ok", "lone \ud800 surrogate here ok", "lone \udc00 surrogate here ok", "x".repeat(10_000), 42, null, undefined, {}, { text: 7 }, { text: "" }];
  const vs = verifyQuotes(T, hostile as never);
  assert.equal(vs.length, hostile.length);
  assert.deepEqual(vs.map((v) => (v.ok ? "ok" : v.reason)), ["empty", "empty", "invalid-characters", "invalid-characters", "invalid-characters", "too-long", "not-a-string", "not-a-string", "not-a-string", "not-a-string", "not-a-string", "empty"]);
  const weird = [{ id: "w", text: "lone \ud800 surrogate and \u0000 nul and ‮ bidi text here" }, null, { id: "x" }, { id: "y", text: "" }] as never;
  assert.doesNotThrow(() => verifyQuotes(weird, ["lone surrogate and nul", "bidi text here ok"]));
  assert.equal(verifyQuote(weird, "nul and ‮ bidi text here").ok, true);
  assert.deepEqual(verifyQuotes(null as never, ["a quote that is long enough"]).map((v) => v.ok), [false]);
  assert.deepEqual(verifyQuotes(T, null as never), []);
});

test("linear-ish time: 1 MB source, 20 quotes, and the classic KMP-killer pattern", () => {
  const big = [{ id: "big", text: "the quick brown fox jumps over the lazy dog. ".repeat(23_000) }];
  assert.ok(big[0]!.text.length > 1_000_000);
  const t0 = Date.now();
  const vs = verifyQuotes(big, Array.from({ length: 20 }, (_, i) => `quick brown fox jumps over the lazy dog. the ${i}`));
  const dt = Date.now() - t0;
  assert.equal(vs.every((v) => !v.ok), true);
  const adversarial = [{ id: "a", text: "a".repeat(1_000_000) }];
  const t1 = Date.now();
  refused(verifyQuote(adversarial, `${"a".repeat(1997)} b`), "not-found");
  const dt2 = Date.now() - t1;
  assert.ok(dt < 8000 && dt2 < 8000, `dt=${dt}ms dt2=${dt2}ms`);
});

test("fake summarizer: its claimed quotes are checked against the transcript turns", () => {
  const claimed = { summary: "Fees are final.", quotes: ["admission fee is not refundable after the first week", "the admission fee is refundable after the first week", "the fee is 4500 rupees"] };
  const vs = verifyQuotes(T, claimed.quotes);
  assert.deepEqual(vs.map((v) => v.ok), [true, false, true]);
  const grounded = vs.filter((v): v is Extract<QuoteVerdict, { ok: true }> => v.ok).map((v) => v.locations[0]!.turnId);
  assert.deepEqual(grounded, ["t1", "t2"]);
});
