/**
 * packages/index/src/pipeline/speakers-llm.test.ts — U2.4, the LLM half.
 *
 * The deterministic pass reaches 78/494 turns (15.8%). This is the path to the other ~84%, and the
 * whole risk of it is that a model will happily invent a plausible human name. So the tests below
 * are mostly about REFUSAL: what the extractor throws away.
 *
 * The rule it exists to enforce (plan §10): "zero speaker name that does not appear verbatim in a
 * cited turn". A model that returns a correctly-spelled name the transcript never says is exactly
 * the Juben/Jubin defect that motivated this unit, arriving by a different route.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";

import { buildSpeakerWindows, extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const replies = (json: unknown): SpeakersCompleteFn => async () => completion("", json);

test("keeps a speaker whose name is verbatim in a real cited turn", async () => {
  const turns = [turn("t1", "spk:0", "Good morning, this side Nilesh Gotecha from CEPT.")];
  const { resolved, degraded } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Nilesh Gotecha", turnIds: ["t1"] },
  ]));
  assert.equal(degraded, null);
  assert.equal(resolved.length, 1);
  const s = resolved[0];
  assert.ok(s);
  assert.equal(s.displayName, "Nilesh Gotecha");
  assert.equal(s.personId, "person:nilesh-gotecha");
  assert.deepEqual(s.evidence, [{ turnId: "t1", sessionId: "s1" }]);
});

test("DROPS a name the cited turn does not contain verbatim -- the Juben/Jubin defect", async () => {
  // The model returns the summarizer's normalised spelling; the transcript says something else.
  const turns = [turn("t1", "spk:0", "My name is Jubin Thakkar.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Juben Thakur", turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, [], "a plausible but unspoken spelling must never ship");
});

test("drops a fabricated turnId, and drops the speaker entirely if none survive", async () => {
  const turns = [turn("t1", "spk:0", "My name is Ruby.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t99-does-not-exist"] },
  ]));
  assert.deepEqual(resolved, [], "no speaker ships on invented evidence");
});

test("keeps only the surviving subset when some cited turns are real and some are not", async () => {
  // Both turns must NAME Ruby: a bare mention is not evidence. Cycle 3 also demoted the bare
  // demonstrative for SINGLE-token names ("This is India calling."), so t2 uses an after-cue.
  const turns = [turn("t1", "spk:0", "My name is Ruby."), turn("t2", "spk:0", "Ruby here again.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1", "t404", "t2"] },
  ]));
  assert.equal(resolved.length, 1);
  assert.deepEqual(resolved[0]?.evidence, [
    { turnId: "t1", sessionId: "s1" },
    { turnId: "t2", sessionId: "s1" },
  ]);
});

test("refuses to rename a turn that already carries a real name", async () => {
  const turns = [turn("t1", "Sapna Goyal", "My name is Sapna Goyal.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "Sapna Goyal", displayName: "Sapna Goyal", turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, [], "only positional spk:N labels are in scope");
});

test("drops a speakerRef that does not exist in the transcript at all", async () => {
  const turns = [turn("t1", "spk:0", "My name is Ruby.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:7", displayName: "Ruby", turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, [], "cannot name a speaker who never spoke");
});

test("one label claiming two different names is left unresolved, not coin-flipped", async () => {
  // Both turns must be cued introductions, otherwise one claim is filtered out first and the
  // contradiction this test exists to catch never reaches the guard.
  const turns = [turn("t1", "spk:0", "Anita Desai here."), turn("t2", "spk:0", "Actually, my name is Rahul Mehta.")];
  const { resolved, unresolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Anita Desai", turnIds: ["t1"] },
    { speakerRef: "spk:0", displayName: "Rahul Mehta", turnIds: ["t2"] },
  ]));
  assert.deepEqual(resolved, []);
  assert.deepEqual(unresolved, ["spk:0"]);
});

test("a provider failure DEGRADES to the deterministic pass, never to a silent empty result", async () => {
  const turns = [turn("t1", "spk:0", "My name is Jubin Thakkar."), turn("t2", "spk:1", "Sure.")];
  const boom: SpeakersCompleteFn = async () => { throw new Error("429 rate limited"); };
  const { resolved, degraded } = await extractSpeakers(turns, boom);
  assert.ok(degraded, "the caller must be able to tell 'unknown' from 'none found'");
  assert.match(degraded.reason, /429/);
  assert.equal(resolved.length, 1, "the regex fallback still resolves what it can");
  assert.equal(resolved[0]?.displayName, "Jubin Thakkar");
});

test("an unparseable response degrades rather than throwing", async () => {
  const turns = [turn("t1", "spk:0", "Hello there.")];
  const junk: SpeakersCompleteFn = async () => completion("not json at all");
  const { resolved, degraded } = await extractSpeakers(turns, junk);
  assert.ok(degraded);
  assert.deepEqual(resolved, []);
});

test("sends the citable transcript and the speakers jobKind", async () => {
  const turns = [turn("t1", "spk:0", "My name is Ruby.")];
  const seen: Job[] = [];
  const spy: SpeakersCompleteFn = async (job) => { seen.push(job); return completion("", []); };
  await extractSpeakers(turns, spy);
  const job = seen[0];
  assert.ok(job, "the provider must actually be called");
  assert.equal(job.kind, "speakers");
  const userMessage = job.messages.at(-1);
  assert.ok(userMessage);
  assert.match(userMessage.content, /\[id:t1\]/);
  assert.match(userMessage.content, /\[spk:0\]/);
});

/**
 * C2 hardening. The cycle-1 checker got two attacks past the verbatim rule, which was a bare
 * substring test with no token boundary and no name-shape constraint:
 *
 *   "Ruby"         against "My name is Rubykumar Shah."  -> shipped as person:ruby
 *   "Good morning" against "Good morning everyone."      -> shipped as person:good-morning
 *
 * Both are anti-fabrication failures: a model supplies the string, so "it appeared in the text"
 * is not enough -- it has to have appeared AS A NAME. These pin the fix.
 */
