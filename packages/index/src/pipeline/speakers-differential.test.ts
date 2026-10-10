/**
 * packages/index/src/pipeline/speakers-differential.test.ts -- fix cycle 3 (ISS-PH3-001 / ISS-PH3-002, critical).
 *
 * THE INVARIANT: for every input, the lane accepts a name only if the BASE code (536a56a) would have accepted it,
 * or the acceptance is on the enumerated ALLOW-LIST below. Cycle 2 claimed the new predicates "can only narrow"
 * without ever running the base beside them; 432 of 2640 end-to-end cases then shipped on the lane and not on the base.
 *
 * Base side: a FROZEN VERBATIM COPY of 536a56a's speaker-name-rules / speaker-name-data / speakers-llm in
 * ./frozen-base-536a56a/ (.mts, so the loc and dupes lints and tsc do not see them; never imported by production
 * code). Chosen over a golden table because the end-to-end decision depends on the whole base extractSpeakers.
 * Regenerate: `git show 536a56a:packages/index/src/pipeline/<f>.ts` for the three files, then see the .mts headers.
 *
 * Grid: NAMES x TEMPLATES x LAYOUTS x CITES, at predicate level and end to end through extractSpeakers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { extractSpeakers as laneExtract, type SpeakersCompleteFn } from "./speakers-llm.js";
import { looksLikeAName, isDiscourseOnly, citesNameAsAnIntroduction } from "./speaker-name-rules.js";
import { citesNameAsSelfIdentification, citesNameAsHandover, citesNameAsThanks, RELATION_ROUTES, type RelationRoute } from "./speaker-relation-rules.js";

const FROZEN = "./frozen-base-536a56a/";
const baseExtract = (await import(new URL(`${FROZEN}speakers-llm.mts`, import.meta.url).href)).extractSpeakers as typeof laneExtract;
const baseRules = await import(new URL(`${FROZEN}speaker-name-rules.mts`, import.meta.url).href);

// persons, places, organisations, function words, calendar/festival words, and a multi-token name
const NAMES = ["Nikhil", "Rashi", "Sumit", "Nupur", "Priya", "Kshitij", "Anisha", "Jubin", "Sonal", "Bhavya", "Prasanti", "Ruby", "Makrand Rajadhyaksha", "Mumbai Sharma",
  "Paris", "Mumbai", "India", "Delhi", "London", "Dubai", "Google", "Amazon", "Vidysea", "English", "Diwali", "Monday", "Everyone", "Team", "Not", "To", "Welcome", "Sorry"];
/** t: tag. r = quoted/reported speech (third-party routes must NEVER bind), p = place-governed occurrence in the turn. */
const TEMPLATES: { s: string; t?: "r" | "p" }[] = [
  { s: "My name is {N} and I lead admissions." }, { s: "Hi all, {N} here." }, { s: "Good morning everyone, {N} speaking." }, { s: "This is {N} speaking on the panel." },
  { s: "I am {N} from the admissions team." }, { s: "Hello, I'm {N}." }, { s: "I do see {N} here, welcome." }, { s: "English speaking {N} may apply." },
  { s: "Good morning {N}, please go ahead." }, { s: "{N}, what do you think about this?" }, { s: "Hi, {N}." }, { s: "Welcome {N} to the conference." },
  { s: "Thanks all. Over to you, {N}." }, { s: "Coming up next, {N} from the west zone." }, { s: "I invite our next speaker, {N}, from Uni-Italia." },
  { s: "Please welcome {N}." }, { s: "Let me introduce {N}." }, { s: "Welcome to the {N} office. Over to you, {N}." }, { s: "Over to you, {N}." },
  { s: "Thank you, {N}." }, { s: "Thank you, {N}, for hosting us. Our students in {N} were great.", t: "p" }, { s: "Thanks a lot, {N}, and welcome." },
  { s: "Our students in {N} were great. Over to you, {N}.", t: "p" }, { s: "I'm in {N} today and my name is {N}.", t: "p" }, { s: "{N} here has an announcement." },
  { s: "He said over to you, {N}, and left.", t: "r" }, { s: "Someone said: over to you, {N}.", t: "r" }, { s: "The chair told me earlier that it was over to you, {N}.", t: "r" },
  { s: 'She said "{N}, what do you think?"', t: "r" }, { s: "They were like, thank you {N}.", t: "r" }, { s: "According to Ravi, over to you, {N}.", t: "r" },
  { s: "‘Over to you, {N}’, he said.", t: "r" }, { s: "«Over to you, {N}.» was the line.", t: "r" }, { s: "'Thank you, {N}.' That is what he said.", t: "r" },
  { s: "People often go, “{N}, what do you think”, and stall.", t: "r" }, { s: "He told us: thank you, {N}, for that.", t: "r" },
  { s: "Thank you, {N}, he said.", t: "r" }, { s: "Everybody keeps asking me, “{N}, what do you think?”", t: "r" }, { s: "She added that it is over to you, {N}.", t: "r" },
  { s: "I heard hand over to {N} yesterday.", t: "r" },
];
type Layout = { id: string; turns: (T: string) => [string, string][] };
const F = "I think so, yes.";
const LAYOUTS: Layout[] = [
  { id: "same-turn", turns: (T) => [["spk:0", T], ["spk:1", "ok"]] },
  { id: "own-block-other-turn", turns: (T) => [["spk:0", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "preceding-turn", turns: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "following-turn", turns: (T) => [["spk:1", "ok"], ["spk:0", F], ["spk:1", T]] },
  { id: "both-neighbours", turns: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", T]] },
];
const mk = (rows: [string, string][]): Turns[] => rows.map(([ref, text], i) => ({ _id: `t${i + 1}`, tenantId: "t", sessionId: "s", speakerRef: ref, tStart: 0, tEnd: 0, text }) as Turns);
const replies = (json: unknown): SpeakersCompleteFn => async () => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 }) as CompleteResult;
const multi = (n: string) => n.includes(" ");
const baseCue = (T: string, N: string): boolean => looksLikeAName(N) && !isDiscourseOnly(N) && citesNameAsAnIntroduction(T, N);
const laneCue = (T: string, N: string, routes?: Record<RelationRoute, boolean>): boolean => looksLikeAName(N) && !isDiscourseOnly(N) &&
  (citesNameAsSelfIdentification(T, N, routes) || citesNameAsHandover(T, N, routes) || citesNameAsThanks(T, N, routes));

/**
 * ALLOW-LIST (the only lane-only acceptances permitted, end to end): OWN_BLOCK_SELF_ID. The label's OWN block holds a
 * turn T that the BASE accepts when cited directly (same-turn layout), and the model cited a different turn of that
 * block (or one that merely sits next to it). Same turn, same cue, same protections; only the CITATION differs, and
 * the name is shipped for the label that spoke T. Layouts where T belongs to ANOTHER speaker are never allowed.
 */
const OWN_LAYOUTS = ["same-turn", "own-block-other-turn"];
const allowed = (layout: string, baseSameTurnAccepts: boolean): string | null => (OWN_LAYOUTS.includes(layout) && baseSameTurnAccepts ? "OWN_BLOCK_SELF_ID" : null);

test("differential (predicate level): the lane accepts NOTHING the base cue refused", () => {
  const bad: string[] = [];
  let cells = 0, laneAccepts = 0, baseAccepts = 0;
  for (const N of NAMES) for (const { s } of TEMPLATES) {
    const T = s.replaceAll("{N}", N); cells++;
    const [b, l] = [baseCue(T, N), laneCue(T, N)];
    if (b) baseAccepts++;
    if (l) laneAccepts++;
    if (l && !b) bad.push(`${N} | ${T}`);
  }
  console.log(`DIFF predicate: ${cells} cells, base accepts ${baseAccepts}, lane accepts ${laneAccepts}, lane-only ${bad.length}`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} inputs accepted on the lane and refused on the base`);
});

test("differential: the frozen base is the base (guard against a stale fixture)", () => {
  for (const [T, N] of [["Coming up next, Mumbai from the west zone.", "Mumbai"], ["My name is Ruby.", "Ruby"], ["Over to you, Nikhil.", "Nikhil"]] as [string, string][]) {
    assert.equal(baseRules.citesNameAsAnIntroduction(T, N), citesNameAsAnIntroduction(T, N), `${N}: frozen base and production base cue must agree`);
  }
});

test("differential (end to end through extractSpeakers): every lane-only acceptance is on the allow-list", async () => {
  const bad: string[] = [], classes = new Map<string, number>();
  let cells = 0, laneShips = 0, baseShips = 0, baseOnly = 0;
  const ships = async (ex: typeof laneExtract, turns: Turns[], N: string, cite: string): Promise<boolean> =>
    (await ex(turns, replies([{ speakerRef: "spk:0", displayName: N, turnIds: [cite] }]))).resolved.some((r) => r.speakerRef === "spk:0" && r.displayName === N);
  for (const N of NAMES) for (const { s } of TEMPLATES) {
    const T = s.replaceAll("{N}", N);
    const direct = await ships(baseExtract, mk(LAYOUTS[0]!.turns(T)), N, "t1");
    for (const L of LAYOUTS) {
      const turns = mk(L.turns(T));
      const spk0 = turns.findIndex((t) => t.speakerRef === "spk:0");
      const tIdx = turns.findIndex((t) => t.text === T);
      const cites = [...new Set([`t${tIdx + 1}`, `t${spk0 + 1}`, `t${turns.length}`])];
      for (const cite of cites) {
        cells++;
        const [b, l] = [await ships(baseExtract, turns, N, cite), await ships(laneExtract, turns, N, cite)];
        if (b) baseShips++;
        if (l) laneShips++;
        if (b && !l) baseOnly++;
        if (l && !b) {
          const cls = allowed(L.id, direct);
          if (cls) classes.set(cls, (classes.get(cls) ?? 0) + 1);
          else bad.push(`${L.id} cite=${cite} | ${N} | ${T}`);
        }
      }
    }
  }
  const allowCount = [...classes.values()].reduce((a, c) => a + c, 0);
  console.log(`DIFF end-to-end: ${cells} cells, base ships ${baseShips}, lane ships ${laneShips}, lane-only ${bad.length + allowCount} (on allow-list ${allowCount} ${JSON.stringify([...classes])}, NOT allowed ${bad.length}), base-only (recall lost) ${baseOnly}`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} lane-only acceptances are not on the allow-list`);
});

test("production routes: self-identification ON, handover and thanks OFF (re-enable only after the live gate)", () => {
  assert.deepEqual({ ...RELATION_ROUTES }, { selfIdentification: true, handover: false, thanks: false });
});

test("forced ON (what re-enabling would do): quoted, reported, place-governed and function-word cases are still refused", () => {
  const ON = { selfIdentification: true, handover: true, thanks: true };
  const leaks: string[] = [], open: string[] = [];
  for (const N of NAMES) for (const { s, t } of TEMPLATES) {
    const T = s.replaceAll("{N}", N);
    const thirdParty = citesNameAsHandover(T, N, ON) || citesNameAsThanks(T, N, ON);
    if (!thirdParty) continue;
    if (!looksLikeAName(N) || isDiscourseOnly(N) || t === "r" || (t === "p" && !multi(N))) leaks.push(`${N} | ${T}`);
    else if (!baseCue(T, N)) open.push(N);
  }
  console.log(`DIFF forced-ON: ${open.length} third-party acceptances the base refused remain (e.g. ${[...new Set(open)].slice(0, 8).join(", ")}): why the routes stay OFF`);
  assert.deepEqual(leaks.slice(0, 30), [], "a protected case leaked through the gate");
});
