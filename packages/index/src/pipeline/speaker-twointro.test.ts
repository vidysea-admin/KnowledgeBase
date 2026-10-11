/**
 * packages/index/src/pipeline/speaker-twointro.test.ts -- fix cycle 6 (ISS-PH3-008 critical, ISS-PH3-009 medium).
 *
 * (1) D-015 for ISS-PH3-008: the row's own recorded texts READ FROM qa/issues.ph3.jsonl, both names proposed, end to end
 *     in 8 layouts x 2 labels x every cited turn; prints `ISS-PH3-008: n/n`.
 * (2) The checker's 84-cell grid (6 first sentences x 7 second sentences x 2 name pairs), both names proposed for spk:0
 *     citing the turn, through extractSpeakers: the lane must ship NO cell, and never one the frozen base refuses.
 * (3) Whole-turn rule: same name twice is fine; a different name, in any form, refuses (name equality is exact).
 * (4) ISS-PH3-009: a capitalised word in the "and I lead|am|will be ..." tail refuses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { extractSpeakers as laneExtract, type SpeakersCompleteFn } from "./speakers-llm.js";
import { citesNameAsSelfIdentification } from "./speaker-relation-rules.js";
import { selfIntroductionCandidates, turnHoldsOtherSelfIntroduction } from "./speaker-selfid-rules.js";

const baseExtract = (await import(new URL("./frozen-base-536a56a/speakers-llm.mts", import.meta.url).href)).extractSpeakers as typeof laneExtract;
const mk = (rows: [string, string][]): Turns[] => rows.map(([ref, text], i) => ({ _id: `t${i + 1}`, tenantId: "t", sessionId: "s", speakerRef: ref, tStart: 0, tEnd: 0, text }) as Turns);
const replies = (json: unknown): SpeakersCompleteFn => async () => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 }) as CompleteResult;
const F = "I think so, yes.";
const LAYOUTS: { id: string; rows: (T: string) => [string, string][] }[] = [
  { id: "own-turn", rows: (T) => [["spk:0", T], ["spk:1", "ok"]] }, { id: "own-first-of-block", rows: (T) => [["spk:0", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "own-last-of-block", rows: (T) => [["spk:0", F], ["spk:0", T], ["spk:1", "ok"]] }, { id: "preceding-turn", rows: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "following-turn", rows: (T) => [["spk:1", "ok"], ["spk:0", F], ["spk:1", T]] }, { id: "both-neighbours", rows: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", T]] },
  { id: "between-blocks", rows: (T) => [["spk:0", F], ["spk:1", T], ["spk:0", "ok"]] },
  { id: "third-person-mention", rows: (T) => [["spk:1", T], ["spk:0", "I think so."], ["spk:1", "ok"]] },
];
/** Shipped `label|name` pairs when `proposed` is the model's answer in every call. */
const ships = async (ex: typeof laneExtract, rows: [string, string][], proposed: { label: string; name: string; cite: string }[]): Promise<string[]> =>
  (await ex(mk(rows), replies(proposed.map((p) => ({ speakerRef: p.label, displayName: p.name, turnIds: [p.cite] }))))).resolved.map((r) => `${r.speakerRef}|${r.displayName}`);

