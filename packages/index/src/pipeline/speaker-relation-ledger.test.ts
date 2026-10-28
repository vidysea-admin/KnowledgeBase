/**
 * packages/index/src/pipeline/speaker-relation-ledger.test.ts -- fix cycle 3, D-015: each ledger row's OWN recorded
 * reproductions, verbatim, at BOTH levels (predicate, and end to end through extractSpeakers) and in the layouts the
 * checker used (the text as the label's own turn, as the PRECEDING turn, as the FOLLOWING turn).
 * Rows: ISS-104 (20 recorded attacks), ISS-PH3-001 (reported speech), ISS-PH3-002 (place / organisation on the relation
 * route). ISS-093's 20 and ISS-282's 8 stay asserted in speaker-name-rules.test.ts and speakers-windows.test.ts.
 * Also pins the possessive exemption of `readsAsAPlaceOrOrg` (mutation M7 survived every test in cycle 2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { extractSpeakersRuleBased as extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";
import { looksLikeAName, isDiscourseOnly, citesNameAsAnIntroduction, nameOccurrences } from "./speaker-name-rules.js";
import { citesNameAsSelfIdentification, citesNameAsHandover, citesNameAsThanks } from "./speaker-relation-rules.js";

const ISS_104: [string, string][] = [
  ["Hello Everyone, thanks for joining.", "Everyone"], ["Welcome Everyone to the session.", "Everyone"], ["Hey Everyone welcome aboard.", "Everyone"],
  ["Thanks All for being here.", "All"], ["Hi Guys, let us start.", "Guys"], ["Hi There, can you hear me?", "There"], ["Welcome Back to the second session.", "Back"],
  ["Welcome To the annual conference.", "To"], ["Thank you So much everyone.", "So"], ["I'm Sorry about the delay.", "Sorry"], ["I am Not sure about that.", "Not"],
  ["That's Great news for us.", "Great"], ["This is Important for all of you.", "Important"], ["Thank you Monday for the slot.", "Monday"],
  ["Monday with us marks the deadline.", "Monday"], ["Welcome Diwali celebrations this week.", "Diwali"], ["This is India speaking on the panel.", "India"],
  ["Coming up next, Mumbai from the west zone.", "Mumbai"], ["Google here has an announcement.", "Google"], ["English speaking students may apply.", "English"],
];
const PH3_001: [string, string][] = [
  ["He said over to you, Nikhil, and left.", "Nikhil"], ["Someone said: over to you, Nikhil.", "Nikhil"],
  ["The chair told me earlier that it was over to you, Nikhil.", "Nikhil"],
];
const PH3_002_PRECEDING: [string, string][] = [
  ["Coming up next, Mumbai from the west zone.", "Mumbai"], ["Welcome to the Mumbai office. Over to you, Mumbai.", "Mumbai"], ["Over to you, India.", "India"],
];
const PH3_002_FOLLOWING: [string, string][] = [
  ["Thank you, Paris, for hosting us. Our students in Paris were great.", "Paris"], ["Thank you, Google.", "Google"], ["Thank you, Amazon.", "Amazon"],
];

const mk = (rows: [string, string][]): Turns[] => rows.map(([ref, text], i) => ({ _id: `t${i + 1}`, tenantId: "t", sessionId: "s", speakerRef: ref, tStart: 0, tEnd: 0, text }) as Turns);
const replies = (json: unknown): SpeakersCompleteFn => async () => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 }) as CompleteResult;
const LAYOUTS: Record<string, (T: string) => [string, string][]> = {
  "own turn": (T) => [["spk:0", T], ["spk:1", "ok"]],
  "preceding turn": (T) => [["spk:1", T], ["spk:0", "I think so, yes."], ["spk:1", "ok"]],
  "following turn": (T) => [["spk:1", "ok"], ["spk:0", "I think so, yes."], ["spk:1", T]],
};
const shipped = async (T: string, N: string, layout: string): Promise<boolean> => {
  const turns = mk(LAYOUTS[layout]!(T));
  const cite = `t${turns.findIndex((t) => t.text === T) + 1}`;
  return (await extractSpeakers(turns, replies([{ speakerRef: "spk:0", displayName: N, turnIds: [cite] }]))).resolved.some((r) => r.displayName === N);
};
const lanePredicate = (T: string, N: string) => looksLikeAName(N) && !isDiscourseOnly(N) &&
  (citesNameAsSelfIdentification(T, N) || citesNameAsHandover(T, N) || citesNameAsThanks(T, N));

test("D-015 ISS-104: the row's 20 recorded attacks, predicate level: 20/20 refused (including 'This is India speaking')", () => {
  const open = ISS_104.filter(([T, N]) => lanePredicate(T, N)).map(([T]) => T);
  console.log(`D-015 ISS-104 predicate: refused ${20 - open.length}/20`);
  assert.deepEqual(open, []);
});

for (const layout of Object.keys(LAYOUTS)) {
  test(`D-015 ISS-104: the 20 recorded attacks end to end, layout "${layout}": 0 shipped`, async () => {
    const out: string[] = [];
    for (const [T, N] of ISS_104) if (await shipped(T, N, layout)) out.push(`${N} | ${T}`);
    console.log(`D-015 ISS-104 end-to-end ${layout}: refused ${20 - out.length}/20`);
    assert.deepEqual(out, []);
  });
}

test("D-015 ISS-PH3-001 (reported speech): every recorded case refused, predicate and end to end, all layouts", async () => {
  for (const [T, N] of PH3_001) {
    assert.equal(lanePredicate(T, N), false, T);
    for (const layout of Object.keys(LAYOUTS)) assert.equal(await shipped(T, N, layout), false, `${layout}: ${T}`);
  }
});

test("D-015 ISS-PH3-002 (place / organisation on the relation route): every recorded case refused, predicate and end to end", async () => {
  for (const [T, N] of [...PH3_002_PRECEDING, ...PH3_002_FOLLOWING]) {
    assert.equal(lanePredicate(T, N), false, T);
    for (const layout of Object.keys(LAYOUTS)) assert.equal(await shipped(T, N, layout), false, `${layout}: ${T}`);
  }
});

test("M7 (cycle-2 checker): the possessive exemption in readsAsAPlaceOrOrg is an EQUIVALENT mutant -- nameOccurrences already drops \"Priya's\"", () => {
  // "'" and the curly apostrophe are NAME_JOINERS, so a possessive is never a whole-name occurrence and the exemption branch is
  // unreachable: removing it cannot change behaviour. What actually protects "at Priya's desk" is pinned here instead.
  const text = "At Priya's desk, Priya here.";
  assert.deepEqual(nameOccurrences(text, "Priya"), [text.lastIndexOf("Priya")]);
  assert.equal(citesNameAsAnIntroduction(text, "Priya"), true);
  assert.equal(citesNameAsSelfIdentification(text, "Priya"), false, "cycle 5: the free clause \"At Priya's desk,\" before the cue is not an opener");
  assert.equal(citesNameAsAnIntroduction("Our students in Priya were many, Priya here.", "Priya"), false, "a non-possessive governed occurrence DOES demote the weak cue");
});

test("quoted speech never binds on ANY route, including self-identification (the base accepted these)", () => {
  for (const text of ['He said "my name is Ruby and I lead admissions."', "She says “hi all, Ruby here.”", "Then «My name is Ruby», he said."]) {
    assert.equal(citesNameAsAnIntroduction(text, "Ruby"), true, `base accepts: ${text}`);
    assert.equal(citesNameAsSelfIdentification(text, "Ruby"), false, `lane refuses: ${text}`);
  }
});
