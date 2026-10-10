/**
 * packages/index/src/pipeline/speakers-differential.test.ts -- fix cycle 4 (ISS-PH3-004 critical, ISS-PH3-005 low).
 *
 * THE INVARIANT: the lane may ship a name only if (1) the BASE (536a56a) ships the same cell, or (2) the shipment is in
 * the ONE class the lane is allowed to add, defined POSITIVELY by `oracle()` below: a clean first-person
 * self-identification, spoken by the bound label in its OWN turn, not quoted, not reported, not a question, negation,
 * address or relation. Cycle 3's allow-list was "anything the base accepts when the model cites the turn directly",
 * which includes the base's own wrong acceptances ("He said I am Nikhil."), so it could not see ISS-PH3-004.
 *
 * The oracle is written for this test and is deliberately simple and strict: whole-turn anchored regexes plus a ban
 * list. It calls NOTHING from the code under test, so a regression in the production predicates cannot move it.
 * Cycle 4 asserts the stronger statement: EVERY lane shipment (not just the lane-only ones) is in the oracle class.
 *
 * Base side: a FROZEN VERBATIM COPY of 536a56a's speaker-name-rules / speaker-name-data / speakers-llm in
 * ./frozen-base-536a56a/ (.mts, never imported by production code). This file imports only extractSpeakers and the
 * public predicates, so it also runs unchanged against the cycle-3 sources (the mutation proof in the manifest).
 *
 * Grid: NAMES x TEMPLATES x LAYOUTS x proposed LABEL (spk:0 and spk:1) x EVERY cited turn, end to end through extractSpeakers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { extractSpeakers as laneExtract, type SpeakersCompleteFn } from "./speakers-llm.js";
import { looksLikeAName, isDiscourseOnly, citesNameAsAnIntroduction } from "./speaker-name-rules.js";
import { citesNameAsSelfIdentification, citesNameAsHandover, citesNameAsThanks, RELATION_ROUTES } from "./speaker-relation-rules.js";

const FROZEN = "./frozen-base-536a56a/";
const baseExtract = (await import(new URL(`${FROZEN}speakers-llm.mts`, import.meta.url).href)).extractSpeakers as typeof laneExtract;
const baseRules = await import(new URL(`${FROZEN}speaker-name-rules.mts`, import.meta.url).href);

const PERSONS = ["Nikhil", "Rashi", "Priya", "Makrand Rajadhyaksha", "Mumbai Sharma"];
const NOT_PERSONS = ["Paris", "India", "Google", "Moderator", "Diwali", "English", "Everyone", "Not", "Sorry"];
const NAMES = [...PERSONS, ...NOT_PERSONS];
/** f: family. "genuine" is the only family the oracle accepts; the lane must never ship any other. */
const TEMPLATES: { s: string; f: string }[] = [
  { s: "My name is {N} and I lead admissions.", f: "genuine" }, { s: "Hi all, {N} here.", f: "genuine" }, { s: "Good morning everyone, {N} speaking.", f: "genuine" },
  { s: "I am {N} from the admissions team.", f: "genuine" }, { s: "Hello, I'm {N}.", f: "genuine" }, { s: "This is {N} speaking on the panel.", f: "genuine" },
  { s: "Call me {N}.", f: "genuine" }, { s: "They call me {N}.", f: "genuine" },
  { s: "He said I am {N}.", f: "reported" }, { s: "She told us, I'm {N}.", f: "reported" }, { s: "He said: I am {N}, and left.", f: "reported" },
  { s: "People go, I am {N}, and stall.", f: "reported" }, { s: "She wrote: my name is {N}.", f: "reported" }, { s: "They were like, I'm {N}.", f: "reported" },
  { s: "I was told my name is {N}.", f: "hearsay" }, { s: "My colleague says my name is {N}.", f: "hearsay" }, { s: "Apparently I am {N}.", f: "hearsay" },
  { s: 'He said "I am {N}"', f: "quoted-reported" }, { s: "The slide shows “My name is {N}.”", f: "quoted" }, { s: "The banner reads: «Hi all, {N} here»", f: "quoted" },
  { s: "Then 'I'm {N}' appears on screen.", f: "quoted" }, { s: "Our form has a field “I am {N}” on top.", f: "quoted" },
  { s: "Do you think I am {N}?", f: "question" }, { s: "Am I {N}?", f: "question" }, { s: "Is my name {N}?", f: "question" }, { s: "What if I am {N}?", f: "question" },
  { s: "If I were {N}, I would resign.", f: "hypothetical" }, { s: "Suppose I am {N}.", f: "hypothetical" }, { s: "I wonder whether I am {N}.", f: "hypothetical" },
  { s: "I am not {N}.", f: "negation" }, { s: "I'm no {N}.", f: "negation" }, { s: "My name is not {N}.", f: "negation" }, { s: "Please don't call me {N}.", f: "negation" },
  { s: "I am, {N}, still waiting for the slides.", f: "address" }, { s: "Hello, {N}, can you hear me?", f: "address" },
  { s: "I am {N}'s colleague.", f: "relation" }, { s: "I am with {N}.", f: "relation" }, { s: "I am next to {N}.", f: "relation" }, { s: "This is {N}'s view.", f: "relation" },
  { s: "This is for {N}.", f: "relation" }, { s: "I am sure {N} will join.", f: "relation" }, { s: "I am glad {N} is here.", f: "relation" },
  { s: "This is {N} Sharma's view.", f: "relation" },
  { s: "Good morning {N}, please go ahead.", f: "third-party" }, { s: "{N}, what do you think about this?", f: "third-party" }, { s: "Hi, {N}.", f: "third-party" },
  { s: "Over to you, {N}.", f: "third-party" }, { s: "Thank you, {N}.", f: "third-party" }, { s: "Let me introduce {N}.", f: "third-party" },
  { s: "I do see {N} here, welcome.", f: "third-party" }, { s: "{N} here has an announcement.", f: "third-party" }, { s: "English speaking {N} may apply.", f: "third-party" },
];
type Layout = { id: string; turns: (T: string) => [string, string][] };
const F = "I think so, yes.";
const LAYOUTS: Layout[] = [
  { id: "own-turn", turns: (T) => [["spk:0", T], ["spk:1", "ok"]] },
  { id: "own-first-of-block", turns: (T) => [["spk:0", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "own-last-of-block (boundary)", turns: (T) => [["spk:0", F], ["spk:0", T], ["spk:1", "ok"]] },
  { id: "preceding-turn", turns: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "following-turn", turns: (T) => [["spk:1", "ok"], ["spk:0", F], ["spk:1", T]] },
  { id: "both-neighbours", turns: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", T]] },
  { id: "between-blocks", turns: (T) => [["spk:0", F], ["spk:1", T], ["spk:0", "ok"]] },
];
const mk = (rows: [string, string][]): Turns[] => rows.map(([ref, text], i) => ({ _id: `t${i + 1}`, tenantId: "t", sessionId: "s", speakerRef: ref, tStart: 0, tEnd: 0, text }) as Turns);
const replies = (json: unknown): SpeakersCompleteFn => async () => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 }) as CompleteResult;

/**
 * THE ORACLE (independent of production code). Returns the form id when `T` is, as a WHOLE turn, a clean first-person
 * self-identification of `N`: an optional greeting, then exactly one listed form with the name directly after the cue;
 * and the turn holds no quote mark, question mark, or reporting / hedging / negation word. Otherwise null.
 */
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GREET = "(?:(?:Hi|Hello|Hey)(?: all| everyone)?, |Good (?:morning|afternoon|evening)(?: everyone| all)?, )?";
const BANNED = /[?"“”„«»‘’]|(?:^|[\s(])'|'(?:[\s.,!)]|$)|\b(?:said|says|told|tell|wrote|go|goes|went|like|think|thought|if|not|no|never|wish|suppose|whether|wonder|apparently|were)\b|n't\b/i;
function oracle(T: string, N: string): string | null {
  if (BANNED.test(T)) return null;
  const n = esc(N), END = "(?:[ .!]|$)";
  const forms: [string, string][] = [["my-name-is", `My name is ${n}${END}`], ["i-am", `(?:I am|I'm) ${n}${END}`], ["call-me", `(?:Call me|They call me) ${n}${END}`],
    ["x-here", `${n} here(?:[.!,]|$)`], ["x-speaking", `${n} speaking(?:[.!,]|$)`], ["this-is-speaking", `This is ${n} speaking${END}`]];
  return forms.find(([, body]) => new RegExp(`^${GREET}${body}`).test(T))?.[0] ?? null;
}

test("oracle self-check: it accepts the genuine forms and rejects every other family (a weak oracle would make the test vacuous)", () => {
  for (const { s, f } of TEMPLATES) for (const N of ["Nikhil", "Makrand Rajadhyaksha"]) {
    const got = oracle(s.replaceAll("{N}", N), N);
    assert.equal(got !== null, f === "genuine", `${f}: ${s.replaceAll("{N}", N)} -> ${got}`);
  }
});

const baseCue = (T: string, N: string): boolean => looksLikeAName(N) && !isDiscourseOnly(N) && citesNameAsAnIntroduction(T, N);
const laneCue = (T: string, N: string): boolean => looksLikeAName(N) && !isDiscourseOnly(N) &&
  (citesNameAsSelfIdentification(T, N) || citesNameAsHandover(T, N) || citesNameAsThanks(T, N));

test("differential (predicate level): the lane accepts nothing the base cue refused, and only oracle-clean turns", () => {
  const bad: string[] = [];
  let cells = 0, laneAccepts = 0, baseAccepts = 0;
  for (const N of NAMES) for (const { s } of TEMPLATES) {
    const T = s.replaceAll("{N}", N); cells++;
    const [b, l] = [baseCue(T, N), laneCue(T, N)];
    if (b) baseAccepts++;
    if (l) laneAccepts++;
    if (l && !b) bad.push(`not-in-base | ${N} | ${T}`);
    if (l && oracle(T, N) === null) bad.push(`not-oracle | ${N} | ${T}`);
  }
  console.log(`DIFF predicate: ${cells} cells, base accepts ${baseAccepts}, lane accepts ${laneAccepts}, violations ${bad.length}`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} predicate acceptances outside the base or outside the oracle class`);
});

test("differential: the frozen base is the base (guard against a stale fixture)", () => {
  for (const [T, N] of [["Coming up next, Mumbai from the west zone.", "Mumbai"], ["My name is Ruby.", "Ruby"], ["Over to you, Nikhil.", "Nikhil"]] as [string, string][]) {
    assert.equal(baseRules.citesNameAsAnIntroduction(T, N), citesNameAsAnIntroduction(T, N), `${N}: frozen base and production base cue must agree`);
  }
});

test("differential (end to end through extractSpeakers): every lane shipment is a clean self-identification by the label's OWN turn", async () => {
  const bad: string[] = [], classes = new Map<string, number>();
  let cells = 0, laneShips = 0, baseShips = 0, laneOnly = 0, baseOnly = 0;
  const run = async (ex: typeof laneExtract, turns: Turns[], label: string, N: string, cite: string) =>
    (await ex(turns, replies([{ speakerRef: label, displayName: N, turnIds: [cite] }]))).resolved.find((r) => r.speakerRef === label && r.displayName === N);
  for (const N of NAMES) for (const { s } of TEMPLATES) {
    const T = s.replaceAll("{N}", N);
    for (const L of LAYOUTS) {
      const turns = mk(L.turns(T));
      for (const label of ["spk:0", "spk:1"]) for (let c = 1; c <= turns.length; c++) {
        cells++;
        const [b, l] = [await run(baseExtract, turns, label, N, `t${c}`), await run(laneExtract, turns, label, N, `t${c}`)];
        if (b) baseShips++;
        if (b && !l) baseOnly++;
        if (!l) continue;
        laneShips++;
        const forms = l.evidence.map((e) => { const t = turns.find((x) => x._id === e.turnId); return t && t.speakerRef === label ? oracle(t.text, N) : null; });
        if (l.evidence.length === 0 || forms.some((f) => f === null)) { bad.push(`${L.id} label=${label} cite=t${c} | ${N} | ${T}`); continue; }
        if (!b) {
          laneOnly++;
          const cls = `${forms[0]} / ${PERSONS.includes(N) ? "person" : "place-org-role"}`;
          classes.set(cls, (classes.get(cls) ?? 0) + 1);
        }
      }
    }
  }
  console.log(`DIFF end-to-end: ${cells} cells, base ships ${baseShips}, lane ships ${laneShips}, lane-only ${laneOnly} ${JSON.stringify([...classes].sort())}, outside the oracle class ${bad.length}, base-only (recall lost) ${baseOnly}`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} lane shipments are outside the one allowed class`);
});

test("production routes: self-identification ON, handover and thanks OFF, and the table is frozen (ISS-PH3-005)", () => {
  assert.deepEqual({ ...RELATION_ROUTES }, { selfIdentification: true, handover: false, thanks: false });
  assert.equal(Object.isFrozen(RELATION_ROUTES), true);
  assert.throws(() => { (RELATION_ROUTES as Record<string, boolean>).handover = true; }, TypeError);
  assert.equal(RELATION_ROUTES.handover, false);
});
