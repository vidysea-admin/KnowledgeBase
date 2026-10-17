/**
 * packages/core/src/domain/speaker-tile-alignment.lag.test.ts — T-042 slice 1, fix cycle 1. Regressions
 * for ISS-T042TILE-001 (indicator lag swaps names) and -002 (same-instant conflicts), the lag-stability
 * rule, the misalignment rule and the normalisation keys. No I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { alignTileNamesToTurns, type LabelResult, type TileAlignResult } from "./speaker-tile-alignment.js";

const NAMES = ["Priya Nair", "Rahul Bhosale", "Anita Desai", "Dev Patel"];
const nameOf = (l: LabelResult) => (l.decision.status === "named" ? l.decision.claim.displayName : null);
const reasonOf = (l: LabelResult) => (l.decision.status === "refused" ? l.decision.reason : null);
const by = (r: TileAlignResult, ref: string) => r.labels.find((l) => l.speakerRef === ref)!;

/** Strict round robin over `n` speakers, `turn`-second turns, 1 Hz indicator lagging speech by `lag`. */
function robin(n: number, turn: number, lag: number, dur: number, first = 0, offset = 0) {
  const turns: { id: string; tStart: number; tEnd: number; speakerRef: string }[] = [];
  const log: { tSec: number; displayName: string | null }[] = [];
  for (let a = 0, i = 0; a < dur; a += turn, i++) turns.push({ id: `t${i}`, tStart: a, tEnd: a + turn, speakerRef: `spk:${(first + i) % n}` });
  for (let t = 0; t < dur + lag; t++) {
    const x = t - lag, k = Math.floor(x / turn);
    log.push({ tSec: t + offset, displayName: x < 0 ? null : NAMES[(first + k) % n]! });
  }
  return { log, turns };
}
function grid(n: number, turn: number, lag: number): { wrong: number; total: number; named: number; reasons: string[] } {
  let wrong = 0, total = 0, named = 0;
  const reasons = new Set<string>();
  for (let m = 0; m < 5; m++) {
    const { log, turns } = robin(n, turn, lag, 120 + 17 * m, m % n);
    for (const l of alignTileNamesToTurns(log, turns).labels) {
      total++;
      const nm = nameOf(l);
      if (nm === null) reasons.add(reasonOf(l)!); else { named++; if (nm !== NAMES[Number(l.speakerRef.slice(4))]) wrong++; }
    }
  }
  return { wrong, total, named, reasons: [...reasons].sort() };
}

test("ISS-T042TILE-001 recorded reproductions: 2 speakers, turn/lag 4/3, 3/3, 5/5, 6/5, 10/10 and 4 speakers 6 s / 5 s lag: no wrong name", () => {
  const cases: [number, number, number][] = [[2, 4, 3], [2, 3, 3], [2, 5, 5], [2, 6, 5], [2, 10, 10], [4, 6, 5]];
  for (const [n, turn, lag] of cases) {
    const g = grid(n, turn, lag);
    console.log(`ISS-T042TILE-001 ${n} speakers turn ${turn} lag ${lag}: wrong ${g.wrong}/${g.total}, named ${g.named}, refusals ${g.reasons.join(",")}`);
    assert.equal(g.wrong, 0, `${n}/${turn}/${lag}`);
    assert.equal(g.named, 0, "alternating short turns: every label is refused");
    assert.ok(g.reasons.every((r) => r === "lag-unstable" || r === "timeline-misaligned"), g.reasons.join());
  }
  assert.deepEqual([...grid(2, 4, 3).reasons], ["lag-unstable"], "the recorded 4 s / 3 s case is refused for lag instability, not silently");
});

