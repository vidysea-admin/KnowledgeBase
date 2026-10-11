/**
 * packages/core/src/domain/speaker-tile-alignment.test.ts — T-042 slice 1. Hand-built meetings and
 * hostile inputs for `alignTileNamesToTurns`. No I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { alignTileNamesToTurns, type LabelResult, type TileAlignOptions } from "./speaker-tile-alignment.js";

type Seg = [from: number, to: number, label: string, shown: string | null];
const T = (id: string, tStart: number, tEnd: number, speakerRef: string) => ({ id, tStart, tEnd, speakerRef });
/** 1 Hz indicator samples over the segments, shifted by `lag` seconds. */
const samples = (segs: Seg[], lag = 0, conf?: number) => {
  const out: { tSec: number; displayName: string | null; confidence?: number }[] = [];
  for (const [from, to, , shown] of segs) for (let t = from; t < to; t++) out.push({ tSec: t + lag, displayName: shown, ...(conf === undefined ? {} : { confidence: conf }) });
  return out;
};
const turnsOf = (segs: Seg[]) => segs.map(([a, b, l], i) => T(`t${i}`, a, b, l));
const run = (segs: Seg[], opts?: TileAlignOptions, lag = 0) => alignTileNamesToTurns(samples(segs, lag), turnsOf(segs), opts);
const by = (r: { labels: LabelResult[] }, ref: string) => r.labels.find((l) => l.speakerRef === ref)!;
const nameOf = (l: LabelResult) => (l.decision.status === "named" ? l.decision.claim.displayName : null);
const reasonOf = (l: LabelResult) => (l.decision.status === "refused" ? l.decision.reason : null);

const PANEL: Seg[] = [
  [0, 30, "spk:0", "Priya Nair"], [30, 60, "spk:1", "Rahul Bhosale"], [60, 90, "spk:2", "Anita Desai"], [90, 120, "spk:3", "Dev Patel"],
  [120, 150, "spk:0", "Priya Nair"], [150, 180, "spk:1", "Rahul Bhosale"], [180, 210, "spk:2", "Anita Desai"], [210, 240, "spk:3", "Dev Patel"],
];

test("4-panelist fixture: each label maps cleanly; the name is a display-name CLAIM, never a verified identity", () => {
  const r = run(PANEL);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.labels.map((l) => [l.speakerRef, nameOf(l)]), [["spk:0", "Priya Nair"], ["spk:1", "Rahul Bhosale"], ["spk:2", "Anita Desai"], ["spk:3", "Dev Patel"]]);
  const d = by(r, "spk:0").decision;
  assert.equal(d.status, "named");
  if (d.status !== "named") return;
  assert.deepEqual(d.claim, { kind: "display-name-claim", source: "platform-display-name", verified: false, displayName: "Priya Nair" });
  assert.equal(d.evidence.agreeSec, 60);
  assert.equal(d.evidence.disagreeSec, 0);
  assert.equal(d.evidence.observedSec, 60);
  assert.deepEqual(d.evidence.turnIds, ["t0", "t4"]);
  assert.deepEqual([d.evidence.from, d.evidence.to], [0, 150]);
  assert.equal(d.evidence.runnerUp, null);
  assert.ok(!("personId" in d.claim) && !("identity" in d.claim) && !("person" in d.claim), "no person entity is minted");
});

test("lag of 1 to 3 seconds still maps every label", () => {
  for (const lag of [1, 2, 3]) {
    const r = run(PANEL, undefined, lag);
    assert.deepEqual(r.labels.map(nameOf), ["Priya Nair", "Rahul Bhosale", "Anita Desai", "Dev Patel"], `lag ${lag}`);
  }
});

test("rename mid-meeting: dominant name accepted when the other is within maxRunnerUpFraction, refused above it", () => {
  const mk = (oldSec: number) => run([[0, oldSec, "spk:0", "Priya"], [oldSec, 100, "spk:0", "Priya S"]]);
  assert.equal(nameOf(by(mk(80), "spk:0")), "Priya", "20/100 is exactly the limit: accepted");
  assert.equal(reasonOf(by(mk(79), "spk:0")), "two-strong-names", "21/100 is over the limit");
  const small = run([[0, 30, "spk:0", "Priya"], [30, 38, "spk:0", "Rahul"]]);
  assert.equal(reasonOf(by(small, "spk:0")), "runner-up-too-strong", "8 s of another name is over 20% of 38 s but under minNameSeconds");
  assert.equal(nameOf(by(mk(95), "spk:0")), "Priya");
  const r70 = by(mk(70), "spk:0");
  assert.equal(reasonOf(r70), "two-strong-names");
  assert.deepEqual(r70.candidates.map((c) => c.name), ["Priya", "Priya S"], "both strings stay visible as candidates");
});

