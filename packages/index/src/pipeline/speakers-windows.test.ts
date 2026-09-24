/**
 * packages/index/src/pipeline/speakers-windows.test.ts — U2.4 phase 2+3, window + agreement tests.
 *
 * Split out of speakers-llm.test.ts (ISS-262: the parent file crossed the 400-line test budget in
 * 4c62df7 and left lint-loc red at HEAD). These are the segment-aware window tests (the
 * speaker-segment-identity gate, Option A) and the ISS-255 cross-run agreement tests — the
 * segment-scoped half of the LLM extractor's contract. Every test moved here verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { readFileSync } from "node:fs";

import { buildSpeakerWindows, extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const replies = (json: unknown): SpeakersCompleteFn => async () => completion("", json);

test("empty input never calls the provider", async () => {
  const boom: SpeakersCompleteFn = async () => { throw new Error("must not be called"); };
  const r = await extractSpeakers([], boom);
  assert.deepEqual(r, { resolved: [], unresolved: [], degraded: null });
});

/**
 * Segment-aware window tests (speaker-segment-identity gate, Option A, phase 2).
 */
test("buildSpeakerWindows: one <=8-turn window per contiguous block, with before-context", () => {
  const turns = [
    turn("t1", "Anchor", "Welcome."),
    turn("t2", "spk:0", "Hi everyone."),
    turn("t3", "spk:0", "My name is Ruby."),
    turn("t4", "spk:0", "Let me share."),
    turn("t5", "Bhakti", "Thanks Ruby."),
    turn("t6", "spk:1", "Hello."),
  ];
  const windows = buildSpeakerWindows(turns);
  // blocks: spk:0 (idx 1-3), spk:1 (idx 5) — 2 windows
  assert.equal(windows.length, 2);
  const w0 = windows[0];
  assert.ok(w0);
  assert.equal(w0.label, "spk:0");
  assert.equal(w0.startTurnIndex, 1);
  assert.equal(w0.endTurnIndex, 3);
  assert.ok(w0.turns.length <= 8, "window never exceeds MAX_WINDOW");
  assert.ok(w0.turns.some((t) => t._id === "t1"), "before-context includes the named turn that hands over");
  const w1 = windows[1];
  assert.ok(w1);
  assert.equal(w1.label, "spk:1");
  assert.deepEqual(w1.turns.map((t) => t._id), ["t5", "t6"], "context takes the named turn before the block; t4 (spk:0) is excluded by the prev-block clamp");
});

test("a label with TWO blocks gets TWO windows, never one merged identity prompt", () => {
  const turns = [
    turn("t1", "spk:0", "My name is Kanchan."),
    turn("t2", "Shagun", "Welcome."),
    turn("t3", "spk:0", "Let us begin."),
  ];
  const windows = buildSpeakerWindows(turns);
  assert.equal(windows.length, 2, "the gate's measured failure shape: 2 blocks, not 1 label");
  assert.deepEqual(windows.map((w) => w.startTurnIndex), [0, 2]);
});

test("a window's provider failure degrades THAT extraction; total failure degrades to floor", async () => {
  const turns = [turn("t1", "spk:0", "My name is Ruby.")];
  // all windows fail -> deterministic floor with degraded reason
  const allFail: SpeakersCompleteFn = async () => { throw new Error("down"); };
  const r1 = await extractSpeakers(turns, allFail);
  assert.ok(r1.degraded);
  assert.match(r1.degraded.reason, /failed on all/);
  assert.equal(r1.resolved.length, 1, "the deterministic floor still resolves the self-naming");
  // partial failure keeps successful windows and reports the failure
  let calls = 0;
  const partial: SpeakersCompleteFn = async () => {
    calls++;
    if (calls === 1) throw new Error("flaky");
    return { text: "[]", json: [], usage: { inputTokens: 0, outputTokens: 0 }, provider: "fake", model: "fake", costUsd: 0 };
  };
  const twoTurns = [
    turn("t1", "spk:0", "My name is Ruby."),
    turn("t2", "Bhakti", "Welcome."),
    turn("t3", "spk:1", "Hello."),
  ];
  const r2 = await extractSpeakers(twoTurns, partial);
  assert.ok(r2.degraded, "a partial failure is reported, never swallowed");
  assert.match(r2.degraded.reason, /1 of 2 speaker window\(s\) failed/);
  assert.equal(r2.degraded.reason.includes("flaky"), true);
});

