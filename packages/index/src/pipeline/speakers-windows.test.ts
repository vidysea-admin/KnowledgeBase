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