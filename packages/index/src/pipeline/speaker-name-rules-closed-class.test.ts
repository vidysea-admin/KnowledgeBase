/**
 * packages/index/src/pipeline/speaker-name-rules-closed-class.test.ts — ISS-104 closed-class sentinels and the name-collision cost.
 *
 * Split out of `speaker-name-rules.test.ts` (W-S step 1, 2026-10-28) with NO change to any assertion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";

import { extractSpeakersRuleBased as extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const replies = (json: unknown): SpeakersCompleteFn => async () => completion("", json);

/**
 * ISS-104 cycle 4 — the CLOSED-CLASS ENUMERATION, one standing case per class.
 *
 * The chargeable half of ISS-104 was `not`, a negation particle; the six rounds before this one
 * each added the single word they were shown. Adding `not` alone would have been the seventh.
 * Measured instead: of 406 words enumerated from the closed classes of English, 277 were absent
 * from `NEVER_A_PERSON` and ALL 277 shipped a fabricated person — every one through this exact
 * `"I am <Word> sure about that."` shape, the one ISS-104 recorded for `Not`.
 *
 * What is pinned here is the CLASS, not the words: one representative per class, so a future
 * refactor that drops a class reddens a named test instead of quietly reopening a whole grammar
 * category. The full 406 are the audit in the manifest; these are the sentinels.
 */
const CLOSED_CLASS_SENTINELS: [string, string[]][] = [
  ["pronoun (reflexive/possessive)", ["Myself", "Theirs", "Itself"]],
  ["pronoun (indefinite)", ["Anything", "Another", "Nothing"]],
  ["interrogative / relative", ["Whom", "Whatever", "Which"]],
  ["conjunction / conjunctive adverb", ["Because", "However", "Although"]],
  ["preposition", ["Between", "Despite", "Towards", "Via"]],
  ["auxiliary / modal", ["Should", "Might", "Been"]],
  ["adverbial particle", ["Away", "Together", "Aside"]],
  ["negator", ["Nowhere", "Nope"]],
  ["degree / focusing adverb", ["Hardly", "Entirely", "Rather"]],
  ["deictic / temporal adverb", ["Tonight", "Already", "Always"]],
  ["numeral / ordinal", ["Seven", "Twelve", "Third"]],
  ["greeting / farewell", ["Namaste", "Goodbye", "Cheers"]],
  ["acknowledgement", ["Indeed", "Certainly", "Noted"]],
  ["interjection / filler", ["Hmm", "Oops", "Wow"]],
  ["evaluative response", ["Perfect", "Brilliant", "Awesome"]],
  ["calendar term", ["Weekend", "Hour", "Year"]],
];

for (const [className, words] of CLOSED_CLASS_SENTINELS) {
  for (const word of words) {
    test(`ISS-104 closed class — ${className}: refuses ${JSON.stringify(word)}`, async () => {
      const text = `I am ${word} sure about that.`;
      const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
        { speakerRef: "spk:0", displayName: word, turnIds: ["t1"] },
      ]));
      assert.deepEqual(resolved, [], `${word} is a ${className}, not a person`);
    });
  }
}

/**
 * ISS-104 cycle 4 — the NAME-COLLISION COST, pinned in both directions so it stays visible.
 *
 * `will`, `can`, `dare`, `need`, `day` and `true` are closed-class words that are also attested
 * personal names, so a BARE single-token "Will" is now refused. That cost is deliberate — C12
 * makes these guards the only barrier against a fabricated identity, so refusal is the safe
 * direction of error, and `may`/`march`/`june`/`august` have carried the same cost as month names
 * since cycle 3. It is pinned rather than merely documented because a silent recall loss is
 * exactly what ISS-098 was.
 *
 * The bound on the cost is `isDiscourseOnly`'s ALL-tokens rule: multi-token names are untouched.
 * If a later cycle changes that to ANY-token, the second test here goes red immediately.
 */
test("ISS-104 collision cost: a bare closed-class name is refused (accepted, documented)", async () => {
  const { resolved } = await extractSpeakers([turn("t1", "spk:0", "My name is Will and I lead admissions.")], replies([
    { speakerRef: "spk:0", displayName: "Will", turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, [], "bare 'Will' is refused — the accepted cost of the modal class");
});

for (const [text, name] of [
  ["My name is Will Smith and I lead admissions.", "Will Smith"],
  ["Good morning everyone, Doris Day here.", "Doris Day"],
  ["This is Can Ozturk from the Istanbul office.", "Can Ozturk"],
] as [string, string][]) {
  test(`ISS-104 collision bound: multi-token ${JSON.stringify(name)} still resolves`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.equal(resolved.length, 1, "isDiscourseOnly requires EVERY token — a real surname rescues the name");
    assert.equal(resolved[0]?.displayName, name);
  });
}
