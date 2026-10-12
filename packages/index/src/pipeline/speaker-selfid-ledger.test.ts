/**
 * packages/index/src/pipeline/speaker-selfid-ledger.test.ts -- fix cycle 4, D-015 for ISS-PH3-004 / ISS-PH3-005.
 *
 * (1) ISS-PH3-004's seven RECORDED reproductions (verbatim, each with the thirteen names the row lists), at predicate
 *     level and end to end in every layout of the BLOCK-BINDING RULE: own turn cited; neighbour cited, same label;
 *     neighbour cited, different label; the self-identifying turn at a block boundary; label = the speaker.
 * (2) The families the cycle-4 guards refuse, each pinned with an example (questions, hedges, negation, address, relation).
 * (3) What the guards still ACCEPT, deliberately (a refusal-only suite would pass if everything were refused).
 * (4) ISS-PH3-005: guards are route-independent; no production module can switch a route on or reach the test seam.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { extractSpeakersRuleBased as extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";
import { looksLikeAName, isDiscourseOnly, nameOccurrences } from "./speaker-name-rules.js";
import { citesNameAsSelfIdentification, citesNameAsHandover, citesNameAsThanks, occurrenceAccepted, relationGate, RELATION_ROUTES, type RelationRoute } from "./speaker-relation-rules.js";

const PH3_004 = ["He said I am {N}.", "She told us, I'm {N}.", "He said: I am {N}, and left.", "People go, I am {N}, and stall.", "I was told my name is {N}.",
  "Do you think I am {N}?", "I am, {N}, still waiting for the slides."];
const NAMES_004 = ["Nikhil", "Rashi", "Sumit", "Nupur", "Priya", "Kshitij", "Anisha", "Jubin", "Sonal", "Ruby", "Makrand Rajadhyaksha", "Mumbai Sharma", "Doris Day", "Prasanti"];
const FAMILIES: [string, string][] = [
  ["question", "Do you think I am {N}?"], ["question", "Am I {N}?"], ["question", "Is my name {N}?"], ["hypothetical", "If I were {N}, I would resign."],
  ["hypothetical", "Suppose I am {N}."], ["hypothetical", "I wonder whether I am {N}."], ["negation", "I am not {N}."], ["negation", "I'm no {N}."],
  ["negation", "Please don't call me {N}."], ["address", "I am, {N}, still waiting for the slides."], ["address", "I am. {N}, are you there?"],
  ["relation", "I am {N}'s colleague."], ["relation", "I am with {N}."], ["relation", "I am next to {N}."], ["relation", "This is for {N}."],
  ["relation", "I am sure {N} will join."], ["relation", "I am glad {N} is here."], ["reported", "I told them I was told my name is {N}."],
  ["quoted", "The slide shows “My name is {N}.”"], ["quoted", "She wrote: my name is {N}."],
];
const mk = (rows: [string, string][]): Turns[] => rows.map(([ref, text], i) => ({ _id: `t${i + 1}`, tenantId: "t", sessionId: "s", speakerRef: ref, tStart: 0, tEnd: 0, text }) as Turns);
const replies = (json: unknown): SpeakersCompleteFn => async () => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 }) as CompleteResult;
const F = "I think so, yes.";
/** The binding-rule layouts. `owns`: the labelled speaker really spoke T (so a genuine T may ship); otherwise it must NEVER ship. */
const BIND: { id: string; rows: (T: string) => [string, string][]; label: string; cite: string; owns: boolean }[] = [
  { id: "own turn cited", rows: (T) => [["spk:0", T], ["spk:0", F], ["spk:1", "ok"]], label: "spk:0", cite: "t1", owns: true },
  { id: "neighbour cited, same label", rows: (T) => [["spk:0", T], ["spk:0", F], ["spk:1", "ok"]], label: "spk:0", cite: "t2", owns: true },
  { id: "neighbour cited (other label's turn), same label", rows: (T) => [["spk:0", T], ["spk:1", "ok"]], label: "spk:0", cite: "t2", owns: true },
  { id: "label = speaker, citing the next block", rows: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]], label: "spk:1", cite: "t2", owns: true },
  { id: "boundary: T last in the block, citing the first turn", rows: (T) => [["spk:0", F], ["spk:0", T], ["spk:1", "ok"]], label: "spk:0", cite: "t1", owns: true },
  { id: "boundary: T last in the block, citing the next block", rows: (T) => [["spk:0", F], ["spk:0", T], ["spk:1", "ok"]], label: "spk:0", cite: "t3", owns: true },
  { id: "boundary: T first in the block, label = speaker, citing the preceding turn", rows: (T) => [["spk:1", "ok"], ["spk:0", F], ["spk:1", T]], label: "spk:1", cite: "t2", owns: true },
  { id: "DIFFERENT label: T is spk:1's, proposal spk:0, T cited", rows: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]], label: "spk:0", cite: "t1", owns: false },
  { id: "DIFFERENT label: T is spk:1's, proposal spk:0, filler cited", rows: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]], label: "spk:0", cite: "t2", owns: false },
  { id: "DIFFERENT label: T follows spk:0's block", rows: (T) => [["spk:0", F], ["spk:1", T], ["spk:0", "ok"]], label: "spk:0", cite: "t2", owns: false },
];
const shipped = async (b: (typeof BIND)[number], T: string, N: string): Promise<boolean> =>
  (await extractSpeakers(mk(b.rows(T)), replies([{ speakerRef: b.label, displayName: N, turnIds: [b.cite] }]))).resolved.some((r) => r.displayName === N && r.speakerRef === b.label);
const lanePredicate = (T: string, N: string) => looksLikeAName(N) && !isDiscourseOnly(N) && (citesNameAsSelfIdentification(T, N) || citesNameAsHandover(T, N) || citesNameAsThanks(T, N));