test("refuses a name that only appears INSIDE a longer word", async () => {
  const turns = [turn("t1", "spk:0", "My name is Rubykumar Shah.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, [], "'Ruby' inside 'Rubykumar' is not a verbatim mention of Ruby");
});

test("refuses a lowercase phrase that happens to be in the transcript", async () => {
  const turns = [turn("t1", "spk:0", "Good morning everyone.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Good morning", turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, [], "a greeting is not a name");
});

test("still accepts the legitimate names the hardening must not break", async () => {
  for (const [text, name, expected] of [
    ["My name is Ruby.", "Ruby", "person:ruby"],
    ["My name is Jubin Thakkar.", "Jubin Thakkar", "person:jubin-thakkar"],
    ["I am Amrita Mhapankar, and welcome.", "Amrita Mhapankar", "person:amrita-mhapankar"],
    ["This is Makrand Rajadhyaksha speaking.", "Makrand Rajadhyaksha", "person:makrand-rajadhyaksha"],
    ["Hello, D'Souza here.", "D'Souza", "person:d-souza"],
  ] as [string, string, string][]) {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.equal(resolved.length, 1, `${name} must still resolve`);
    assert.equal(resolved[0]?.personId, expected);
  }
});

test("accepts a name at the very start and very end of a turn", async () => {
  // Still testing the offset arithmetic at both edges of a turn -- now with turns that
  // actually name someone, which is what the cue rule requires.
  for (const text of ["Ruby speaking.", "My name is Ruby"]) {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
    ]));
    assert.equal(resolved.length, 1, `boundary case failed for: ${text}`);
  }
});

test("refuses an absurdly long 'name' -- a sentence is not an identity", async () => {
  const text = "Thank You All For Joining Us Today In This Session";
  const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
    { speakerRef: "spk:0", displayName: text, turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, []);
});

/**
 * Fix cycle 2. The cycle-1 verdict on this hardening FAILED it with two findings, both reproduced
 * before being fixed:
 *
 *   ISS-091 (critical) "Welcome" / "Thanks" / "Okay" / "I" all shipped as people. `person:i` came
 *                      from "I am going to start now." -- a human being invented out of a pronoun.
 *                      Capitalisation is not nameness: transcript prose capitalises sentence starts,
 *                      so "Good morning" was only ever caught because English lowercases "morning".
 *   ISS-092 (high)     The Rubykumar attack survived one character away: "Ruby" against
 *                      "My name is Ruby-Anne Smith." still shipped, because containsNameVerbatim
 *                      treated "-" as a boundary while looksLikeAName admits it INSIDE a name --
 *                      two contradictory definitions of where a name ends, failing open.
 */