test("diarizer split: one display name wins two labels, BOTH refused", () => {
  const r = run([[0, 60, "spk:0", "Priya"], [60, 120, "spk:1", "Priya"], [120, 180, "spk:2", "Rahul"]]);
  assert.equal(reasonOf(by(r, "spk:0")), "name-on-multiple-labels");
  assert.equal(reasonOf(by(r, "spk:1")), "name-on-multiple-labels");
  assert.equal(nameOf(by(r, "spk:2")), "Rahul", "an unrelated label is unaffected");
});

test("diarizer merge: two names strongly overlapping one label is refused (no pick-the-first)", () => {
  const r = run([[0, 60, "spk:0", "Priya"], [60, 120, "spk:0", "Rahul"]]);
  assert.equal(reasonOf(by(r, "spk:0")), "two-strong-names");
  const r2 = run([[0, 55, "spk:0", "Priya"], [55, 100, "spk:0", "Rahul"]]);
  assert.equal(nameOf(by(r2, "spk:0")), null, "55/45 also refused");
});

test("the bot's own display name is never proposed (case-insensitive exclusion), and the option is what does it", () => {
  const segs: Seg[] = [[0, 60, "spk:0", "Acme Scribe"]];
  assert.equal(reasonOf(by(run(segs, { botDisplayName: "  acme  SCRIBE " }), "spk:0")), "bot-own-name");
  assert.equal(nameOf(by(run(segs), "spk:0")), "Acme Scribe", "without the option the string is an ordinary name");
});

test("device, room and role labels, phone numbers and unsafe strings are never proposed", () => {
  for (const shown of ["iPhone", "Priya's iPhone", "Conference Room", "Guest", "Host", "Presenter", "Zoom user", "Zoom User 3", "+91 98765 43210", "1234567", "Galaxy S24", "Unknown", "Priya\u{202e}fdp", "Pri\u0000ya", "  ", "x".repeat(101)]) {
    const l = by(run([[0, 60, "spk:0", shown]]), "spk:0");
    assert.equal(nameOf(l), null, JSON.stringify(shown));
  }
  assert.equal(reasonOf(by(run([[0, 60, "spk:0", "iPhone"]]), "spk:0")), "non-person-name");
  for (const ok of ["Meet Shah", "Roomi Khan", "Rahul Bhosale", "Zoe Lee", "Ana-Mar\u{ed}a O'Neil"]) assert.equal(nameOf(by(run([[0, 60, "spk:0", ok]]), "spk:0")), ok);
});

test("injectable predicate can only add refusals; a throwing predicate refuses", () => {
  const segs: Seg[] = [[0, 60, "spk:0", "Acme Corp"]];
  assert.equal(nameOf(by(run(segs), "spk:0")), "Acme Corp");
  assert.equal(reasonOf(by(run(segs, { isNonPersonName: (n) => n.includes("Corp") }), "spk:0")), "non-person-name");
  assert.equal(nameOf(by(run(segs, { isNonPersonName: () => { throw new Error("x"); } }), "spk:0")), null);
  assert.equal(nameOf(by(run([[0, 60, "spk:0", "iPhone"]], { isNonPersonName: () => false }), "spk:0")), null);
});

test("thresholds: too little time, too thin coverage, fraction taken from OBSERVED time not meeting time", () => {
  assert.equal(reasonOf(by(run([[0, 9, "spk:0", "Priya"]]), "spk:0")), "insufficient-duration");
  assert.equal(nameOf(by(run([[0, 10, "spk:0", "Priya"]]), "spk:0")), "Priya", "exactly 10 s is enough");
  const thin = alignTileNamesToTurns(samples([[0, 20, "spk:0", "Priya"]]), [T("a", 0, 100, "spk:0")]);
  assert.equal(reasonOf(by(thin, "spk:0")), "insufficient-coverage", "20% coverage");
  const ok = alignTileNamesToTurns(samples([[0, 40, "spk:0", "Priya"]]), [T("a", 0, 100, "spk:0"), T("b", 100, 1000, "spk:1")]);
  assert.equal(nameOf(by(ok, "spk:0")), "Priya", "40 s all agreeing out of 100 s is 100% of observed, 40% coverage");
  assert.equal(reasonOf(by(run([[0, 55, "spk:0", "Priya"], [55, 100, "spk:0", "Rahul"]], { maxRunnerUpFraction: 1 }), "spk:0")), "insufficient-fraction");
  assert.equal(reasonOf(by(run([[0, 10, "spk:0", null]]), "spk:0")), "no-observations");
});

