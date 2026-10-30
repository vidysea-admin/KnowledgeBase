/**
 * packages/index/src/pipeline/speaker-name-rules-speaking.test.ts — the `speaking` cue corpora (ISS-098, ISS-110, ISS-104 clause-opening).
 *
 * Split out of `speaker-name-rules.test.ts` (W-S step 1, 2026-10-28) with NO change to any assertion: recall of the
 * self-identification idiom "Ruby speaking", the following-noun refusals, and the clause-opening rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";

import { extractSpeakersRuleBased as extractSpeakers, type SpeakersCompleteFn } from "../speakers-llm.js";
import { citesNameAsAnIntroduction } from "../speaker-name-rules.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const replies = (json: unknown): SpeakersCompleteFn => async () => completion("", json);

/**
 * ISS-098's ten recorded recall regressions, verbatim from its `qa/issues.jsonl` evidence field.
 *
 * The cycle-2 `speaking` gate refused all ten. They are the self-identification idiom the cue
 * exists to admit, and the suite could not see the loss: reverting the whole gate reddened exactly
 * ONE test, so the gate was fully measured on refusal and completely unmeasured on recall.
 *
 * The manifest claimed "zero recall loss: all 14 probes correct". That was false, and the 14 probes
 * were ones I chose -- the same self-selected-denominator habit D-015 exists to stop, pointed at
 * recall instead of refusal. These cases are the checker's, not mine, which is the point.
 */
for (const text of [
  "Ruby speaking here.",
  "Ruby speaking and I lead admissions.",
  "Ruby speaking today from Pune.",
  "Ruby speaking again.",
  "Ruby speaking now.",
  "Ruby speaking -- good to be here.",
  "Ruby speaking as the panel chair.",
  "Ruby speaking (admissions).",
  "Ruby speaking\u2026 thanks all.",
  "Ruby speaking over Zoom.",
]) {
  test(`ISS-098 recall: still resolves ${JSON.stringify(text)}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
    ]));
    assert.equal(resolved.length, 1, "the `speaking` idiom must keep resolving");
    assert.equal(resolved[0]?.personId, "person:ruby");
  });
}

test("ISS-098: a bare noun after `speaking` declines the cue WITHOUT vetoing later branches", async () => {
  // The cycle-2 bug was an unconditional early return: the speaking branch refused the whole
  // predicate, so no later cue could fire. Here the participle declines but the address comma
  // still supplies a cue, which only works if the branch falls through.
  // ISS-282 moved this assertion to the cue predicate it pins: the address names PRASANTI, so it
  // can no longer identify the label SPEAKING it (spk:0) -- that refusal is asserted below.
  const text = "Prasanti, what do you think of English speaking students?";
  assert.equal(citesNameAsAnIntroduction(text, "Prasanti"), true, "a declining speaking branch must not veto the address cue");
  const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([{ speakerRef: "spk:0", displayName: "Prasanti", turnIds: ["t1"] }]));
  assert.deepEqual(resolved, [], "ISS-282: addressing Prasanti does not make the speaker Prasanti");
});

/**
 * ISS-110's two recorded probes: a legitimate self-introduction refused because `very` / `first` were not in a hand-listed
 * set. The rule is now a following-NOUN test, so an intensifier or a sequencing adverb is looked THROUGH, and a noun after
 * it still refuses -- the controls pin the refusal direction so the fix cannot become "allow anything".
 */
for (const text of ["Ruby speaking very briefly.", "Ruby speaking first, then Nilesh."]) {
  test(`ISS-110 recorded: still resolves ${JSON.stringify(text)}`, () => {
    assert.equal(citesNameAsAnIntroduction(text, "Ruby"), true);
  });
}
for (const [text, name] of [
  ["English speaking students may apply.", "English"], ["English speaking first graders may apply.", "English"],
  ["Ruby speaking very good students.", "Ruby"], ["Ruby speaking first students.", "Ruby"], ["Ruby speaking staff are here.", "Ruby"],
] as [string, string][]) {
  test(`ISS-110 control: a following noun still refuses ${JSON.stringify(text)}`, () => {
    assert.equal(citesNameAsAnIntroduction(text, name), false, "`speaking` modifies the noun, so it is a participle, not a cue");
  });
}

/** ISS-104: "X speaking" binds only when X opens its clause; the greeting-led and sentence-initial forms keep resolving. */
for (const text of ["Hello everyone, Ruby speaking.", "Good morning. Ruby speaking from Pune.", "Thanks. Ruby speaking again."]) {
  test(`ISS-104 clause-opening recall: ${JSON.stringify(text)}`, () => { assert.equal(citesNameAsAnIntroduction(text, "Ruby"), true); });
}
test("ISS-104: a name inside a larger construction does not bind through `speaking`", () => {
  assert.equal(citesNameAsAnIntroduction("This is Ruby speaking on the panel.", "Ruby"), false, "single-token; the multi-token form is a separate cue");
  assert.equal(citesNameAsAnIntroduction("This is Ruby Mehta speaking on the panel.", "Ruby Mehta"), true);
});
