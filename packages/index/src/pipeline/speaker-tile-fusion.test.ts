/**
 * speaker-tile-fusion.test.ts -- T-042 slice 2. Fusion rules, boundaries, and the D-015 replay of ISS-PH3-004 / ISS-PH3-006's own
 * recorded reproductions THROUGH THE FUSION PATH (counts printed as "PH3 replay ...").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { alignTileNamesToTurns, type LabelResult, type RefusalReason } from "@lkb/core";
import { acceptedIntroNames, cleanTileName, FUSION_DEFAULTS, fuseSpeakerNames, namesAgree, type FusionOptions, type FusionTurn } from "./speaker-tile-fusion.js";

const turn = (id: string, ref: string, text: string, tStart = 0, tEnd = tStart + 10): FusionTurn => ({ id, speakerRef: ref, tStart, tEnd, text });
const tileNamed = (ref: string, displayName: string): LabelResult => ({
  speakerRef: ref, totalSec: 60, observedSec: 60, candidates: [{ name: displayName, sec: 60 }],
  decision: { status: "named", claim: { kind: "display-name-claim", source: "platform-display-name", verified: false, displayName },
    evidence: { agreeSec: 60, disagreeSec: 0, observedSec: 60, totalSec: 60, runnerUp: null, turnIds: ["t0"], from: 0, to: 60,
      lagStability: { maxLagSec: 3, stepSec: 0.5, shifts: 7, worstWinnerFraction: 1, worstRunnerUpFraction: 0, minAgreeSec: 60 } } },
});
const tileRefused = (ref: string, reason: RefusalReason): LabelResult => ({ speakerRef: ref, totalSec: 60, observedSec: 60, candidates: [], decision: { status: "refused", reason } });
const INTRO = "Hello everyone, my name is Priya Nair and I lead admissions.";
const TILE_ON: FusionOptions = { allowTileOnly: true };   // tile-only naming is OFF by default (ISS-T042FUSION-001); tests of that path opt in
const one = (tile: LabelResult[], turns: FusionTurn[], o?: FusionOptions) => fuseSpeakerNames(tile, turns, o).labels[0]!;

test("agreement: tile and self-introduction name the same person -> name, basis agree, fuller name, both sources in evidence", () => {
  const l = one([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", INTRO, 5, 20)]);
  assert.equal(l.status, "named");
  if (l.status !== "named") return;
  assert.deepEqual([l.name, l.basis, l.verified], ["Priya Nair", "agree", false]);
  assert.deepEqual(l.intro, { name: "Priya Nair", turnIds: ["a"], from: 5, to: 20 });
  assert.equal(l.tile?.name, "Priya Nair");
  const first = one([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", "Hi all, I'm Priya.")]);   // intro is a part of the display name
  assert.deepEqual(first.status === "named" && [first.name, first.basis], ["Priya Nair", "agree"]);
  const rev = one([tileNamed("spk:0", "Priya")], [turn("a", "spk:0", INTRO)]);                          // display name is a part of the intro
  assert.deepEqual(rev.status === "named" && [rev.name, rev.basis], ["Priya Nair", "agree"]);
});

test("tile only: OFF by default; when enabled a person-shaped tile with no introduction -> tile-only", () => {
  assert.equal(FUSION_DEFAULTS.allowTileOnly, false);
  const dflt = one([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", "We will cover eligibility next.")]);
  assert.deepEqual(dflt.status === "none" && dflt.reason, "source-disabled");
  const l = one([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", "We will cover eligibility next.")], TILE_ON);
  assert.deepEqual(l.status === "named" && [l.name, l.basis, l.intro], ["Priya Nair", "tile-only", null]);
  const off = fuseSpeakerNames([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", "ok")], { allowTileOnly: false }).labels[0]!;
  assert.deepEqual(off.status === "none" && off.reason, "source-disabled");
});

// ISS-T042FUSION-001: the checker's 12 recorded junk tile names (+ the rest of its list), through the REAL aligner, verbatim.
const CHECKER_12 = ["Vidysea", "Acme Corp", "Sales Team", "Admissions", "Support", "Student", "Samsung S21", "User 1", "J", "hello@vidysea.com", "Rahul | Vidysea", "Priya (Vidysea)"];
const CHECKER_REST = ["Marketing", "Office", "Parent", "Tablet", "Redmi Note 9", "Q&A", "Otter.ai", "Priya - Vidysea", "Priya Nair (she/her)", "Careers Counselor", "VIDYSEA ADMISSIONS TEAM", "Dr. Priya", "Mr. Rahul Verma"];
function viaAligner(displayName: string, o?: FusionOptions): string {
  const turns = [turn("t0", "spk:0", "We will cover eligibility next.", 0, 60)];
  const aligned = alignTileNamesToTurns(Array.from({ length: 60 }, (_, s) => ({ tSec: s, displayName })), turns.map(({ id, tStart, tEnd, speakerRef }) => ({ id, tStart, tEnd, speakerRef })));
  const l = fuseSpeakerNames(aligned, turns, o).labels[0]!;
  return l.status === "named" ? `${l.name}/${l.basis}` : `none:${l.reason}`;
}
test("ISS-T042FUSION-001 replay: the checker's 12 junk tile names -> none by default; none with tile-only on except a real person left after stripping the org decoration", () => {
  const dflt = CHECKER_12.map((n) => [n, viaAligner(n)]);
  const on = CHECKER_12.map((n) => [n, viaAligner(n, TILE_ON)]);
  console.log(`ISS-T042FUSION-001 replay default: named ${dflt.filter(([, r]) => !r!.startsWith("none")).length}/12; tile-only on: ${JSON.stringify(on.filter(([, r]) => !r!.startsWith("none")))}`);
  assert.deepEqual(dflt.filter(([, r]) => !r!.startsWith("none")), []);
  // DECISION: "Rahul | Vidysea" and "Priya (Vidysea)" are a first name plus an org decoration; with tile-only explicitly enabled the stripped remainder IS a person name.
  assert.deepEqual(on.filter(([, r]) => !r!.startsWith("none")), [["Rahul | Vidysea", "Rahul/tile-only"], ["Priya (Vidysea)", "Priya/tile-only"]]);
  for (const n of CHECKER_REST) {
    const r = viaAligner(n);
    assert.ok(r.startsWith("none"), `${n} -> ${r}`);
  }
  const onRest = Object.fromEntries(CHECKER_REST.map((n) => [n, viaAligner(n, TILE_ON)]).filter(([, r]) => !r!.startsWith("none")));
  assert.deepEqual(onRest, { "Priya - Vidysea": "Priya/tile-only", "Priya Nair (she/her)": "Priya Nair/tile-only", "Dr. Priya": "Priya/tile-only", "Mr. Rahul Verma": "Rahul Verma/tile-only" });
});

test("cleanTileName: person shapes pass; email, digits, initials, ALL-CAPS, role/org/team/device words, bare titles and org-only remainders fail closed", () => {
  const ok: [string, string][] = [["Priya Nair", "Priya Nair"], ["Rahul | Vidysea", "Rahul"], ["Priya (Vidysea)", "Priya"], ["Dr. Priya Nair", "Priya Nair"], ["Anaïs", "Anaïs"], ["Mary-Jane O'Neil", "Mary-Jane O'Neil"], ["Ravi van der Berg", "Ravi van der Berg"]];
  for (const [i, o] of ok) assert.equal(cleanTileName(i), o, i);
  const stripsToPerson = /Dr\.|Mr\.|she|Priya -/u;
  for (const bad of [...CHECKER_12.filter((n) => !n.includes("|") && !n.includes("(")), ...CHECKER_REST.filter((n) => !stripsToPerson.test(n)), "Dr", "Mr.", "Vidysea | Rahul", "Vidysea Admissions", "R. K.", "Priya N1", "iPhone", "Guest", "Everyone", "", "   ", "Priya‮An"]) assert.equal(cleanTileName(bad), null, bad);
  assert.equal(cleanTileName(42 as never), null);
  // a tile that is not person-shaped is NO evidence: with a clean introduction the intro stands alone and the junk tile is recorded as a refusal
  const l = one([tileNamed("spk:0", "Sales Team")], [turn("a", "spk:0", INTRO)]);
  assert.deepEqual(l.status === "named" && [l.name, l.basis, l.tile, l.tileRefusal], ["Priya Nair", "intro-only", null, "non-person-name"]);
});

test("self-introduction only (strong): no tile data at all, a clean introduction names the label; options can switch it off", () => {
  for (const tile of [[], [tileRefused("spk:0", "no-observations")], [tileRefused("spk:0", "insufficient-coverage")], [tileRefused("spk:0", "lag-unstable")], [tileRefused("spk:0", "non-person-name")]]) {
    const l = one(tile, [turn("a", "spk:0", INTRO), turn("b", "spk:0", "Thanks.")]);
    assert.deepEqual(l.status === "named" && [l.name, l.basis, l.tile], ["Priya Nair", "intro-only", null], JSON.stringify(tile));
  }
  assert.equal(fuseSpeakerNames(null, [turn("a", "spk:0", INTRO)], { allowIntroOnly: false }).labels[0]!.status, "none");
});

test("conflict -> NO name: tile and introduction disagree; two introductions in one label; tile refused for contradictory evidence", () => {
  const c1 = one([tileNamed("spk:0", "Rahul Verma")], [turn("a", "spk:0", INTRO)]);
  assert.deepEqual(c1.status === "none" && c1.reason, "tile-intro-conflict");
  const c2 = one([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", INTRO), turn("b", "spk:0", "Hi, I am Rahul Verma.", 30, 40)]);
  assert.deepEqual(c2.status === "none" && [c2.reason, c2.introNames], ["intro-names-conflict", ["Priya Nair", "Rahul Verma"]]);
  const c2b = one([], [turn("a", "spk:0", "Hi, I'm Priya."), turn("b", "spk:0", "Hi, I'm Priya Nair.", 30, 40)]);   // repo rule: Priya vs Priya Nair are two names
  assert.deepEqual(c2b.status === "none" && c2b.reason, "intro-names-conflict");
  for (const r of ["two-strong-names", "runner-up-too-strong", "name-on-multiple-labels"] as const) {
    const c3 = one([tileRefused("spk:0", r)], [turn("a", "spk:0", INTRO)]);
    assert.deepEqual(c3.status === "none" && c3.reason, "tile-contradicted", r);
  }
});

test("a name that would land on two labels is refused for both (diarizer split / shared device), including part-of-name matches", () => {
  const r = fuseSpeakerNames([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", "ok"), turn("b", "spk:1", "Hi, I'm Priya Nair.", 20, 30), turn("c", "spk:2", "Hello, I'm Rahul Verma.", 40, 50)], TILE_ON);
  assert.deepEqual(r.labels.map((l) => [l.speakerRef, l.status === "none" ? l.reason : l.status === "named" ? l.name : ""]), [["spk:0", "name-on-multiple-labels"], ["spk:1", "name-on-multiple-labels"], ["spk:2", "Rahul Verma"]]);
  const p = fuseSpeakerNames([], [turn("a", "spk:0", "Hi, I'm Priya."), turn("b", "spk:1", "Hi, I'm Priya Nair.", 20, 30)]);
  assert.deepEqual(p.labels.map((l) => l.status), ["none", "none"]);
});

test("reported speech never names: not as intro evidence, not as a veto, not alongside a tile name", () => {
  const rep = "He said I am Rahul Verma.";
  assert.deepEqual(acceptedIntroNames(rep), []);
  const t = one([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", rep)], TILE_ON);
  assert.deepEqual(t.status === "named" && [t.name, t.basis, t.intro], ["Priya Nair", "tile-only", null]);   // the tile stands alone; the quote neither agrees nor conflicts
  assert.equal(one([], [turn("a", "spk:0", rep)]).status, "none");
  assert.equal(one([], [turn("a", "spk:0", "She told us, I'm Rahul Verma."), turn("b", "spk:0", INTRO, 20, 30)]).status, "named");   // a reported line does not make a second name
});

test("turn boundaries: an introduction is judged inside ONE turn; a cue at the end of one turn plus a name at the start of the next is nothing", () => {
  assert.equal(one([], [turn("a", "spk:0", "Before we begin, my name is", 0, 5), turn("b", "spk:0", "Priya Nair and I lead admissions.", 5, 10)]).status, "none");
  assert.equal(one([], [turn("a", "spk:0", "Hello everyone, I am", 0, 5), turn("b", "spk:0", "Priya Nair.", 5, 10)]).status, "none");
  // introductions inside another label's turn never name this label
  const r = fuseSpeakerNames([], [turn("a", "spk:0", "Welcome all."), turn("b", "spk:1", "Hello, I'm Priya Nair.", 10, 20)]);
  assert.deepEqual(r.labels.map((l) => [l.speakerRef, l.status]), [["spk:0", "none"], ["spk:1", "named"]]);
});

test("timestamps: turns come back in time order with their own bounds; provenance carries from/to; the label name applies to every one of its turns", () => {
  const r = fuseSpeakerNames([], [turn("late", "spk:0", "Thanks.", 100, 110), turn("intro", "spk:0", INTRO, 12.5, 30), turn("other", "spk:1", "Yes.", 40, 41)]);
  assert.deepEqual(r.turns.map((t) => [t.turnId, t.tStart, t.tEnd, t.name]), [["intro", 12.5, 30, "Priya Nair"], ["other", 40, 41, null], ["late", 100, 110, "Priya Nair"]]);
  const l = r.labels[0]!;
  assert.deepEqual(l.intro, { name: "Priya Nair", turnIds: ["intro"], from: 12.5, to: 30 });
  assert.deepEqual(r.turns[1]!.reason, "no-evidence");
  const shuffled = fuseSpeakerNames([], [turn("other", "spk:1", "Yes.", 40, 41), turn("intro", "spk:0", INTRO, 12.5, 30), turn("late", "spk:0", "Thanks.", 100, 110)]);
  assert.deepEqual(shuffled, r);
  const nested = fuseSpeakerNames([], [turn("short", "spk:1", "Yes.", 10, 20), turn("long", "spk:0", "Welcome.", 0, 100)]);   // order is by start, not end
  assert.deepEqual(nested.turns.map((t) => t.turnId), ["long", "short"]);
});

test("end to end with the real aligner: 4-panelist style log + introductions", () => {
  const turns = [turn("t0", "spk:0", INTRO, 0, 60), turn("t1", "spk:1", "Hi, I'm Rahul Verma.", 60, 120), turn("t2", "spk:2", "I think so.", 120, 180)];
  const log = Array.from({ length: 180 }, (_, s) => ({ tSec: s, displayName: s < 60 ? "Priya Nair" : s < 120 ? "Mohan Rao" : "Anita Das" }));
  const aligned = alignTileNamesToTurns(log, turns.map(({ id, tStart, tEnd, speakerRef }) => ({ id, tStart, tEnd, speakerRef })));
  const r = fuseSpeakerNames(aligned, turns, TILE_ON);
  assert.deepEqual(r.labels.map((l) => [l.speakerRef, l.status === "named" ? `${l.name}/${l.basis}` : l.reason]),
    [["spk:0", "Priya Nair/agree"], ["spk:1", "tile-intro-conflict"], ["spk:2", "Anita Das/tile-only"]]);
  const d = fuseSpeakerNames(aligned, turns);   // defaults: the tile-only label is not named
  assert.deepEqual(d.labels.map((l) => [l.speakerRef, l.status === "named" ? `${l.name}/${l.basis}` : l.reason]), [["spk:0", "Priya Nair/agree"], ["spk:1", "tile-intro-conflict"], ["spk:2", "source-disabled"]]);
});

test("hostile input never throws and is reported: bad turns, duplicate ids, NaN times, huge text, proto names", () => {
  const r = fuseSpeakerNames(undefined, [null, { id: "", speakerRef: "a", tStart: 0, tEnd: 1, text: "x" }, turn("d", "s", "x"), turn("d", "s", "y"), { id: "n", speakerRef: "s", tStart: NaN, tEnd: 1, text: "x" },
    { id: "e", speakerRef: "s", tStart: 5, tEnd: 1, text: "x" }, { id: "z", speakerRef: "s", tStart: 0, tEnd: 1, text: 5 }, turn("big", "s", "a".repeat(60_000)), turn("__proto__", "constructor", "Hi, I'm Priya Nair.")]);
  assert.deepEqual(r.errors.map((e) => e.code), ["invalid-turn", "invalid-id", "duplicate-id", "duplicate-id", "invalid-time", "invalid-time", "invalid-text", "text-too-long"]);
  assert.deepEqual(r.labels.map((l) => [l.speakerRef, l.status]), [["constructor", "named"]]);
  assert.equal(({} as Record<string, unknown>).name, undefined);
  assert.deepEqual(fuseSpeakerNames("nope" as never, 7).labels, []);
  assert.equal(namesAgree("", "Priya"), false);
  assert.equal(namesAgree("PRIYA nair", "Priya Nair"), true);
  assert.equal(namesAgree("Priya Nair", "Nair Priya"), false);
});

// ---- D-015: the ledger rows' OWN recorded reproductions, verbatim, through the fusion path -----------------------------------------
const PH3_004 = ["He said I am {N}.", "She told us, I'm {N}.", "He said: I am {N}, and left.", "People go, I am {N}, and stall.", "I was told my name is {N}.",
  "Do you think I am {N}?", "I am, {N}, still waiting for the slides."];
const NAMES_004 = ["Nikhil", "Rashi", "Sumit", "Nupur", "Priya", "Kshitij", "Anisha", "Jubin", "Sonal", "Ruby", "Makrand Rajadhyaksha", "Mumbai Sharma", "Doris Day", "Prasanti"];
const PH3_006 = ["I am {N}, he said.", "As he put it yesterday when we spoke about the visa process, I am {N}.", "His words: I am {N}.", "Quote, I am {N}, unquote.",
  "Reading the question from Priya: I am {N}", "For instance, my name is {N}.", "Take the case where I am {N}.", "Their message: I am {N}.", "The email starts with I am {N}.",
  "Try repeating after me: My name is {N}.", "Repeat after me, I am {N}.", "I am {N} in the movie.", "I am {N} in the play.", "Usne kaha I am {N}.",
  "Woh bol raha tha my name is {N}.", "Maine nahi kaha, my name is {N}.", "Main nahi hoon, I am {N} ka friend."];
const NAMES_006 = ["Nikhil", "Priya", "Makrand Rajadhyaksha", "Paris", "Moderator"];
const MAKRAND = "I am Rashi and this is Makrand Rajadhyaksha.";

/** A reproduction is "refused" when the fusion path attaches no self-introduction evidence for N (no intro, no intro name) and, with no tile, names nobody. */
function replay(texts: [string, string][]): { refused: number; open: string[] } {
  const open: string[] = [];
  for (const [T, N] of texts) {
    const alone = fuseSpeakerNames([], [turn("a", "spk:0", T)]);
    const withTile = fuseSpeakerNames([tileNamed("spk:0", N)], [turn("a", "spk:0", T)], TILE_ON).labels[0]!;
    const l = alone.labels[0]!;
    const ok = l.status === "none" && l.introNames.length === 0 && alone.turns[0]!.name === null
      && withTile.introNames.length === 0 && withTile.intro === null && !(withTile.status === "named" && withTile.basis !== "tile-only");   // never "agree": the quote is not corroboration (a name-shaped tile may stand alone as tile-only; "Moderator"/"Paris" are refused by the shape gate)
    if (!ok) open.push(T);
  }
  return { refused: texts.length - open.length, open };
}