test("flicker: brief wrong highlights are tolerated, heavy flicker is not; low-confidence samples are releases", () => {
  const segs: Seg[] = [];
  for (let k = 0; k < 10; k++) segs.push([k * 10, k * 10 + 9, "spk:0", "Priya"], [k * 10 + 9, k * 10 + 10, "spk:0", "Rahul"]);
  const r = run(segs);
  assert.equal(nameOf(by(r, "spk:0")), "Priya", "10% flicker");
  const heavy: Seg[] = [];
  for (let k = 0; k < 10; k++) heavy.push([k * 10, k * 10 + 5, "spk:0", "Priya"], [k * 10 + 5, k * 10 + 10, "spk:0", "Rahul"]);
  assert.equal(nameOf(by(run(heavy), "spk:0")), null);
  const log = [...samples([[0, 70, "x", "Priya"]], 0, 0.9), ...samples([[70, 100, "x", "Rahul"]], 0, 0.2)];
  const lowConf = alignTileNamesToTurns(log, [T("a", 0, 100, "spk:0")]);
  assert.equal(nameOf(by(lowConf, "spk:0")), "Priya");
  assert.equal(by(lowConf, "spk:0").observedSec, 70);
});

test("max hold: a single stale observation cannot claim minutes", () => {
  const log = [{ tSec: 0, displayName: "Priya" }];
  const turns = [T("a", 0, 600, "spk:0")];
  const capped = alignTileNamesToTurns(log, turns);
  assert.equal(by(capped, "spk:0").observedSec, 5);
  assert.equal(nameOf(by(capped, "spk:0")), null);
  assert.equal(by(alignTileNamesToTurns(log, turns, { maxHoldSec: 600 }), "spk:0").observedSec, 600);
  const gap = alignTileNamesToTurns([{ tSec: 0, displayName: "Priya" }, { tSec: 100, displayName: "Priya" }], [T("a", 0, 100, "spk:0")]);
  assert.equal(by(gap, "spk:0").observedSec, 5, "100 s silence in the log is not a hold");
});

test("names are equal after NFC and whitespace collapse only: no case-folding, no title stripping", () => {
  const nfc = run([[0, 30, "spk:0", "Caf\u{e9}  Lee"], [30, 60, "spk:0", "Cafe\u{301} Lee "]]);
  assert.equal(nameOf(by(nfc, "spk:0")), "Caf\u{e9} Lee", "composed and decomposed are one name");
  assert.equal(reasonOf(by(run([[0, 50, "spk:0", "Priya"], [50, 100, "spk:0", "priya"]]), "spk:0")), "two-strong-names");
  assert.equal(reasonOf(by(run([[0, 50, "spk:0", "Dr. Priya Nair"], [50, 100, "spk:0", "Priya Nair"]]), "spk:0")), "two-strong-names");
  assert.equal(nameOf(by(run([[0, 60, "spk:0", "PRIYA"]]), "spk:0")), "PRIYA", "case is preserved as displayed");
});

test("overlapping turns: same-label overlap is not double counted; different labels each get credit", () => {
  const log = samples([[0, 15, "x", "Priya"]]);
  const same = alignTileNamesToTurns(log, [T("a", 0, 10, "spk:0"), T("b", 5, 15, "spk:0")]);
  const l = by(same, "spk:0");
  assert.equal(l.totalSec, 15);
  assert.equal(l.observedSec, 15);
  const cross = alignTileNamesToTurns(log, [T("a", 0, 15, "spk:0"), T("b", 0, 15, "spk:1")]);
  assert.equal(by(cross, "spk:0").observedSec, 15);
  assert.equal(by(cross, "spk:1").observedSec, 15);
  assert.equal(reasonOf(by(cross, "spk:0")), "name-on-multiple-labels", "crosstalk cannot name two labels the same");
});

test("empty and missing inputs", () => {
  assert.deepEqual(alignTileNamesToTurns([], []), { labels: [], errors: [] });
  assert.deepEqual(alignTileNamesToTurns(undefined, undefined), { labels: [], errors: [] });
  assert.equal(reasonOf(by(alignTileNamesToTurns([], [T("a", 0, 30, "spk:0")]), "spk:0")), "no-observations");
  assert.deepEqual(alignTileNamesToTurns(samples([[0, 30, "x", "Priya"]]), []).labels, []);
});

test("inputs are not mutated", () => {
  const log = samples(PANEL), turns = turnsOf(PANEL), opts = { botDisplayName: "Bot" };
  const snap = JSON.stringify([log, turns, opts]);
  alignTileNamesToTurns(log.slice().reverse(), turns, opts);
  assert.equal(JSON.stringify([log, turns, opts]), snap);
});