test("ISS-255 (2): an identity proposed in fewer than 2 of 3 runs never ships", async () => {
  const turns = [
    turn("t1", "spk:0", "My name is Ruby."),
    turn("t2", "Bhakti", "Welcome Ruby."),
    turn("t3", "spk:1", "Hi, Nilesh here."),
  ];
  // Run 1 proposes spk:1 as Nilesh; runs 2-3 propose nothing for spk:1 — 1/3 votes, refused.
  let call = 0;
  const flaky: SpeakersCompleteFn = async () => {
    call++;
    if (call === 1) {
      return completion("", [
        { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
        { speakerRef: "spk:1", displayName: "Nilesh", turnIds: ["t3"] },
      ]);
    }
    return completion("", [{ speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] }]);
  };
  const { resolved } = await extractSpeakers(turns, flaky);
  const nilesh = resolved.find((r) => r.displayName === "Nilesh");
  assert.equal(nilesh, undefined, "1-of-3 agreement is unstable output, never a citable identity");
  assert.equal(resolved.length, 1, "the 3-of-3-agreed identity still ships");
  assert.equal(resolved[0]?.displayName, "Ruby");
});

test("ISS-255 (2): evidence merges across runs without duplication", async () => {
  const turns = [turn("t1", "spk:0", "My name is Ruby.")];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
  ]));
  assert.equal(resolved.length, 1);
  assert.deepEqual(resolved[0]?.evidence, [{ turnId: "t1", sessionId: "s1" }], "3 runs proposing the same turns yield ONE evidence row");
});
/**
 * ISS-282 (critical) — the U2.4 phase-3 re-gate measured 0/8 accepted identities correct. Every
 * wrong one was a turn that NAMES A THIRD PARTY ("Thank you, Sonal", "Let me first introduce
 * Shithij", "Hi, Jubin") credited to the label speaking it — or to a label that never spoke it —
 * and every one was scored label-wide because its `blocks` came back empty.
 *
 * D-015: these are the ledger's own recorded reproductions, replayed VERBATIM against the real
 * transcripts: same session, same label, same name, same cited turn, proposed in 3/3 runs (so the
 * agreement vote cannot be what refuses them). Source: measurement-summary.json wrongLinkList.
 */
const ISS_282: [string, string, string, string][] = [
  ["2026-05-23-uniaccess-atlas-skilltech", "spk:0", "Sonal", "t007"],
  ["2026-07-15-creative-futures", "spk:0", "Priyanka Roy", "t267"],
  ["2026-07-30-in-focus-3", "spk:1", "Shithij", "t022"],
  ["2026-07-30-in-focus-3", "spk:2", "Anisha", "t094"],
  ["2026-08-03-uk-beyond-offer-letters", "spk:4", "Bhavya", "t042"],
  ["2026-08-24-uniaccess-leeds-arts-university", "spk:1", "Jubin", "t088"],
  ["2026-08-24-uniaccess-leeds-arts-university", "spk:3", "Jubin", "t088"],
  ["2026-05-23-uniaccess-atlas-skilltech", "spk:0", "Sonal", "t007"], // outer run 2 repeat
];
const corpus = (session: string): Turns[] =>
  JSON.parse(readFileSync(new URL(`../../../../data/toc-migrated/${session}/turns.json`, import.meta.url), "utf8")) as Turns[];