// --- (1) the ledger's recorded reproductions ---------------------------------------------------------------------------
const ROW = readFileSync(new URL("../../../../qa/issues.ph3.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.id === "ISS-PH3-008");
const EVIDENCE = ROW.evidence as string;
/** Two-name texts: `"<turn>" -> <first name>` (both names proposed). */
const TWO: string[] = [...EVIDENCE.matchAll(/"([^"]+)" -> \w+/g)].map((m) => m[1]!);
/** Single-proposal texts the row lists after "SINGLE proposal". */
const SINGLE: string[] = [...(EVIDENCE.split("SINGLE proposal")[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!).filter((s) => s.startsWith("Hi, I'm Rashi."));

test("ISS-PH3-008 D-015: the row's recorded texts are read from the ledger", () => {
  assert.equal(TWO.length, 4, TWO.join(" | "));
  assert.deepEqual(SINGLE, ["Hi, I'm Rashi. I'm Priya.", "Hi, I'm Rashi. I mean Priya.", "Hi, I'm Rashi. I'm kidding."]);
  assert.ok(TWO.includes("Hello everyone, I'm Priya. Hello everyone, I'm Rashi."));
});

test("ISS-PH3-008 D-015: every recorded two-name turn ships NOTHING, both names proposed, 8 layouts x 2 labels x every cite (base ships nothing either)", async () => {
  let cells = 0, refused = 0, baseShips = 0;
  for (const T of TWO) {
    const names = selfIntroductionCandidates(T);
    assert.equal(names.length, 2, T);
    for (const L of LAYOUTS) for (const label of ["spk:0", "spk:1"]) {
      const rows = L.rows(T);
      for (let c = 1; c <= rows.length; c++) {
        const proposed = names.map((name) => ({ label, name, cite: `t${c}` }));
        cells++;
        const [l, b] = [await ships(laneExtract, rows, proposed), await ships(baseExtract, rows, proposed)];
        baseShips += b.length;
        if (l.length === 0) refused++;
        else assert.fail(`${L.id} ${label} cite t${c}: ${T} -> ${l}`);
      }
    }
  }
  console.log(`ISS-PH3-008: ${refused}/${cells} two-name cells refused (recorded two-name turns ${TWO.length}); base ships ${baseShips}`);
  assert.equal(refused, cells);
  assert.equal(baseShips, 0);
});

test("ISS-PH3-008 D-015: single-name texts: a second 'I'm Priya' refuses; 'I mean Priya' and 'I'm kidding' are named OPEN (no cue / no second name)", async () => {
  const rows = (T: string): [string, string][] => [["spk:0", T], ["spk:1", "ok"]];
  assert.deepEqual(await ships(laneExtract, rows(SINGLE[0]!), [{ label: "spk:0", name: "Rashi", cite: "t1" }]), []);
  assert.deepEqual(await ships(laneExtract, rows(SINGLE[0]!), [{ label: "spk:0", name: "Priya", cite: "t1" }]), []);
  console.log("ISS-PH3-008 single-name texts: refused 1/3 (\"I'm Priya\"); open 2/3: \"I mean Priya.\" (not a cue), \"I'm kidding.\" (no second name)");
});

// --- (2) the 84-cell grid ----------------------------------------------------------------------------------------------
const FIRST = ["Hello everyone, I'm {A}.", "Hi, I'm {A}.", "I'm {A}.", "My name is {A}.", "Hi all, {A} here.", "Hello everyone, my name is {A}."];
const SECOND = ["Hello everyone, I'm {B}.", "I'm {B}.", "My name is {B}.", "Thank you. I'm {B}.", "{B} here.", "Hi, I am {B}.", "Thank you. Hello everyone. My name is {B}."];
const PAIRS: [string, string][] = [["Priya", "Rashi"], ["Nikhil", "Sonal"]];

test("ISS-PH3-008 grid: 84 cells (6 x 7 x 2 pairs), both names proposed for spk:0 citing t1: the lane ships NOTHING the base refuses", async () => {
  let cells = 0, base = 0, lane = 0, laneOnly = 0;
  for (const [A, B] of PAIRS) for (const f of FIRST) for (const s of SECOND) {
    const T = `${f.replace("{A}", A)} ${s.replace("{B}", B)}`;
    const rows: [string, string][] = [["spk:0", T], ["spk:1", "ok"]];
    const proposed = [A, B].map((name) => ({ label: "spk:0", name, cite: "t1" }));
    const [b, l] = [await ships(baseExtract, rows, proposed), await ships(laneExtract, rows, proposed)];
    cells++; base += b.length; lane += l.length;
    if (l.length && !b.length) laneOnly++;
    assert.deepEqual(l, [], `lane ships ${l} for: ${T}`);
  }
  console.log(`ISS-PH3-008 grid: ${cells} cells, base ships ${base}, lane ships ${lane}, lane-only ${laneOnly}`);
  assert.equal(cells, 84);
  assert.equal(laneOnly, 0);
});

// --- (3) the whole-turn rule -------------------------------------------------------------------------------------------
test("whole-turn rule: the same name twice is not ambiguous and still ships; a different name anywhere in the turn refuses", async () => {
  assert.equal(turnHoldsOtherSelfIntroduction("Hello, I'm Priya. I'm Priya.", "Priya"), false);
  assert.equal(turnHoldsOtherSelfIntroduction("Hello, I’m Priya. I'm Priya.", "Priya"), false);
  assert.deepEqual(await ships(laneExtract, [["spk:0", "Hello, I'm Priya. I'm Priya."], ["spk:1", "ok"]], [{ label: "spk:0", name: "Priya", cite: "t1" }]), ["spk:0|Priya"]);
  assert.deepEqual(await ships(laneExtract, [["spk:0", "Hello, I'm Priya from Vidysea."], ["spk:1", "ok"]], [{ label: "spk:0", name: "Priya", cite: "t1" }]), ["spk:0|Priya"]);
  assert.equal(citesNameAsSelfIdentification("Hello, I'm Rashi. I'm Priya.", "Rashi"), false);
  assert.equal(citesNameAsSelfIdentification("Hello, I'm Rashi. I'm Priya.", "Priya"), false);
  assert.equal(citesNameAsSelfIdentification("Hello everyone, I'm Priya. Hello everyone, I'm Rashi.", "Priya"), false);
});

test("whole-turn rule: name equality is EXACT (the base keys names by exact string): short form, case and surname all count as a different name", () => {
  for (const [T, N] of [["Hello, I'm Priya. I'm Priya Sharma.", "Priya"], ["Hello, I'm Priya Sharma. I'm Priya.", "Priya Sharma"], ["Hello, I'm Priya. I'm PRIYA.", "Priya"]] as [string, string][]) {
    assert.equal(turnHoldsOtherSelfIntroduction(T, N), true, T);
    assert.equal(citesNameAsSelfIdentification(T, N), false, T);
  }
});

test("whole-turn rule: candidates are found anywhere in the turn, before position/tail filters, including 'X here' and 'this is X Y' forms", () => {
  assert.deepEqual(selfIntroductionCandidates("Hi everyone. Thanks for having me. I'm Priya. Anyway, so, my name is Rashi and I lead admissions."), ["Priya", "Rashi"]);
  assert.deepEqual(selfIntroductionCandidates("Hi Priya here. Hello, Rashi speaking."), ["Priya", "Rashi"]);
  assert.deepEqual(selfIntroductionCandidates("This is Rahul Mehta from Vidysea."), ["Rahul Mehta"]);
  assert.deepEqual([...new Set(selfIntroductionCandidates("I'm Rashi here. I am a student. I am not sure."))], ["Rashi"]);
});

// --- (4) ISS-PH3-009: the capital-letter test on the role-clause tail ---------------------------------------------------
test("ISS-PH3-009: a capitalised word in an 'and I lead|am|will be ...' tail refuses (kills the [A-Za-z] mutant of tailOk)", () => {
  for (const T of ["Hello, I'm Rashi and I lead Priya.", "Hello, I'm Rashi and I work with Rahul Mehta.", "Hello, I am Rashi and I will be handing over to Priya.", "Hello, I'm Rashi and I lead Admissions."])
    assert.equal(citesNameAsSelfIdentification(T, "Rashi"), false, T);
  assert.equal(citesNameAsSelfIdentification("Hello, I'm Rashi and I lead admissions.", "Rashi"), true);
});
