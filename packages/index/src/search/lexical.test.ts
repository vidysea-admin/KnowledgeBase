/**
 * packages/index/src/search/lexical.test.ts — pure-function coverage for `lexicalSearchTurns`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lexicalSearchTurns, lexicalQueryTokens } from "./lexical.js";

const TURNS = [
  { _id: "t1", sessionId: "s1", text: "New Zealand student visa approval rates and processing times." },
  { _id: "t2", sessionId: "s2", text: "Education loan interest rates and forex remittance markups." },
  { _id: "t3", sessionId: "s1", text: "Completely unrelated small talk about the weather today." },
];

test("Hindi vowel signs and mixed Hinglish terms survive the lexical prefilter", () => {
  const turns = [{ _id: "hi", sessionId: "s", text: "करियर सलाह aur admission counselling" },
    { _id: "other", sessionId: "s", text: "असंबंधित मौसम" }];
  assert.deepEqual(lexicalQueryTokens("करियर सलाह"), ["करियर", "सलाह"]);
  assert.deepEqual(lexicalSearchTurns("करियर counselling", turns, 5).map((h) => h.turnId), ["hi"]);
  assert.ok(lexicalQueryTokens("करियर counselling").every((token) => turns[0]!.text.includes(token)));
});

test("ranks a matching turn above a non-matching one", () => {
  const hits = lexicalSearchTurns("visa approval rates", TURNS, 10);
  assert.equal(hits[0]?.turnId, "t1");
  assert.ok(hits[0]!.score > 0);
});

test("a turn with zero query-term overlap is excluded, not scored 0", () => {
  const hits = lexicalSearchTurns("visa approval rates", TURNS, 10);
  assert.ok(!hits.some((h) => h.turnId === "t3"), "an unrelated turn must not appear at all");
});

test("k limits the result count", () => {
  const hits = lexicalSearchTurns("rates", TURNS, 1);
  assert.equal(hits.length, 1);
});

test("an empty query returns no hits, never a match-all", () => {
  assert.deepEqual(lexicalSearchTurns("", TURNS, 10), []);
  assert.deepEqual(lexicalSearchTurns("   ", TURNS, 10), []);
});

test("scores are in [0, 1], the same scale as every other heuristic scorer in this repo", () => {
  const hits = lexicalSearchTurns("visa", TURNS, 10);
  for (const h of hits) {
    assert.ok(h.score > 0 && h.score <= 1);
  }
});

test("results are sorted descending by score", () => {
  const hits = lexicalSearchTurns("rates", TURNS, 10);
  for (let i = 1; i < hits.length; i++) {
    assert.ok(hits[i - 1]!.score >= hits[i]!.score);
  }
});

// --- lexicalQueryTokens: the contract a datastore pre-filter depends on ---

test("lexicalQueryTokens uses the SAME tokenization the scorer scores with", () => {
  // If these ever diverge, a pre-filter built from these tokens silently stops being a superset
  // of what the scorer can match, and searches start missing real hits with no error anywhere.
  assert.deepEqual(lexicalQueryTokens("Visa, approval RATES!").sort(), ["approval", "rates", "visa"]);
  assert.deepEqual(lexicalQueryTokens(""), []);
  assert.deepEqual(lexicalQueryTokens("   "), []);
});

test("short tokens are KEPT — dropping them silently loses real hits (measured regression)", () => {
  // Verified against real data 2026-09-08: a plausible `length > 2` filter turned a 10-hit result
  // for "AI in counselling" into 2, and reduced "is it ok to go" to zero tokens — an empty $or,
  // which Mongo rejects outright.
  assert.deepEqual(lexicalQueryTokens("AI in counselling").sort(), ["ai", "counselling", "in"]);
  assert.equal(lexicalQueryTokens("is it ok to go").length, 5, "every token must survive, however short");
});

test("PROPERTY: every turn the scorer can score is reachable by a substring pre-filter on these tokens", () => {
  // This is the mechanized form of the guarantee `createMongoSearchDeps` relies on. The scorer
  // matches WHOLE tokens; a substring filter is strictly more permissive, so it must return a
  // superset. Asserted over the scored set rather than spot-checked on one query.
  const corpus = [
    ...TURNS,
    { _id: "t4", sessionId: "s3", text: "AI is reshaping counselling workflows in 2026." },
    { _id: "t5", sessionId: "s3", text: "Is it ok to go without a bank statement?" },
    { _id: "t6", sessionId: "s4", text: "Costs run to 2.5% at banks -- C++ tooling is irrelevant here." },
  ];
  const queries = ["AI in counselling", "is it ok to go", "visa student", "C++ costs", "rates"];

  for (const q of queries) {
    const tokens = lexicalQueryTokens(q);
    for (const hit of lexicalSearchTurns(q, corpus, corpus.length)) {
      const turn = corpus.find((t) => t._id === hit.turnId)!;
      const reachable = tokens.some((tok) => turn.text.toLowerCase().includes(tok));
      assert.ok(
        reachable,
        `"${q}" scored turn ${hit.turnId} at ${hit.score}, but no pre-filter token appears in its text — a Mongo pre-filter would MISS this hit`,
      );
    }
  }
});
