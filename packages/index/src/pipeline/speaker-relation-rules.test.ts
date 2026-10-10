/**
 * packages/index/src/pipeline/speaker-relation-rules.test.ts -- ISS-282 / ISS-289 / ISS-104.
 *
 * Direction of an address, pinned at the predicate and through the shipping path. A new file because
 * speaker-name-rules.test.ts is already over its test budget. Both directions are asserted (ISS-098):
 * the third-party shapes that fabricated 8 identities, and the real self-introductions that must
 * still resolve.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";

import { extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";
import { citesNameAsSelfIdentification, citesNameAsHandover, citesNameAsThanks } from "./speaker-relation-rules.js";

const turn = (id: string, speakerRef: string, text: string): Turns =>
  ({ _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text });
const replies = (json: unknown): SpeakersCompleteFn => async () =>
  ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 }) as CompleteResult;

const SELF: [string, string][] = [
  ["My name is Ruby and I lead admissions.", "Ruby"],
  ["Hi all, Ruby here.", "Ruby"],
  ["Good morning everyone, Ruby speaking.", "Ruby"],
  ["This is Makrand Rajadhyaksha from Vidysea.", "Makrand Rajadhyaksha"],
];
for (const [text, name] of SELF) {
  test(`self-identification binds ${JSON.stringify(name)} in ${JSON.stringify(text)}`, () => {
    assert.equal(citesNameAsSelfIdentification(text, name), true);
  });
}

const NOT_SELF: [string, string][] = [
  ["I do see Ankit here, welcome.", "Ankit"],                    // c1 replay: host spotting a panelist
  ["Hi. Hi. Hi. Hi, Jubin, go now.", "Jubin"],                   // ISS-289: an address to a third party
  ["English speaking students may apply.", "English"],
  ["Prasanti, what do you think of this?", "Prasanti"],
];
for (const [text, name] of NOT_SELF) {
  test(`self-identification refuses ${JSON.stringify(name)} in ${JSON.stringify(text)}`, () => {
    assert.equal(citesNameAsSelfIdentification(text, name), false);
  });
}

test("handover: forward cues bind the NEXT speaker; a quoted address names nobody", () => {
  assert.equal(citesNameAsHandover("Thanks all. Over to you, Nikhil.", "Nikhil"), true);
  assert.equal(citesNameAsHandover("Okay. Rashi, I'll pass it on back to you.", "Rashi"), true);
  assert.equal(citesNameAsHandover('People often go, "Priya, what do you think", and stall.', "Priya"), false);
});

test("thanks: a clause-opening thank-you names the previous speaker; two names bind neither", () => {
  assert.equal(citesNameAsThanks("Thank you, Sonal. That was helpful.", "Sonal"), true);
  assert.equal(citesNameAsThanks("Thank you, Kshitij. Thanks, Anisha.", "Anisha"), false);
  assert.equal(citesNameAsThanks("I want to say thank you to the team, Sonal is next.", "Sonal"), false);
});

test("ISS-282: addressing a person on the single turn does not make the speaker that person", async () => {
  for (const [text, name] of [
    ["Good morning Doris Day, please go ahead.", "Doris Day"],
    ["Prasanti, what do you think about this?", "Prasanti"],
  ] as [string, string][]) {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([{ speakerRef: "spk:0", displayName: name, turnIds: ["t1"] }]));
    assert.deepEqual(resolved, [], `${name} is addressed by spk:0, not spk:0`);
  }
});

test("ISS-282: a thanks turn after a block names that block's speaker, once", async () => {
  const turns = [turn("t1", "Host", "Welcome."), turn("t2", "spk:0", "Glad to be here, a short overview."), turn("t3", "Host", "Thank you, Sonal. Next question.")];
  const { resolved } = await extractSpeakers(turns, replies([{ speakerRef: "spk:0", displayName: "Sonal", turnIds: ["t2"] }]));
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.displayName, "Sonal");
  assert.deepEqual(resolved[0]?.evidence.map((e) => e.turnId), ["t3"]);
});