test("D-015 ISS-PH3-004: the 7 recorded forms x 14 names (98 texts) are refused at predicate level", () => {
  const open = NAMES_004.flatMap((N) => PH3_004.map((s) => s.replaceAll("{N}", N)).filter((T) => lanePredicate(T, N)));
  console.log(`D-015 ISS-PH3-004 predicate: refused ${98 - open.length}/98`);
  assert.deepEqual(open, []);
});

test("D-015 ISS-PH3-004: the same 98 texts end to end, every binding layout (10): 0 shipped", async () => {
  const open: string[] = [];
  let n = 0;
  for (const b of BIND) for (const N of NAMES_004) for (const s of PH3_004) { n++; const T = s.replaceAll("{N}", N); if (await shipped(b, T, N)) open.push(`${b.id} | ${T}`); }
  console.log(`D-015 ISS-PH3-004 end to end: refused ${n - open.length}/${n}`);
  assert.deepEqual(open.slice(0, 20), []);
});

test("cycle-4 families, each refused at predicate level and end to end in every layout", async () => {
  const open: string[] = [];
  for (const [fam, s] of FAMILIES) for (const N of ["Nikhil", "Makrand Rajadhyaksha"]) {
    const T = s.replaceAll("{N}", N);
    if (lanePredicate(T, N)) open.push(`predicate ${fam} | ${T}`);
    for (const b of BIND) if (await shipped(b, T, N)) open.push(`${b.id} ${fam} | ${T}`);
  }
  assert.deepEqual(open.slice(0, 20), []);
});

test("block-binding rule: a genuine self-identification binds ONLY the label that spoke it, whichever turn the model cites", async () => {
  for (const T of ["My name is Nikhil and I lead admissions.", "Hi all, Nikhil here.", "Hello, I'm Nikhil.", "Hello everyone, I would like to introduce myself, I'm Nikhil.",
    "Before I invite our next speaker, I should say: call me Nikhil."]) for (const b of BIND) {
    assert.equal(await shipped(b, T, "Nikhil"), b.owns, `${b.id} | ${T}`);
  }
});

test("accepted on purpose (recall kept): I would like to introduce myself, I'm X; places and roles under an explicit self-naming cue (D-052)", () => {
  for (const [T, N] of [["Hello everyone, I would like to introduce myself, I'm Ruby.", "Ruby"], ["Hello, I'm Google.", "Google"], ["I am Moderator today.", "Moderator"],
    ["Hi, this is Mumbai Sharma.", "Mumbai Sharma"]] as [string, string][]) assert.equal(citesNameAsSelfIdentification(T, N), true, T);
});

test("ISS-PH3-005: guards are route-independent -- quoted and reported speech are refused for EVERY route, before any pattern", () => {
  const cases: [RelationRoute, string][] = [
    ["selfIdentification", "He said I am Nikhil."], ["selfIdentification", 'He said "My name is Nikhil."'], ["handover", "He said over to you, Nikhil, and left."],
    ["handover", 'She said "Over to you, Nikhil."'], ["thanks", "Thank you, Nikhil, he said."], ["thanks", "Thank you, Nikhil, she told me."],
  ];
  for (const [route, T] of cases) for (const at of nameOccurrences(T, "Nikhil")) assert.equal(occurrenceAccepted(route, T, "Nikhil", at), false, `${route} | ${T}`);
  // the seam is not vacuous: unreported, a handover and a thanks pass the guards when asked for directly
  assert.equal(occurrenceAccepted("handover", "Over to you, Nikhil.", "Nikhil", 13), true);
  assert.equal(occurrenceAccepted("thanks", "Thank you, Nikhil.", "Nikhil", 11), true);
});

test("forced ON (the seam ignores the switch): quoted, reported, place-governed and function-word cases stay refused on handover and thanks", () => {
  const ths = ["He said over to you, {N}, and left.", "Someone said: over to you, {N}.", 'She said "{N}, what do you think?"', "They were like, thank you {N}.", "‘Over to you, {N}’, he said.",
    "Thank you, {N}, he said.", "Our students in {N} were great. Over to you, {N}.", "Thank you, {N}, for hosting us. Our students in {N} were great."];
  const leaks: string[] = [];
  for (const N of ["Nikhil", "Paris", "Not", "To", "Welcome"]) for (const s of ths) {
    const T = s.replaceAll("{N}", N);
    for (const route of ["handover", "thanks"] as const) for (const at of nameOccurrences(T, N)) if (occurrenceAccepted(route, T, N, at) && (!looksLikeAName(N) || isDiscourseOnly(N) || /said|like|"|‘/.test(T) || (N === "Paris" && /students in/.test(T)))) leaks.push(`${route} | ${T}`);
  }
  assert.deepEqual(leaks, []);
});

test("ISS-PH3-005: no production module imports the test seam, and the predicates and the gate take no route override", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const users = walk(root).filter((p) => /\.(ts|mts)$/.test(p) && !/\.test\.ts$/.test(p) && !p.includes("frozen-base") && readFileSync(p, "utf8").includes("occurrenceAccepted"));
  assert.deepEqual(users.map((p) => p.replace(/\\/g, "/").split("/").pop()), ["speaker-relation-rules.ts"]);
  assert.equal(citesNameAsSelfIdentification.length, 2); assert.equal(citesNameAsHandover.length, 2); assert.equal(citesNameAsThanks.length, 2);
  assert.equal(relationGate.length, 3);
  assert.equal(relationGate("handover", "Over to you, Nikhil.", "Nikhil"), false);
  assert.equal(Object.isFrozen(RELATION_ROUTES), true);
});
