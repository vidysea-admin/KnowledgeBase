/**
 * packages/index/src/pipeline/speaker-selfid-allowlist.test.ts -- fix cycle 5 (ISS-PH3-006 critical, ISS-PH3-007 low).
 *
 * (1) D-015 for ISS-PH3-006: the row's own recorded forms, READ FROM qa/issues.ph3.jsonl (not retyped), x 7 names, at predicate
 *     level and end to end in the checker's 8 layouts x 2 labels x every cited turn. Count by issue id is printed.
 * (2) The allow-list itself: what each shape accepts and the neighbours that make it refuse.
 * (3) ISS-PH3-007: a DIRECT namingTurns test with a two-label block, so removing the speaker-equals-label filter fails here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";
import { citesNameAsSelfIdentification, namingTurns } from "./speaker-relation-rules.js";

const mk = (rows: [string, string][]): Turns[] => rows.map(([ref, text], i) => ({ _id: `t${i + 1}`, tenantId: "t", sessionId: "s", speakerRef: ref, tStart: 0, tEnd: 0, text }) as Turns);
const replies = (json: unknown): SpeakersCompleteFn => async () => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 }) as CompleteResult;
const F = "I think so, yes.";
const LAYOUTS: { id: string; rows: (T: string, N: string) => [string, string][] }[] = [
  { id: "own-turn", rows: (T) => [["spk:0", T], ["spk:1", "ok"]] }, { id: "own-first-of-block", rows: (T) => [["spk:0", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "own-last-of-block", rows: (T) => [["spk:0", F], ["spk:0", T], ["spk:1", "ok"]] }, { id: "preceding-turn", rows: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "following-turn", rows: (T) => [["spk:1", "ok"], ["spk:0", F], ["spk:1", T]] }, { id: "both-neighbours", rows: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", T]] },
  { id: "between-blocks", rows: (T) => [["spk:0", F], ["spk:1", T], ["spk:0", "ok"]] },
  { id: "third-person-mention", rows: (T, N) => [["spk:1", T], ["spk:0", `I think ${N} is not having any questions.`], ["spk:1", "ok"]] },
];
const shipsAny = async (rows: [string, string][], label: string, N: string): Promise<number> => {
  const turns = mk(rows);
  let k = 0;
  for (let c = 1; c <= turns.length; c++) if ((await extractSpeakers(turns, replies([{ speakerRef: label, displayName: N, turnIds: [`t${c}`] }]))).resolved.some((r) => r.displayName === N && r.speakerRef === label)) k++;
  return k;
};

// --- (1) the ledger's own recorded reproductions ---------------------------------------------------------------------
const ROW = readFileSync(new URL("../../../../qa/issues.ph3.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.id === "ISS-PH3-006");
const FORMS: string[] = [...(ROW.evidence as string).matchAll(/"([^"]*\{N\}[^"]*)"/g)].map((m) => m[1]!);
const NAMES = ["Nikhil", "Rashi", "Priya", "Makrand Rajadhyaksha", "Paris", "Moderator", "Mumbai Sharma"];

test("D-015 ISS-PH3-006: the row's recorded forms are read from the ledger (17) plus its two-name case", () => {
  assert.equal(FORMS.length, 17);
  assert.ok((ROW.evidence as string).includes("I am Rashi and this is Makrand Rajadhyaksha."));
});

test("D-015 ISS-PH3-006: every recorded form x 7 names refused at predicate level", () => {
  const open = NAMES.flatMap((N) => FORMS.map((s) => s.replaceAll("{N}", N)).filter((T) => citesNameAsSelfIdentification(T, N))).concat(
    ["Rashi", "Makrand Rajadhyaksha"].filter((N) => citesNameAsSelfIdentification("I am Rashi and this is Makrand Rajadhyaksha.", N)));
  console.log(`D-015 ISS-PH3-006 predicate: refused ${FORMS.length * NAMES.length + 2 - open.length}/${FORMS.length * NAMES.length + 2}`);
  assert.deepEqual(open, []);
});

test("D-015 ISS-PH3-006: the same texts end to end in 8 layouts x 2 labels x every cite: 0 shipped", async () => {
  const open: string[] = [];
  let n = 0;
  for (const L of LAYOUTS) for (const label of ["spk:0", "spk:1"]) {
    for (const N of NAMES) for (const s of FORMS) { const T = s.replaceAll("{N}", N); n += L.rows(T, N).length; if (await shipsAny(L.rows(T, N), label, N)) open.push(`${L.id} ${label} | ${T}`); }
    for (const N of ["Rashi", "Makrand Rajadhyaksha"]) { const T = "I am Rashi and this is Makrand Rajadhyaksha."; n += L.rows(T, N).length; if (await shipsAny(L.rows(T, N), label, N)) open.push(`${L.id} ${label} ${N} | ${T}`); }
  }
  console.log(`D-015 ISS-PH3-006 end to end: ${n} cells, shipped ${open.length}`);
  assert.deepEqual(open.slice(0, 20), []);
});

// --- (2) the allow-list --------------------------------------------------------------------------------------------
test("allow-list: accepted shapes (each is a whole sentence: openers, cue, ONE name, closed tail)", () => {
  for (const [T, N] of [["My name is Ruby and I lead admissions.", "Ruby"], ["Hi all, Ruby here.", "Ruby"], ["Good morning everyone, Ruby speaking.", "Ruby"],
    ["This is Makrand Rajadhyaksha from Vidysea.", "Makrand Rajadhyaksha"], ["Hello, I’m Rashi from the Leeds office.", "Rashi"], ["Hello, I'm Rashi", "Rashi"],
    ["Hi everyone. Namaste. I'm Sumit! We will start soon.", "Sumit"], ["Well, thank you so much for sharing that. Um, let me quickly introduce myself first. My name is Jubin Thakkar. I am the South Asia representative.", "Jubin Thakkar"],
    ["Before I invite our next speaker, I should say: call me Ruby.", "Ruby"]] as [string, string][]) assert.equal(citesNameAsSelfIdentification(T, N), true, T);
});

test("allow-list: refused however innocent (second name, filler, free text before or after, other cues, other languages)", () => {
  for (const [T, N] of [["I am Rashi and this is Makrand Rajadhyaksha.", "Rashi"], ["I am Rashi and this is Makrand Rajadhyaksha.", "Makrand Rajadhyaksha"], ["I'm Rashi, yeah.", "Rashi"],
    ["I'm Rashi, um, and welcome.", "Rashi"], ["Call me Nikhil.", "Nikhil"], ["They call me Nikhil.", "Nikhil"], ["Please welcome Rashi. I'm Rashi.", "Rashi"],
    ["Thank you, Priya. I'm Rashi.", "Rashi"], ["I'm Rashi. That is what he said.", "Rashi"], ["I'm Rashi from Vidysea and Makrand.", "Rashi"], ["This is Priya.", "Priya"],
    ["I am Rashi and I am the one he said.", "Rashi"], ["Mera naam Rashi hai.", "Rashi"], ["I'm Rashi ka friend.", "Rashi"], ["Hi, I'm Rashi?", "Rashi"], ["Rashi here has an announcement.", "Rashi"]] as [string, string][])
    assert.equal(citesNameAsSelfIdentification(T, N), false, `${N} | ${T}`);
});

// --- (3) ISS-PH3-007 -------------------------------------------------------------------------------------------------
test("ISS-PH3-007: namingTurns binds ONLY turns spoken by the proposed label (direct call, two labels in one block)", () => {
  const turns = mk([["spk:0", "Hello, I'm Nikhil."], ["spk:1", "Hello, I'm Priya."], ["spk:0", "Thanks."]]);
  const block = { startTurnIndex: 0, endTurnIndex: 2 };
  assert.deepEqual(namingTurns(turns, "spk:0", "Nikhil", block), [0]);
  assert.deepEqual(namingTurns(turns, "spk:0", "Priya", block), [], "Priya's self-introduction, spoken by spk:1, does not bind spk:0");
  assert.deepEqual(namingTurns(turns, "spk:1", "Priya", block), [1]);
  assert.deepEqual(namingTurns(turns, "spk:1", "Nikhil", block), [], "and Nikhil's does not bind spk:1");
});