for (const [i, [session, ref, name, t]] of ISS_282.entries()) {
  test(`ISS-282 #${i + 1}/${ISS_282.length}: ${session} ${ref} -> ${JSON.stringify(name)} via ${t} is refused`, async () => {
    const { resolved } = await extractSpeakers(corpus(session), replies([
      { speakerRef: ref, displayName: name, turnIds: [`${session}-${t}`] },
    ]));
    assert.deepEqual(resolved.map((r) => `${r.speakerRef}|${r.displayName}`), [], "a turn naming someone else never identifies its speaker");
  });
}

test("ISS-282: the label's OWN self-identifying turn binds, scoped to that ONE block (never label-wide)", async () => {
  const turns = [
    turn("t1", "spk:0", "Okay, let us begin."),
    turn("t2", "Anchor", "Next slide."),
    turn("t3", "spk:0", "Hello, Ruby here."), // an LLM-only cue: the deterministic floor cannot scope it
    turn("t4", "spk:0", "I lead admissions."),
  ];
  const { resolved } = await extractSpeakers(turns, replies([{ speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t3"] }]));
  assert.equal(resolved.length, 1);
  assert.deepEqual(resolved[0]?.blocks, [{ startTurnIndex: 2, endTurnIndex: 3 }], "the block holding the evidence, not spk:0's first block");
});

test("ISS-282: a handover by ANOTHER speaker binds the label whose block immediately FOLLOWS it", async () => {
  const turns = [
    turn("t1", "Anchor", "Good morning Prasanti, please go ahead."),
    turn("t2", "spk:1", "Thank you so much."),
    turn("t3", "spk:1", "Let me share my screen."),
  ];
  const { resolved } = await extractSpeakers(turns, replies([{ speakerRef: "spk:1", displayName: "Prasanti", turnIds: ["t1"] }]));
  assert.equal(resolved.length, 1, "handover-then-block is the greeting class this path exists to admit");
  assert.deepEqual(resolved[0]?.blocks, [{ startTurnIndex: 1, endTurnIndex: 2 }]);
  // Thanks look BACKWARD: "Thank you, Bhavya." before spk:4 names the previous speaker (ISS-282 #5 shape).
  const thanks = [turn("t1", "Jasminder", "Thank you, Bhavya. Thank you, Bhakti."), turn("t2", "spk:4", "Thank you all.")];
  const back = await extractSpeakers(thanks, replies([{ speakerRef: "spk:4", displayName: "Bhavya", turnIds: ["t1"] }]));
  assert.deepEqual(back.resolved, [], "a thank-you is not a handover");
});

test("ISS-282: one evidence turn never binds two labels", async () => {
  const turns = [turn("t1", "spk:1", "I'm Kshitij, and over to Ruby."), turn("t2", "spk:0", "Hello all.")];
  const alone = await extractSpeakers(turns, replies([{ speakerRef: "spk:1", displayName: "Kshitij", turnIds: ["t1"] }]));
  assert.equal(alone.resolved.length, 1, "on its own, t1 binds spk:1 by self-identification");
  const both = await extractSpeakers(turns, replies([
    { speakerRef: "spk:1", displayName: "Kshitij", turnIds: ["t1"] },
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
  ]));
  assert.deepEqual(both.resolved, [], "a turn claimed as evidence by two labels settles neither");
});

/**
 * Fix cycle 1b — the c1 live run accepted 0 identities in 2340 calls (precision null, 0 additions).
 * Offline replay of raw-proposals.c1.jsonl: the model cites the turns a person SPOKE, never the turn
 * that names them, so c1's "the cited turn must itself name the label" rule refused every true
 * adjacent naming. These are real corpus proposals, recorded verbatim from that run.
 */
const VISA = "2026-04-21-visa-blueprint-part2-italy-france-nz";
const LEEDS = "2026-08-24-uniaccess-leeds-arts-university";

test("c1b: a REAL true positive c1 refused — spk:0 -> Rashi, located by its own block, named by its neighbours", async () => {
  // Recorded 3/3 internal runs in outer run 1: the model cites spk:0's block t142-t144, none of which says "Rashi".
  // t141 [spk:1] "Rashi, I'll pass it on back to you." hands over; t145 [Shagun] "Thank you so much, Rashi, for inviting me".
  const { resolved } = await extractSpeakers(corpus(VISA), replies([
    { speakerRef: "spk:0", displayName: "Rashi", turnIds: [`${VISA}-t142`, `${VISA}-t143`, `${VISA}-t144`] },
  ]));
  assert.deepEqual(resolved.map((r) => `${r.speakerRef}|${r.displayName}`), ["spk:0|Rashi"]);
  assert.deepEqual(resolved[0]?.evidence.map((e) => e.turnId), [`${VISA}-t141`, `${VISA}-t145`], "the NAMING turns ship, in transcript order");
  assert.deepEqual(resolved[0]?.blocks, [{ startTurnIndex: 141, endTurnIndex: 143 }], "that one block, gold Rashi");
});

test("c1b: the model's copied [id:...] prefix still locates the real turn", async () => {
  const { resolved } = await extractSpeakers(corpus(VISA), replies([
    { speakerRef: "spk:0", displayName: "Rashi", turnIds: [`id:${VISA}-t143`] },
  ]));
  assert.deepEqual(resolved.map((r) => r.displayName), ["Rashi"]);
});

test("c1b: 'I do see Ankit here' is the host spotting a panelist, not Ankit naming himself (recorded 6x, gold Jubin Thakkar)", async () => {
  const { resolved } = await extractSpeakers(corpus(LEEDS), replies([
    { speakerRef: "spk:0", displayName: "Ankit", turnIds: [`${LEEDS}-t054`] },
  ]));
  assert.deepEqual(resolved, []);
});

test("c1b: a block that talks ABOUT the name is not that person, whatever its neighbours say", async () => {
  // atlas: t005 [spk:0] "Sonal, do you have any questions?" / t006 [spk:1] "I think Sonal is not having any
  // questions" / t007 [spk:0] "Thank you, Sonal, ..." -- a call before and a thanks after, and spk:1 is not Sonal.
  const ATLAS = "2026-05-23-uniaccess-atlas-skilltech";
  const { resolved } = await extractSpeakers(corpus(ATLAS), replies([
    { speakerRef: "spk:1", displayName: "Sonal", turnIds: [`${ATLAS}-t006`] },
  ]));
  assert.deepEqual(resolved, []);
});

test("c1b: a mid-turn quoted call is not a handover; a turn thanking two people binds neither", async () => {
  // leeds t035 [spk:0] ... everybody ask me, "Jubin, what is a good portfolio?" ... -> t036 [spk:2] (gold Poonam)
  const quoted = await extractSpeakers(corpus(LEEDS), replies([{ speakerRef: "spk:2", displayName: "Jubin", turnIds: [`${LEEDS}-t036`] }]));
  assert.deepEqual(quoted.resolved, []);
  const turns = [turn("t1", "spk:3", "So that is the timeline."), turn("t2", "Host", "Perfect. Thank you, Kshitij. Thanks, Anisha, and now questions.")];
  const two = await extractSpeakers(turns, replies([{ speakerRef: "spk:3", displayName: "Kshitij", turnIds: ["t1"] }]));
  assert.deepEqual(two.resolved, [], "which of the two spoke last is not in the text");
  const one = [turn("t1", "spk:3", "So that is the timeline."), turn("t2", "Host", "Thank you, Kshitij, for that.")];
  const ok = await extractSpeakers(one, replies([{ speakerRef: "spk:3", displayName: "Kshitij", turnIds: ["t1"] }]));
  assert.deepEqual(ok.resolved.map((r) => r.displayName), ["Kshitij"], "a single opening thank-you names who just spoke");
});