test("D-015 ISS-PH3-004 replay: 7 recorded forms x 14 names = 98 texts, all refused through the fusion path", () => {
  const texts = NAMES_004.flatMap((N) => PH3_004.map((s): [string, string] => [s.replaceAll("{N}", N), N]));
  const { refused, open } = replay(texts);
  console.log(`PH3 replay ISS-PH3-004: refused ${refused}/${texts.length}`);
  assert.equal(texts.length, 98);
  assert.deepEqual(open, []);
});

test("D-015 ISS-PH3-006 replay: 17 recorded forms x 5 names = 85 texts + the Makrand case, all refused through the fusion path", () => {
  const texts = NAMES_006.flatMap((N) => PH3_006.map((s): [string, string] => [s.replaceAll("{N}", N), N]));
  const { refused, open } = replay(texts);
  console.log(`PH3 replay ISS-PH3-006: refused ${refused}/${texts.length}`);
  assert.equal(texts.length, 85);
  assert.deepEqual(open, []);
  // the Makrand row: "I am Rashi and this is Makrand Rajadhyaksha." must ship NEITHER name (the base shipped Makrand to Rashi's label)
  const m = fuseSpeakerNames([], [turn("a", "spk:0", MAKRAND)]);
  console.log(`PH3 replay ISS-PH3-006 Makrand case: names=${JSON.stringify(m.labels[0]!.introNames)}, turn name=${m.turns[0]!.name}`);
  assert.deepEqual([m.labels[0]!.introNames, m.turns[0]!.name], [[], null]);
});