for (const [label, text, name] of [
  ["a greeting", "Welcome everyone to the session.", "Welcome"],
  ["a bare pronoun", "I am going to start now.", "I"],
  ["a thanks", "Thanks for joining us today.", "Thanks"],
  ["a filler word", "Okay so let us begin.", "Okay"],
] as [string, string, string][]) {
  test(`ISS-091: refuses ${label} as a person`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.deepEqual(resolved, [], `${JSON.stringify(name)} is not a human being`);
  });
}

for (const [label, name] of [
  ["the first half of a hyphenated name", "Ruby"],
  ["the second half of a hyphenated name", "Anne"],
] as [string, string][]) {
  test(`ISS-092: refuses ${label}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", "My name is Ruby-Anne Smith.")], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.deepEqual(resolved, [], "a hyphen joins a name, it does not end one");
  });
}

test("ISS-092: the whole hyphenated name still resolves", async () => {
  const { resolved } = await extractSpeakers([turn("t1", "spk:0", "My name is Ruby-Anne Smith.")], replies([
    { speakerRef: "spk:0", displayName: "Ruby-Anne Smith", turnIds: ["t1"] },
  ]));
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.personId, "person:ruby-anne-smith");
});

test("a name is only accepted where the turn actually NAMES someone", async () => {
  // Same name, same speaker -- the difference is whether the turn is an act of naming.
  const cued = await extractSpeakers([turn("t1", "spk:0", "My name is Ruby.")], replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
  ]));
  assert.equal(cued.resolved.length, 1, "an explicit introduction names someone");

  const uncued = await extractSpeakers([turn("t1", "spk:0", "The Ruby programming language is popular.")], replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
  ]));
  assert.deepEqual(uncued.resolved, [], "a passing mention is not an introduction");
});

/**
 * The cue rule and the shape rule are INDEPENDENT guards, and the cycle-2 mutation run proved the
 * suite had stopped pinning the shape half: removing `looksLikeAName` (and the 4-token cap) changed
 * nothing, because every existing fixture was already rejected by the cue rule first.
 *
 * That is not evidence the shape guard is redundant -- an earlier cycle taught exactly that lesson
 * about a different guard. These cases have a real naming cue AND an unshaped candidate, so only
 * the shape guard can stop them.
 */
for (const [label, text, name] of [
  ["a lowercase phrase after a cue", "Thanks a lot everyone for coming.", "a lot"],
  ["a lowercase single word after a cue", "Welcome back to another session.", "back"],
  ["a whole clause after a cue (token cap)", "My name is going to be announced later in the session.", "going to be announced later"],
] as [string, string, string][]) {
  test(`shape guard alone rejects ${label}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.deepEqual(resolved, [], `${JSON.stringify(name)} has a cue but is not a name`);
  });
}

/**
 * The 4-token cap is the LAST guard standing against title-cased prose -- a read-aloud slide title,
 * which a webinar transcript really does contain. Every token is capitalised, so `looksLikeAName`'s
 * per-token rule passes and only the length cap can reject it. Without this case the cap survives
 * mutation, i.e. it is unpinned.
 */
test("token cap alone rejects a title-cased phrase after a cue", async () => {
  const { resolved } = await extractSpeakers(
    [turn("t1", "spk:0", "This is Our Journey So Far Together, as you can see on the slide.")],
    replies([{ speakerRef: "spk:0", displayName: "Our Journey So Far Together", turnIds: ["t1"] }]),
  );
  assert.deepEqual(resolved, [], "a slide title is not a person");
});

/**
 * Fix cycle 3. The cycle-2 verdict FAILED with ISS-093 (critical) and ISS-094 (high): the cue rule
 * was in the wrong slot. It evidences that the TURN names someone; it says nothing about whether
 * the CANDIDATE is a name -- so 20 of 20 fabricated people shipped ("Welcome Everyone" ->
 * person:everyone, "Hi Guys" -> person:guys, "Welcome To the conference" -> person:to). Worse, it
 * simultaneously REFUSED the greeting / handover / address class the contract exists to admit.
 *
 * These two blocks are the standing regression corpus: every fabrication must be refused, and
 * every genuine naming form must survive. They are asserted together on purpose -- tightening one
 * at the cost of the other is exactly how cycle 2 failed.
 */
