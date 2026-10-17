/**
 * packages/core/src/domain/slide-turn-alignment.test.ts — T-041 slice 1. Hand-built timelines and
 * hostile inputs for `alignSlidesToTurns`. No I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { alignSlidesToTurns, normalizeSlideText } from "./slide-turn-alignment.js";

const S = (id: string, tSec: number, text: string) => ({ id, tSec, text });
const T = (id: string, tStart: number, tEnd: number) => ({ id, tStart, tEnd, speakerRef: "spk:0" });
const ids = (r: ReturnType<typeof alignSlidesToTurns>, turn: string) =>
  r.turns.find((t) => t.turnId === turn)!.attachments.map((a) => a.slideId);

test("slide change mid-turn: both slides, with overlap durations, primary = longest", () => {
  const r = alignSlidesToTurns([S("s1", 0, "A"), S("s2", 10, "B")], [T("t1", 4, 16)]);
  const t = r.turns[0]!;
  assert.deepEqual(t.attachments.map((a) => [a.slideId, a.from, a.to, a.overlapSec]), [["s1", 4, 10, 6], ["s2", 10, 16, 6]]);
  assert.equal(t.primarySlideId, "s1", "tie goes to the earliest");
  const r2 = alignSlidesToTurns([S("s1", 0, "A"), S("s2", 10, "B")], [T("t1", 8, 20)]);
  assert.equal(r2.turns[0]!.primarySlideId, "s2", "longest overlap wins over first");
});

test("many turns under one slide; slide coverage lists them in order", () => {
  const r = alignSlidesToTurns([S("s1", 0, "A")], [T("t3", 20, 30), T("t1", 0, 10), T("t2", 10, 20)]);
  assert.deepEqual(r.slides[0]!.attachments.map((a) => a.turnId), ["t1", "t2", "t3"]);
  assert.deepEqual(r.turns.map((t) => t.primarySlideId), ["s1", "s1", "s1"]);
  assert.equal(r.slides[0]!.to, null, "last slide is open-ended without a session end");
});

test("repeated identical observations merge into one slide (no double attach)", () => {
  const r = alignSlidesToTurns([S("o1", 0, "Hello  World"), S("o2", 5, "Hello World "), S("o3", 9, "Hello\nWorld")], [T("t1", 0, 12)]);
  assert.equal(r.slides.length, 1);
  assert.deepEqual(r.slides[0]!.observationIds, ["o1", "o2", "o3"]);
  assert.equal(r.turns[0]!.attachments.length, 1);
  assert.equal(r.turns[0]!.attachments[0]!.overlapSec, 12);
});

test("A,B,A is three segments; non-identical text never merges (no fuzzy matching)", () => {
  const r = alignSlidesToTurns([S("a1", 0, "Intro"), S("b", 5, "Agenda"), S("a2", 10, "Intro"), S("c", 12, "Intro.")], [T("t", 0, 20)]);
  assert.deepEqual(r.turns[0]!.attachments.map((a) => a.slideId), ["a1", "b", "a2", "c"]);
});

test("NFC normalisation: composed and decomposed forms are the same slide", () => {
  assert.equal(normalizeSlideText("Café"), normalizeSlideText("Café"));
  const r = alignSlidesToTurns([S("o1", 0, "Café"), S("o2", 3, "Café")], [T("t", 0, 5)]);
  assert.equal(r.slides.length, 1);
});

test("gap before the first slide: turn gets none; partial overlap is clipped", () => {
  const r = alignSlidesToTurns([S("s1", 10, "A")], [T("early", 0, 5), T("straddle", 5, 15)]);
  assert.deepEqual(ids(r, "early"), []);
  assert.equal(r.turns[0]!.primarySlideId, null);
  assert.deepEqual(r.turns[1]!.attachments.map((a) => [a.from, a.to]), [[10, 15]]);
});

test("blank frame ends the previous slide: turns in the gap get no slide", () => {
  const r = alignSlidesToTurns([S("s1", 0, "A"), S("blank", 10, "  \n "), S("s2", 20, "B")], [T("t", 12, 18), T("u", 8, 22)]);
  assert.deepEqual(ids(r, "t"), []);
  assert.deepEqual(ids(r, "u"), ["s1", "s2"]);
  assert.equal(r.slides.length, 2);
  assert.equal(r.slides[0]!.to, 10);
});

test("slide after the last turn attaches to nothing but is still listed", () => {
  const r = alignSlidesToTurns([S("s1", 0, "A"), S("late", 100, "Z")], [T("t", 0, 10)]);
  assert.deepEqual(r.slides.find((s) => s.slideId === "late")!.attachments, []);
});

test("last slide extends to the session end; a turn past the end gets nothing from it", () => {
  const open = alignSlidesToTurns([S("s1", 0, "A")], [T("t", 50, 60)]);
  assert.deepEqual(ids(open, "t"), ["s1"]);
  const bounded = alignSlidesToTurns([S("s1", 0, "A")], [T("t", 50, 60), T("u", 40, 55)], { sessionEndSec: 52 });
  assert.deepEqual(ids(bounded, "t"), ["s1"]);
  assert.equal(bounded.turns.find((x) => x.turnId === "t")!.attachments[0]!.to, 52);
  assert.equal(bounded.slides[0]!.to, 52);
  const past = alignSlidesToTurns([S("s1", 0, "A")], [T("t", 60, 70)], { sessionEndSec: 52 });
  assert.deepEqual(ids(past, "t"), []);
});

test("slide boundary is half-open: a turn starting exactly when the next slide appears gets only the next", () => {
  const r = alignSlidesToTurns([S("s1", 0, "A"), S("s2", 10, "B")], [T("t", 10, 12), T("u", 8, 10)]);
  assert.deepEqual(ids(r, "t"), ["s2"]);
  assert.deepEqual(ids(r, "u"), ["s1"]);
});

test("zero-length turn: gets the covering slide with overlap 0, none at a slide end", () => {
  const r = alignSlidesToTurns([S("s1", 0, "A"), S("s2", 10, "B")], [T("p", 10, 10), T("q", 5, 5), T("g", 0, 0)]);
  assert.deepEqual(ids(r, "p"), ["s2"]);
  assert.deepEqual(ids(r, "q"), ["s1"]);
  assert.equal(r.turns.find((t) => t.turnId === "q")!.attachments[0]!.overlapSec, 0);
  assert.deepEqual(ids(r, "g"), ["s1"]);
});

test("identical capture times: later id wins, earlier gets an empty span", () => {
  const r = alignSlidesToTurns([S("b", 5, "B"), S("a", 5, "A")], [T("t", 0, 10)]);
  assert.deepEqual(ids(r, "t"), ["b"]);
  const dead = r.slides.find((s) => s.slideId === "a")!;
  assert.equal(dead.from, dead.to);
  assert.deepEqual(dead.attachments, []);
});

test("unsorted inputs give the same result as sorted", () => {
  const slides = [S("s3", 20, "C"), S("s1", 0, "A"), S("s2", 10, "B"), S("s2b", 12, "B")];
  const turns = [T("t3", 18, 25), T("t1", 0, 4), T("t2", 9, 14)];
  assert.deepEqual(alignSlidesToTurns(slides, turns), alignSlidesToTurns([...slides].reverse(), [...turns].reverse()));
});

test("output never carries slide text or alters turns", () => {
  const secret = "PASSCODE 482913";
  const turn = T("t", 0, 5);
  const r = alignSlidesToTurns([S("s", 0, secret)], [turn]);
  assert.ok(!JSON.stringify(r).includes("482913"));
  assert.deepEqual(turn, { id: "t", tStart: 0, tEnd: 5, speakerRef: "spk:0" });
});

test("hostile inputs yield typed errors, never throws", () => {
  const bad = alignSlidesToTurns(
    [S("n", -1, "x"), S("nan", NaN, "x"), S("inf", Infinity, "x"), { id: "", tSec: 1, text: "x" }, { id: "nt", tSec: 1, text: 5 },
      { id: "bc", tSec: 1, text: "x", confidence: 7 }, null, S("ok", 0, "fine")],
    [T("neg", -3, 2), T("rev", 5, 4), T("nan", NaN, 1), { id: "str", tStart: "1", tEnd: 2 }, T("good", 0, 1)],
  );
  const codes = bad.errors.map((e) => `${e.kind}:${e.code}`).sort();
  assert.deepEqual(codes, [
    "slide:invalid-confidence", "slide:invalid-id", "slide:invalid-input", "slide:invalid-text", "slide:invalid-time",
    "slide:invalid-time", "slide:negative-time",
    "turn:end-before-start", "turn:invalid-time", "turn:invalid-time", "turn:negative-time",
  ].sort());
  assert.deepEqual(bad.turns.map((t) => t.turnId), ["good"]);
  assert.deepEqual(ids(bad, "good"), ["ok"]);
  for (const junk of [undefined, null, 5, "x", {}, [[]]]) {
    assert.doesNotThrow(() => alignSlidesToTurns(junk, junk, junk as never));
  }
  assert.equal(alignSlidesToTurns("x", [], undefined).errors[0]!.code, "invalid-input");
  assert.equal(alignSlidesToTurns([], [], { sessionEndSec: -1 }).errors[0]!.code, "invalid-session-end");
});

test("duplicate ids reject every holder, independent of input order", () => {
  const a = alignSlidesToTurns([S("d", 0, "A"), S("d", 5, "B"), S("k", 9, "C")], [T("t", 0, 10), T("t", 1, 2)]);
  assert.equal(a.errors.filter((e) => e.code === "duplicate-id").length, 4);
  assert.deepEqual(a.turns, []);
  assert.deepEqual(a.slides.map((s) => s.slideId), ["k"]);
});
