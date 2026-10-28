/**
 * packages/index/src/pipeline/speaker-name-rules-handover.test.ts — ISS-255 handover-inversion reproductions.
 *
 * Split out of `speaker-name-rules.test.ts` (W-S step 1, 2026-10-28) with NO change to any assertion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";

import { extractSpeakersRuleBased as extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";
import { citesNameAsAnIntroduction, hasNamingCueAt } from "./speaker-name-rules.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const replies = (json: unknown): SpeakersCompleteFn => async () => completion("", json);

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

/**
 * ISS-SPEAKER-001: the ISS-255 gate in `hasNamingCue` (a handover marker in the before-context leaves only a
 * self-naming cue able to bind) was untested in isolation: deleting it left the three tests above green, because
 * a later layer of `extractSpeakers` refuses the same sentences. These call the exported predicates directly.
 * Each refused sentence carries a WEAK after-cue (`from`) that WOULD bind the name without the gate, and each is
 * paired with a control that proves that cue is live when no handover marker precedes it.
 */
const HANDOVER_SENTENCES: [string, string][] = [
  ["Thank you, Shagun. In the essence of time, again, I invite our next speaker, Ruby, from Uni-Italia, to take us forward and with the understanding of visa process in Italy.", "Ruby"],
  ["I invite our next speaker, Ruby, from Uni-Italia, to take us forward.", "Ruby"],
  ["Coming up next, Nilesh from the west zone.", "Nilesh"],
];
for (const [text, name] of HANDOVER_SENTENCES) {
  test(`ISS-255 gate (predicate): a handover marker refuses the weak \`from\` cue for ${JSON.stringify(name)} in ${JSON.stringify(text.slice(0, 48))}`, () => {
    assert.equal(hasNamingCueAt(text, name, text.indexOf(name)), false, "the handover gate must withhold the after-cue");
    assert.equal(citesNameAsAnIntroduction(text, name), false, "and the public predicate must agree");
  });
}
test("ISS-255 gate (predicate) control: the same `from` cue binds when no handover marker precedes it", () => {
  assert.equal(citesNameAsAnIntroduction("Ruby, from Uni-Italia, will take questions.", "Ruby"), true, "the cue is live; only the gate suppressed it above");
  assert.equal(citesNameAsAnIntroduction("Nilesh from the west zone.", "Nilesh"), true);
});
test("ISS-255 gate (predicate) control: a self-naming cue survives the handover gate", () => {
  const text = "Before I invite our next speaker, I should say: call me Ruby.";
  assert.equal(hasNamingCueAt(text, "Ruby", text.indexOf("Ruby")), true, "self-naming overrides the handover refusal");
});