test("the replayed forms are the ledger's: each literal appears in qa/issues.ph3.jsonl rows 004 / 006", () => {
  const path = new URL("../../../../qa/issues.ph3.jsonl", import.meta.url);
  if (!existsSync(path)) return;
  const rows = readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: string; evidence?: string });
  const ev = (id: string): string => rows.find((r) => r.id === id)?.evidence ?? "";
  const [e4, e6] = [ev("ISS-PH3-004"), ev("ISS-PH3-006")];
  assert.deepEqual(PH3_004.filter((s) => !e4.includes(s.replaceAll("{N}", "Nikhil"))), []);
  assert.deepEqual(PH3_006.filter((s) => !e6.includes(s)), []);
  assert.ok(e6.includes("I am Rashi and this is Makrand Rajadhyaksha"));
});

test("not vacuous: the same fusion path DOES name clean introductions (recall kept)", () => {
  for (const [T, N] of [["My name is Nikhil and I lead admissions.", "Nikhil"], ["Hi all, Nikhil here.", "Nikhil"], ["Hello, I'm Rashi.", "Rashi"],
    ["Hi, this is Mumbai Sharma.", "Mumbai Sharma"], ["Hello everyone, I would like to introduce myself, I'm Ruby.", "Ruby"]] as [string, string][]) {
    const l = fuseSpeakerNames([], [turn("a", "spk:0", T)]).labels[0]!;
    assert.deepEqual(l.status === "named" && [l.name, l.basis], [N, "intro-only"], T);
  }
});