test("ISS-T042TILE-001 class: a seeded sweep (lag 0-5 s, mean turn 3-28 s, 2-4 speakers, 400 meetings): zero wrong names", () => {
  let s = 12345;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let wrong = 0, named = 0, total = 0;
  for (let m = 0; m < 400; m++) {
    const n = 2 + Math.floor(r() * 3), mean = 3 + r() * 25, lag = r() * 5;
    const turns: { id: string; tStart: number; tEnd: number; speakerRef: string }[] = [];
    let t = 0, prev = -1;
    while (t < 600) { let k = Math.floor(r() * n); if (k === prev) k = (k + 1) % n; const len = Math.max(1, mean * (0.5 + r())); turns.push({ id: `t${turns.length}`, tStart: t, tEnd: t + len, speakerRef: `spk:${k}` }); t += len; prev = k; }
    const log: { tSec: number; displayName: string | null }[] = [];
    for (let x = 0; x < t + 6; x++) { const sp = turns.find((u) => u.tStart <= x - lag && x - lag < u.tEnd); log.push({ tSec: x, displayName: sp ? NAMES[Number(sp.speakerRef.slice(4))]! : null }); }
    for (const l of alignTileNamesToTurns(log, turns).labels) { total++; const nm = nameOf(l); if (nm !== null) { named++; if (nm !== NAMES[Number(l.speakerRef.slice(4))]) wrong++; } }
  }
  console.log(`ISS-T042TILE-001 sweep: wrong ${wrong}/${named} named of ${total} labels`);
  assert.equal(wrong, 0);
});

test("long turns still resolve under lag 0-5 s, and the evidence carries the worst case over the stable shifts", () => {
  for (const lag of [0, 1, 3, 5]) {
    const { log, turns } = robin(4, 60, lag, 480);
    const r = alignTileNamesToTurns(log, turns);
    assert.deepEqual(r.labels.map(nameOf), NAMES, `lag ${lag}`);
    assert.equal(r.meeting.status, "ok");
    const d = r.labels[0]!.decision;
    assert.ok(d.status === "named");
    if (d.status !== "named") return;
    assert.equal(d.evidence.lagStability.shifts, 13);
    assert.equal(d.evidence.lagStability.stepSec, 0.5);
    assert.ok(d.evidence.lagStability.worstWinnerFraction >= 0.6 && d.evidence.lagStability.worstWinnerFraction <= 1);
    assert.ok(d.evidence.lagStability.worstRunnerUpFraction <= 0.2 + 1e-9);
    assert.ok(d.evidence.lagStability.minAgreeSec >= 10);
    if (lag === 0) assert.ok(d.evidence.lagStability.worstWinnerFraction < 1 && d.evidence.lagStability.worstRunnerUpFraction > 0, "the shifted worst case is reported, not the lag-0 best case");
  }
});

test("thresholds apply at the WORST shift: a label that is fine at lag 0 but loses its majority at lag 6 is refused", () => {
  const { log, turns } = robin(2, 24, 0, 480);
  const bad = alignTileNamesToTurns(log, turns, { maxLagSec: 12 });
  assert.deepEqual(bad.labels.map(reasonOf), ["lag-unstable", "lag-unstable"], "at 12 s shift a 24 s turn is half wrong");
  assert.deepEqual(alignTileNamesToTurns(log, turns, { maxLagSec: 4 }).labels.map(nameOf), [NAMES[0], NAMES[1]]);
});

test("cross-label refusal is evaluated under every shift: X wins A at all shifts and B only at lag 6, so A is refused too", () => {
  const log = Array.from({ length: 130 }, (_, t) => ({ tSec: t, displayName: t >= 100 && t < 106 ? null : "Xavier Ng" }));
  const turns = [{ id: "a", tStart: 0, tEnd: 100, speakerRef: "spk:A" }, { id: "b", tStart: 100, tEnd: 112, speakerRef: "spk:B" }];
  assert.equal(nameOf(alignTileNamesToTurns(log, turns.slice(0, 1)).labels[0]!), "Xavier Ng", "A alone is named");
  const both = alignTileNamesToTurns(log, turns);
  assert.equal(reasonOf(by(both, "spk:B")), "lag-unstable");
  assert.equal(reasonOf(by(both, "spk:A")), "name-on-multiple-labels", "B would be named Xavier at lag 6; A must not keep it");
  assert.equal(nameOf(by(alignTileNamesToTurns(log, turns, { maxLagSec: 2 }), "spk:A")), "Xavier Ng", "with the range cut to 2 s B never wins it: the veto came from the shifted scan");
});

