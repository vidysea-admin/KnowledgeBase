/**
 * packages/index/src/pipeline/speaker-name-rules-place.test.ts — ISS-104 cycle-5 cases.
 *
 * Split out of `speaker-name-rules.test.ts` when that file crossed the 400-line test budget. These are
 * the place-vs-person signal, `X here` idiom and handover cases, moved whole with their helpers.
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

/** One turn, one injected candidate — the shape every corpus below is measured in. */
async function shipped(text: string, name: string): Promise<boolean> {
  const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
    { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
  ]));
  return resolved.length > 0;
}

/**
 * ISS-104 cycle 5 — the PLACE-VS-PERSON SIGNAL (D-052 ruling 2, Approved-by: Umesh).
 *
 * Umesh chose a contextual signal over a place-name lookup list, which was rejected on the record
 * because it wrongly refuses real people named India or Paris and never finishes. So nothing here
 * knows that Mumbai is a city. What it knows is that a LOCATIVE preposition cannot govern a
 * person: "students in Mumbai" is a place reading of that string, "Mumbai said" is not — the exact
 * distinction the ruling names. A turn that reads its own candidate locatively may still bind it
 * to a speaker through an EXPLICIT naming cue ("my name is Paris") or a direct address ("Paris,
 * what do you think?"), and may no longer do so through the weak affiliation after-cues
 * (`here` / `from` / `speaking`), which are precisely what a place name mimics.
 *
 * Both directions are asserted, per ISS-098: the attacks below and the recall cases after them.
 */
for (const [text, name] of [
  ["We have students in Mumbai. Mumbai here has forty students.", "Mumbai"],
  ["Our students in India. India speaking on the panel.", "India"],
  ["I am in Mumbai this week, Mumbai from the west zone.", "Mumbai"],
  ["Based in Bangalore, Bangalore here with an update.", "Bangalore"],
] as [string, string][]) {
  test(`ISS-104 place signal: refuses ${JSON.stringify(name)} in ${JSON.stringify(text)}`, async () => {
    assert.equal(await shipped(text, name), false, "a locatively-governed string is a place, not this speaker");
  });
}

/** The signal must not cost the strong cues: a real person named Paris still self-names. */
for (const [text, name] of [
  ["Hi, my name is Paris.", "Paris"],
  ["Hello, my name is Mumbai Sharma.", "Mumbai Sharma"],
  ["Paris here, from admissions.", "Paris"],
  ["Hello everyone, I'm Priya.", "Priya"],
] as [string, string][]) {
  test(`ISS-104 place signal recall: still resolves ${JSON.stringify(name)} in ${JSON.stringify(text)}`, async () => {
    assert.equal(await shipped(text, name), true, "an explicit naming cue or a direct address survives the place signal");
  });
}

/** Cycle 5 recall cost (allow-list, ISS-PH3-006): a FREE sentence before the cue is no longer harmless, so these four former positives are refused. */
for (const [text, name] of [["We met in Paris. My name is Paris.", "Paris"], ["I am in Mumbai today. My name is Mumbai Sharma.", "Mumbai Sharma"],
  ["Our office is in Priya's building. My name is Priya.", "Priya"], ["Coming up next, I will share the slides. My name is Nilesh.", "Nilesh"]] as [string, string][]) {
  test(`cycle 5 recall cost: refused, a free sentence precedes the cue: ${JSON.stringify(text)}`, async () => { assert.equal(await shipped(text, name), false); });
}

/**
 * The signal's FALSE-POSITIVE COST, pinned in the direction that hurts so it stays visible.
 *
 * A real person called Paris, in a turn that ALSO uses Paris as a place, with only a weak
 * affiliation cue, is now refused. That is a genuine recall loss and not a hypothetical: it is the
 * one case where the signal cannot tell the two readings apart, because the turn contains both.
 * Refusal is the safe direction under C12 (a fabricated identity is the worse error), and the cost
 * is bounded to single-token candidates — the multi-token recall test above is the bound.
 */
test("ISS-104 place signal cost: a weak cue plus a place reading of the same string is refused", async () => {
  assert.equal(await shipped("We met in Paris. Paris here, from admissions.", "Paris"), false,
    "documented cost — if a later cycle separates these, correct the count in the manifest");
});

/**
 * ISS-104 cycle 5 — `X here` is the self-identification idiom ONLY when nothing follows it.
 *
 * "Google here has an announcement." was the third ledger residue, and it is not a place-vs-person
 * problem at all: "Nilesh here has an announcement." is the moderator pointing AT Nilesh, so
 * crediting the turn's own label with that name is the ISS-255 inversion, whoever the name belongs
 * to. Self-identification ends the clause — "Ruby here." / "Ruby here, from admissions." / "Ruby
 * here and I lead admissions." — while a following finite verb makes it a third-party deictic. The
 * discriminator is the one the `speaking` branch already uses, and it is candidate-independent.
 */
for (const text of [
  "Ruby here.",
  "Ruby here, from admissions.",
  "Ruby here and I lead admissions.",
  "Ruby here to talk about visas.",
  "Ruby here -- good to be with you.",
  "Ruby here speaking from Pune.",
]) {
  test(`ISS-104 here-idiom recall: still resolves ${JSON.stringify(text)}`, async () => {
    assert.equal(await shipped(text, "Ruby"), true, "the `X here` self-identification must keep resolving");
  });
}
for (const text of ["Ruby here has an announcement.", "Ruby here will take the next question."]) {
  test(`ISS-104 here-deictic: refuses ${JSON.stringify(text)}`, async () => {
    assert.equal(await shipped(text, "Ruby"), false, "a finite verb after `here` makes it a third-party mention");
  });
}

/**
 * ISS-104 cycle 5 — "Coming up next, <Name> from <somewhere>." is a HANDOVER.
 *
 * The second ledger residue, "Coming up next, Mumbai from the west zone.", is the same story as
 * the first: the person-valid twin "Coming up next, Nilesh from the west zone." must ALSO be
 * refused for this label, because the turn announces who speaks NEXT (ISS-255). Both are pinned so
 * the marker is not read as a place rule.
 */
test("ISS-104 handover: `coming up next` refuses the introduced name for the CURRENT label", async () => {
  assert.equal(await shipped("Coming up next, Nilesh from the west zone.", "Nilesh"), false,
    "the announced speaker is not this turn's speaker");
});
test("ISS-104 handover: self-naming in the same turn still resolves", async () => {
  assert.equal(await shipped("Hello everyone, I would like to introduce myself, my name is Nilesh.", "Nilesh"), true,
    "a self-naming cue survives the handover gate");
});
