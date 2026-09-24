/**
 * packages/index/src/pipeline/speaker-name-rules.test.ts — the LEDGER REGRESSION CORPORA.
 *
 * Split out of `speakers-llm.test.ts` when that file crossed the 400-line budget, along the same
 * seam as the source split: these are the recorded attack and recall sets for the name rules, and
 * they exist because of D-015 — a fix must be measured against its issue's OWN recorded cases, not
 * a corpus its author chose.
 *
 * Both directions are pinned here on purpose. Cycle 2 of this seam measured refusal against the
 * ledger and recall against 14 self-chosen probes, claimed "zero recall loss", and had in fact
 * dropped ten recorded introductions. Refusal and recall are asserted together so tightening one
 * at the other's cost fails loudly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";

import { extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";
import { citesNameAsAnIntroduction } from "./speaker-name-rules.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const replies = (json: unknown): SpeakersCompleteFn => async () => completion("", json);

/**
 * ISS-093's OWN recorded corpus, transcribed verbatim from its `qa/issues.jsonl` evidence field.
 *
 * Required by D-015. Cycle 3 of this seam added the discourse denylist, measured 12/12 against a
 * corpus the maker authored that same cycle, and reported it -- while ISS-093's own 20 cases gave
 * 15/20 and still shipped `person:not` from "I am Not sure about that.". `not` was named by that
 * exact word in the issue's fix_direction. A fix measured against a corpus its own author chose is
 * marking homework with an easier exam.
 *
 * Four cases are deliberately NOT closed and are asserted as still-shipping so the number stays
 * honest: India, Mumbai, Google, English are proper nouns, not discourse words. No pattern
 * separates a city or a company from a person -- that needs a gazetteer, and the model, not this
 * module, is the layer that should decline to propose them. They are carried to the apply unit.
 *
 * Current standing: ISS-093: 17/20 refused, 3 open (all gazetteer-class).
 *
 * "English" was in that residue set until the cycle-1 checker showed it was NOT gazetteer-bound:
 * in "English speaking students may apply." the `speaking` cue is a participial modifier, not the
 * self-identification idiom, and the distinction is candidate-independent ("Prasanti speaking
 * students may apply." is not a naming construction either). ISS-097. Writing it off as
 * unreachable was my error, and pinning it as expected-shipping entrenched it.
 */
const ISS_093_CORPUS: [string, string][] = [
  ["Hello Everyone, thanks for joining.", "Everyone"],
  ["Welcome Everyone to the session.", "Everyone"],
  ["Hey Everyone welcome aboard.", "Everyone"],
  ["Thanks All for being here.", "All"],
  ["Hi Guys, let us start.", "Guys"],
  ["Hi There, can you hear me?", "There"],
  ["Welcome Back to the second session.", "Back"],
  ["Welcome To the annual conference.", "To"],
  ["Thank you So much everyone.", "So"],
  ["I'm Sorry about the delay.", "Sorry"],
  ["I am Not sure about that.", "Not"],
  ["That's Great news for us.", "Great"],
  ["This is Important for all of you.", "Important"],
  ["Thank you Monday for the slot.", "Monday"],
  ["Monday with us marks the deadline.", "Monday"],
  ["Welcome Diwali celebrations this week.", "Diwali"],
  ["This is India speaking on the panel.", "India"],
  ["Coming up next, Mumbai from the west zone.", "Mumbai"],
  ["Google here has an announcement.", "Google"],
  ["English speaking students may apply.", "English"],
];

/**
 * The ISS-093 cases that remain open by design -- proper nouns, not discourse words. ISS-282 closed
 * "Mumbai": "Coming up next, Mumbai" is not the SPEAKER naming itself, so it no longer binds spk:0.
 * ISS-282 c1b closed "India": "This is India speaking" -- "X speaking" binds only when X opens a clause.
 */
const ISS_093_GAZETTEER = new Set(["Google"]);

for (const [text, name] of ISS_093_CORPUS) {
  const expectedRefusal = !ISS_093_GAZETTEER.has(name);
  test(`ISS-093 corpus: ${JSON.stringify(name)} in ${JSON.stringify(text)} is ${expectedRefusal ? "refused" : "a known gazetteer residue"}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    if (expectedRefusal) {
      assert.deepEqual(resolved, [], `${JSON.stringify(name)} is a discourse word, not a person`);
    } else {
      // Asserted as still-shipping ON PURPOSE. If a later unit closes it, this test fails and
      // forces the count in the manifest to be corrected upward -- the number cannot silently rot.
      assert.equal(resolved.length, 1, `${JSON.stringify(name)} is a documented open residue; if it now refuses, update the ISS-093 count`);
    }
  });
}

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
 * ISS-255's own recorded reproductions (from its qa/issues.jsonl evidence field, measured live
 * 2026-09-21 on the visa session). The handover-inversion is the defect: a turn that ANNOUNCES
 * the next speaker must not credit that name to the CURRENT label.
 */
test("ISS-255: a moderator's handover turn does NOT ship the introduced name as the moderator", async () => {
  // The exact recorded case: spk:0's own turn invites the next speaker, Ruby.
  const text =
    "Thank you, Shagun. In the essence of time, again, I invite our next speaker, Ruby, from " +
    "Uni-Italia, to take us forward and with the understanding of visa process in Italy.";
  const { resolved } = await extractSpeakers([turn("t205", "spk:0", text)], replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t205"] },
  ]));
  assert.deepEqual(resolved, [], "the handover inversion must be refused, not shipped");
});

test("ISS-255: the handover still lets the REAL speaker self-name in their own turn", async () => {
  // Ground truth from the same session: spk:2's turn self-names; the handover must not stop that.
  const turns = [
    turn("t205", "spk:0", "I invite our next speaker, Ruby, from Uni-Italia, to take us forward."),
    turn("t206", "spk:2", "Thank you. Hello everyone. My name is Ruby. I work at Uni-Italia."),
  ];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:2", displayName: "Ruby", turnIds: ["t206"] },
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t205"] },
  ]));
  const ruby = resolved.find((r) => r.displayName === "Ruby");
  assert.ok(ruby, "Ruby still resolves");
  assert.equal(ruby?.speakerRef, "spk:2", "and via the SELF-NAMING label, never the moderator");
});

test("ISS-255: handover markers do not block genuine direct self-naming in the same turn", async () => {
  // "call me" + handover marker both present: the self-naming branch must survive the gate.
  const { resolved } = await extractSpeakers(
    [turn("t1", "spk:0", "Before I invite our next speaker, I should say: call me Ruby.")],
    replies([{ speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] }]),
  );
  assert.equal(resolved.length, 1, "self-naming overrides the handover refusal");
});