test("ISS-T042TILE-002 recorded reproduction: Anna and Zed at every second: no name; a name and a release at one instant: no name", () => {
  const log: { tSec: number; displayName: string | null }[] = [];
  for (let t = 0; t < 60; t++) log.push({ tSec: t, displayName: "Anna" }, { tSec: t, displayName: "Zed" });
  const r = alignTileNamesToTurns(log, [{ id: "a", tStart: 0, tEnd: 60, speakerRef: "spk:0" }]);
  console.log(`ISS-T042TILE-002 Anna/Zed: named ${r.labels.filter((l) => l.decision.status === "named").length}/${r.labels.length}, reason ${reasonOf(r.labels[0]!)}, observed ${r.labels[0]!.observedSec}, conflicts ${r.meeting.conflictInstants}`);
  assert.equal(nameOf(r.labels[0]!), null);
  assert.equal(r.labels[0]!.observedSec, 0);
  assert.equal(reasonOf(r.labels[0]!), "no-observations");
  assert.equal(r.meeting.conflictInstants, 60);
  const nul: typeof log = [];
  for (let t = 0; t < 60; t++) nul.push({ tSec: t, displayName: "Anna" }, { tSec: t, displayName: null });
  assert.equal(nameOf(alignTileNamesToTurns(nul, [{ id: "a", tStart: 0, tEnd: 60, speakerRef: "spk:0" }]).labels[0]!), null);
});

test("simultaneous observations: equal ones are one; a conflict cuts coverage for BOTH names and never depends on order", () => {
  const turns = [{ id: "a", tStart: 0, tEnd: 100, speakerRef: "spk:0" }];
  const one: { tSec: number; displayName: string | null }[] = Array.from({ length: 100 }, (_, t) => ({ tSec: t, displayName: "Anna" }));
  const dup = one.flatMap((o) => [o, { ...o }, { ...o, displayName: " Anna " }]);
  assert.equal(nameOf(alignTileNamesToTurns(dup, turns).labels[0]!), "Anna", "the same name repeated at one instant is one observation");
  assert.equal(alignTileNamesToTurns(dup, turns).meeting.conflictInstants, 0);
  const mixed = one.flatMap((o) => (o.tSec % 2 === 0 ? [o, { ...o, displayName: "Zed" }] : [o]));
  const a = alignTileNamesToTurns(mixed, turns), b = alignTileNamesToTurns(mixed.slice().reverse(), turns);
  assert.equal(a.meeting.conflictInstants, 50);
  assert.equal(JSON.stringify(a.labels), JSON.stringify(b.labels), "order-free");
  assert.ok(a.labels[0]!.observedSec <= 50 + 1e-9, "conflict seconds are in neither name's total and not in observed");
  assert.ok(!a.labels[0]!.candidates.some((c) => c.name === "Zed"), "Zed never gets a second from a conflict");
  assert.equal(a.labels[0]!.candidates.find((c) => c.name === "Anna")!.sec <= 50 + 1e-9, true);
});

test("misalignment: negative lag (highlight BEFORE speech) and a large positive offset give NO names, with diagnostics", () => {
  const bad = (offset: number) => { const { log, turns } = robin(4, 20, 2, 480, 0, offset); return alignTileNamesToTurns(log, turns); };
  const ok = bad(0);
  assert.equal(ok.meeting.status, "ok");
  assert.deepEqual(ok.labels.map(nameOf), NAMES);
  for (const offset of [-10, -3, 10, 30]) {
    const r = bad(offset);
    const named = r.labels.filter((l) => l.decision.status === "named");
    console.log(`misalign offset ${offset}: status ${r.meeting.status}, named ${named.length}, wrong ${named.filter((l) => nameOf(l) !== NAMES[Number(l.speakerRef.slice(4))]).length}, best out-of-range lag ${r.meeting.diagnostics?.outOfRangeBestLagSec}, gain ${r.meeting.diagnostics?.gainSec}`);
    assert.equal(r.meeting.status, "timeline-misaligned", `offset ${offset}`);
    assert.ok(r.labels.every((l) => reasonOf(l) === "timeline-misaligned"));
    assert.ok(r.meeting.diagnostics && r.meeting.diagnostics.gainSec > r.meeting.diagnostics.marginSec);
  }
  assert.ok(bad(-3).meeting.diagnostics!.outOfRangeBestLagSec < 0, "a negative best lag is reported");
});