test("ISS-T042FUSION-002: whole-token containment is pinned (kills the substring-agreement mutant)", () => {
  for (const [a, b] of [["Raj", "Rajesh Kumar"], ["Rajesh Kumar", "Raj"], ["Raj Kumar", "Rajesh Kumar"], ["Ana", "Anaïs"], ["Priya Nair", "Priya Sharma"], ["Pri", "Priya"], ["Nair", "Priyanka Nair"], ["ya Nair", "Priya Nair"]]) assert.equal(namesAgree(a!, b!), false, `${a} ~ ${b}`);
  for (const [a, b] of [["Priya", "Priya Nair"], ["Nair Das", "Priya Nair Das"], ["Priya Nair", "Priya Nair"]]) assert.equal(namesAgree(a!, b!), true, `${a} ~ ${b}`);
  // through the fusion path: tile Priya Nair + intro Priya Sharma -> none; tile Raj + intro Rajesh Kumar -> none
  const c1 = one([tileNamed("spk:0", "Priya Nair")], [turn("a", "spk:0", "Hello everyone, my name is Priya Sharma and I lead admissions.")], TILE_ON);
  assert.deepEqual(c1.status === "none" && c1.reason, "tile-intro-conflict");
  const c2 = one([tileNamed("spk:0", "Raj")], [turn("a", "spk:0", "Hi, I'm Rajesh Kumar.")], TILE_ON);
  assert.deepEqual(c2.status === "none" && c2.reason, "tile-intro-conflict");
});

test("ISS-T042FUSION-003: a bare title never agrees; a bare surname never agrees with a fuller name; titles are stripped from returned names", () => {
  for (const [a, b] of [["Dr", "Dr Priya"], ["Dr.", "Dr. Priya Nair"], ["Mr", "Mr Kumar"], ["Kumar", "Rajesh Kumar"], ["Nair", "Priya Nair"], ["Dr", "Dr"]]) assert.equal(namesAgree(a!, b!), false, `${a} ~ ${b}`);
  assert.equal(namesAgree("Dr. Priya", "Priya"), true);
  assert.equal(namesAgree("Kumar", "Kumar"), true);
  assert.equal(namesAgree("Mr Kumar", "Kumar"), true);
  const l = one([tileNamed("spk:0", "Dr. Priya")], [turn("a", "spk:0", "Hi all, I'm Priya.")]);
  assert.deepEqual(l.status === "named" && [l.name, l.basis], ["Priya", "agree"]);
});