for (const [text, name] of [
  ["Welcome Everyone to the session.", "Everyone"],
  ["Thanks All for being here.", "All"],
  ["Hi Guys, let us begin.", "Guys"],
  ["Welcome To the annual conference.", "To"],
  ["Thank you Monday was busy.", "Monday"],
  ["Welcome Diwali celebrations everyone.", "Diwali"],
  ["This is India calling.", "India"],
  ["Hello Everyone and welcome.", "Everyone"],
  ["Welcome Back to another session.", "Back"],
  ["Thanks Folks for joining.", "Folks"],
  ["Hi Team, quick update.", "Team"],
  ["This is Great news for all.", "Great"],
] as [string, string][]) {
  test(`ISS-093: refuses ${JSON.stringify(name)} as a fabricated person`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.deepEqual(resolved, [], `${JSON.stringify(name)} is not a human being`);
  });
}

for (const [text, name] of [
  ["My name is Jubin Thakkar.", "Jubin Thakkar"],
  ["This side Nilesh Gotecha from CEPT.", "Nilesh Gotecha"],
  ["Hello, D'Souza here.", "D'Souza"],
  ["My name is Ruby-Anne Smith.", "Ruby-Anne Smith"],
  ["This is Makrand Rajadhyaksha speaking.", "Makrand Rajadhyaksha"],
  ["Ruby speaking.", "Ruby"],
] as [string, string][]) {
  test(`ISS-094: still accepts ${JSON.stringify(name)} in a genuine naming form`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.equal(resolved.length, 1, `${JSON.stringify(name)} must still resolve in: ${text}`);
  });
}

test("ISS-093: a demonstrative alone does not name a SINGLE-token candidate", async () => {
  // "This is India calling." is the one attack a closed-class list cannot reach -- telling a
  // country from a person is a gazetteer problem. Demoting the bare demonstrative for one-token
  // candidates closes it without a gazetteer; two-token names keep the cue.
  const weak = await extractSpeakers([turn("t1", "spk:0", "This is Bangalore calling.")], replies([
    { speakerRef: "spk:0", displayName: "Bangalore", turnIds: ["t1"] },
  ]));
  assert.deepEqual(weak.resolved, []);

  const strong = await extractSpeakers([turn("t1", "spk:0", "This is Makrand Rajadhyaksha speaking.")], replies([
    { speakerRef: "spk:0", displayName: "Makrand Rajadhyaksha", turnIds: ["t1"] },
  ]));
  assert.equal(strong.resolved.length, 1, "a two-token name keeps the demonstrative cue");
});

/**
 * ISS-255 SUPERSEDES the two handover-form rows that stood in the ISS-094 corpus above ("Our next
 * presenter is Nilesh Gotecha.", "Over to Ruby"): the live U2.4 phase-3 eval measured that exact
 * shape shipping a WRONG identity (the moderator accepted as Ruby off his own handover turn,
 * evidence t205, while the real Ruby self-named at t206 as spk:2). Per ISS-255's fix_direction, a
 * handover cue binds the name to the label whose block FOLLOWS, never to the speaking label — so
 * these now assert REFUSAL for a same-label proposal. The old accept-expectation was the belief
 * the live eval measured false; the ISS-255 ledger row carries the supersession note.
 */
for (const [text, name] of [
  ["Our next presenter is Nilesh Gotecha.", "Nilesh Gotecha"],
  ["Over to Ruby", "Ruby"],
] as [string, string][]) {
  test(`ISS-255 supersedes ISS-094: handover cue does NOT credit the speaking label — ${JSON.stringify(name)}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.deepEqual(resolved, [], "handover evidence binds the FOLLOWING speaker, not the speaking label (ISS-255)");
  });
}

/**
 * ISS-282 SUPERSEDES the two address rows that stood in the ISS-094 corpus above, exactly as ISS-255
 * superseded its handover rows: the phase-3 re-gate measured 0/8 accepted identities correct, every
 * one an address/greeting of a THIRD party credited to the label speaking it. An address names the
 * person ADDRESSED, so these now assert REFUSAL for the speaking label. The greeting-handover class
 * ISS-094 protected still ships -- for the label whose block FOLLOWS the turn (speakers-windows.test.ts).
 */
for (const [text, name] of [
  ["Good morning Prasanti, please go ahead.", "Prasanti"],
  ["Prasanti, what do you think about this?", "Prasanti"],
] as [string, string][]) {
  test(`ISS-282 supersedes ISS-094: an address does NOT credit the speaking label — ${JSON.stringify(text)}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.deepEqual(resolved, [], "addressing someone never identifies the speaker (ISS-282)");
  });
}

// The segment-aware window tests (buildSpeakerWindows, per-window degradation) and the ISS-255
// cross-run agreement tests (2-of-3 voting, evidence merge) live in the sibling
// speakers-windows.test.ts — split out under the 400-line test budget (ISS-262).