test("exclusion and refusal keys: NFKC + case-fold (fullwidth bot name, fullwidth Admin, case twins on two labels)", () => {
  const solo = (shown: string, opts = {}) => alignTileNamesToTurns(Array.from({ length: 60 }, (_, t) => ({ tSec: t, displayName: shown })), [{ id: "a", tStart: 0, tEnd: 60, speakerRef: "spk:0" }], opts).labels[0]!;
  assert.equal(reasonOf(solo("\u{ff2b}\u{ff22} Scribe", { botDisplayName: "kb scribe" })), "bot-own-name", "fullwidth KB Scribe is the bot");
  assert.equal(reasonOf(solo("KB \u{17f}cribe", { botDisplayName: "kb scribe" })), "bot-own-name", "long s folds to s");
  assert.equal(reasonOf(solo("\u{ff21}\u{ff44}\u{ff4d}\u{ff49}\u{ff4e}")), "non-person-name", "fullwidth Admin");
  assert.equal(nameOf(solo("Priya")), "Priya");
  const turns = [{ id: "a", tStart: 0, tEnd: 100, speakerRef: "spk:0" }, { id: "b", tStart: 100, tEnd: 200, speakerRef: "spk:1" }];
  const log = (second: string) => Array.from({ length: 200 }, (_, t) => ({ tSec: t, displayName: t < 100 ? "Priya" : second }));
  for (const twin of ["priya", "PRIYA", "\u{ff30}riya"]) {
    const r = alignTileNamesToTurns(log(twin), turns);
    assert.deepEqual(r.labels.map(reasonOf), ["name-on-multiple-labels", "name-on-multiple-labels"], twin);
  }
  assert.deepEqual(alignTileNamesToTurns(log("Rahul"), turns).labels.map(nameOf), ["Priya", "Rahul"]);
  const kept = alignTileNamesToTurns(Array.from({ length: 100 }, (_, t) => ({ tSec: t, displayName: "PrIyA" })), turns.slice(0, 1));
  assert.equal(nameOf(kept.labels[0]!), "PrIyA", "the returned claim keeps the displayed string");
});

test("DOCUMENTED LIMIT: a structure-preserving offset outside the scanned range is undetectable (2 strict speakers, offset = -turn length)", () => {
  const { log, turns } = robin(2, 30, 2, 600, 0, -30);
  const r = alignTileNamesToTurns(log, turns);
  assert.equal(r.meeting.status, "ok", "the scan covers -10..+36 s only and the pattern is self-similar at a whole turn");
  assert.deepEqual(r.labels.map(nameOf), [NAMES[1], NAMES[0]], "names are swapped: this is why a shared or measured clock is a WIRING precondition");
});

test("misalignment margin: a true lag just past maxLagSec on long turns gains less than 2% and does not refuse a still-correct meeting", () => {
  const { log, turns } = robin(4, 60, 6.5, 480);
  const r = alignTileNamesToTurns(log, turns);
  assert.ok(r.meeting.diagnostics!.gainSec > 0 && r.meeting.diagnostics!.gainSec <= r.meeting.diagnostics!.marginSec, JSON.stringify(r.meeting.diagnostics));
  assert.equal(r.meeting.status, "ok");
  assert.deepEqual(r.labels.map(nameOf), NAMES);
});
