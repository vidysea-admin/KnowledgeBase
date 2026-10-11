/**
 * packages/index/src/pipeline/transcript-windows.test.ts — deterministic windowing (T-040 slice).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { windowTranscript, DEFAULT_WINDOW_CHARS, DEFAULT_OVERLAP_TURNS, type WindowTurn, type TranscriptWindow } from "./transcript-windows.js";

function seeded(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function mk(n: number, len: number, prefix = "t"): WindowTurn[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, speakerRef: `spk:${i % 3}`, text: `${i} `.padEnd(len, "w") }));
}
function coverage(turns: WindowTurn[], ws: TranscriptWindow[]) {
  const seen = new Map<number, Array<[number, number]>>();
  for (const w of ws) for (const e of w.entries) seen.set(e.turnIndex, [...(seen.get(e.turnIndex) ?? []), [e.start, e.end]]);
  for (let i = 0; i < turns.length; i++) {
    const spans = [...new Set((seen.get(i) ?? []).map((s) => s.join("-")))].map((s) => s.split("-").map(Number) as [number, number]).sort((a, b) => a[0] - b[0]);
    assert.ok(spans.length > 0, `turn ${i} uncovered`);
    let pos = 0;
    for (const [a, b] of spans) { assert.equal(a, pos, `turn ${i} gap at ${pos}`); pos = b; }
    assert.equal(pos, turns[i]!.text.length, `turn ${i} tail`);
  }
}

test("defaults are 16000 chars and a 2-turn overlap (repair plan line 59)", () => {
  assert.equal(DEFAULT_WINDOW_CHARS, 16000);
  assert.equal(DEFAULT_OVERLAP_TURNS, 2);
});

test("empty and tiny inputs", () => {
  assert.deepEqual(windowTranscript([]), []);
  const one = windowTranscript(mk(1, 20));
  assert.equal(one.length, 1);
  assert.equal(one[0]!.overlap, 0);
  assert.deepEqual(one[0]!.turnIds, ["t0"]);
  assert.deepEqual(windowTranscript(null as never), []);
});

test("exactly 16000 characters fits in one window, 16001 does not", () => {
  const mkLen = (total: number) => { const t = [{ id: "a", text: "a".repeat(8000) }, { id: "b", text: "b".repeat(total - 8001) }]; return t; };
  const fits = windowTranscript(mkLen(16000));
  assert.equal(fits.length, 1);
  assert.equal(fits[0]!.charCount, 16000);
  const spills = windowTranscript(mkLen(16001));
  assert.equal(spills.length, 2);
  assert.ok(spills.every((w) => w.charCount <= 16000));
});

test("overlap is exactly 2 turns between consecutive windows and every turn is covered", () => {
  const turns = mk(300, 700);
  const ws = windowTranscript(turns);
  assert.ok(ws.length > 5);
  coverage(turns, ws);
  for (let i = 1; i < ws.length; i++) {
    assert.equal(ws[i]!.overlap, 2);
    const prev = ws[i - 1]!.entries.slice(-2).map((e) => e.turnId);
    assert.deepEqual(ws[i]!.entries.slice(0, 2).map((e) => e.turnId), prev);
    assert.ok(ws[i]!.entries.length > 2, "each window adds new turns");
  }
  assert.equal(ws[0]!.overlap, 0);
  ws.forEach((w, i) => { assert.equal(w.index, i); assert.ok(w.text.length <= 16000); assert.deepEqual(w.turnIds, w.entries.map((e) => e.turnId)); });
});

test("overlap option 1 and 0 are honoured; deterministic across calls", () => {
  const turns = mk(120, 900);
  for (const k of [0, 1, 3]) {
    const ws = windowTranscript(turns, { overlapTurns: k });
    coverage(turns, ws);
    for (let i = 1; i < ws.length; i++) assert.equal(ws[i]!.overlap, k);
  }
  assert.deepEqual(windowTranscript(turns), windowTranscript(structuredClone(turns)));
});

test("an oversized turn is sliced into exact contiguous pieces with the same id", () => {
  const long = "word ".repeat(10_000);
  const turns: WindowTurn[] = [{ id: "s0", speakerRef: "a", text: "short intro" }, { id: "big", speakerRef: "b", text: long }, { id: "s1", speakerRef: "a", text: "short outro" }];
  const ws = windowTranscript(turns);
  coverage(turns, ws);
  const parts = ws.flatMap((w) => w.entries).filter((e) => e.turnId === "big");
  const uniq = [...new Map(parts.map((p) => [p.partIndex, p])).values()];
  assert.ok(uniq.length >= 4 && uniq.every((p) => p.partCount === uniq.length));
  assert.equal(uniq.map((p) => long.slice(p.start, p.end)).join(""), long);
  for (const w of ws) assert.ok(w.text.length <= 16000);
  assert.ok(ws.some((w) => w.turnIds.includes("s1")));
});

test("oversized turn: no whitespace, surrogate pairs and combining marks are not cut apart", () => {
  const astral = "\u{1F600}".repeat(20_000);
  const dev = "प्रक्रिया".repeat(5_000);
  for (const text of [astral, dev, "z".repeat(40_000)]) {
    const ws = windowTranscript([{ id: "x", speakerRef: "q", text }]);
    const pieces = [...new Map(ws.flatMap((w) => w.entries).map((e) => [e.partIndex, e])).values()];
    assert.equal(pieces.map((p) => text.slice(p.start, p.end)).join(""), text);
    for (const p of pieces.slice(1)) assert.ok(!/[\udc00-\udfffा-्]/.test(text.charAt(p.start)), "no cut before low surrogate/matra");
    for (const w of ws) assert.ok(w.text.length <= 16000);
  }
});

test("a huge turn between big neighbours still advances (overlap shrinks, no infinite loop)", () => {
  const turns: WindowTurn[] = [
    { id: "a", text: "a".repeat(9000) }, { id: "b", text: "b".repeat(9000) }, { id: "c", text: "c".repeat(9000) }, { id: "d", text: "d".repeat(9000) },
  ];
  const ws = windowTranscript(turns);
  coverage(turns, ws);
  assert.equal(ws.length, 4);
  assert.ok(ws.every((w) => w.overlap === 0));
});

test("property (seeded): random turn sizes cover everything within the limit", () => {
  const r = seeded(99);
  for (let round = 0; round < 40; round++) {
    const turns: WindowTurn[] = Array.from({ length: 1 + Math.floor(r() * 80) }, (_, i) => ({
      id: `r${i}`, speakerRef: r() < 0.5 ? undefined : `spk:${i}`, text: "ab ".repeat(Math.floor(r() * r() * 9000)),
    }));
    const ws = windowTranscript(turns);
    coverage(turns, ws);
    ws.forEach((w, i) => { assert.ok(w.text.length <= 16000); assert.ok(i === 0 || w.overlap <= 2); });
    if (turns.length) assert.ok(ws[ws.length - 1]!.entries.some((e) => e.turnIndex === turns.length - 1), "last turn is in the last window");
  }
});

test("custom small limit and clamping of silly options", () => {
  const turns = mk(30, 60);
  const ws = windowTranscript(turns, { maxChars: 200 });
  coverage(turns, ws);
  assert.ok(ws.every((w) => w.text.length <= 200));
  const silly = windowTranscript(turns, { maxChars: Number.NaN, overlapTurns: -5 });
  coverage(turns, silly);
  assert.ok(silly.every((w) => w.text.length <= 16000 && w.overlap === 0));
});

// Named, fast window-limit boundaries (fix cycle 1). A regression in the limit comparison must fail an
// assertion here, never stall the suite: each test has a timeout and windowTranscript has a progress guard.
test("window limit off-by-one, both directions: a line of exactly maxChars fits, one more splits", { timeout: 5000 }, () => {
  const fit = windowTranscript([{ id: "a", text: "x".repeat(100) }], { maxChars: 100 });
  assert.equal(fit.length, 1);
  assert.equal(fit[0]!.charCount, 100);
  assert.equal(fit[0]!.entries.length, 1);
  const over = windowTranscript([{ id: "a", text: "x".repeat(101) }], { maxChars: 100 });
  assert.equal(over.length, 2);
  assert.deepEqual(over[0]!.entries.map((e) => [e.start, e.end]), [[0, 100]]);
  assert.deepEqual(over[1]!.entries.map((e) => [e.start, e.end]), [[100, 101]]);
  assert.ok(over.every((w) => w.charCount <= 100));
});

test("window limit off-by-one: two entries joined by one newline fit at exactly maxChars, not at +1", { timeout: 5000 }, () => {
  const pair = (b: number) => windowTranscript([{ id: "a", text: "a".repeat(49) }, { id: "b", text: "b".repeat(b) }], { maxChars: 100 });
  const exact = pair(50); // 49 + 1 + 50 = 100
  assert.equal(exact.length, 1);
  assert.equal(exact[0]!.charCount, 100);
  const spill = pair(51); // 101
  assert.equal(spill.length, 2);
  assert.ok(spill.every((w) => w.charCount <= 100));
  const under = pair(49); // 99
  assert.equal(under.length, 1);
});

test("an oversized turn is cut into slices of exactly maxChars (no whitespace), remainder last", { timeout: 5000 }, () => {
  const ws = windowTranscript([{ id: "a", text: "q".repeat(250) }], { maxChars: 100 });
  assert.deepEqual(ws.flatMap((w) => w.entries.map((e) => [e.start, e.end])), [[0, 100], [100, 200], [200, 250]]);
});
