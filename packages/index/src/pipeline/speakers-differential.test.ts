/**
 * packages/index/src/pipeline/speakers-differential.test.ts -- fix cycle 5 (ISS-PH3-006 critical; cycle 4: ISS-PH3-004/005).
 *
 * THE INVARIANT: every name the lane ships must be backed by evidence in the ONE class the lane is allowed to add, defined
 * POSITIVELY by `oracle()` below: a turn that is a member of a tiny GENERATED set of clean first-person self-introductions
 * (opener, cue, exactly one name, optional closed tail, optional opener-only sentence before and first-person sentence
 * after), spoken by the bound label itself. Everything else in the grid is must-refuse by construction: there is no
 * deny-list here to be outflanked. Cycle 4's oracle was strict but its grid had no multi-clause, framed, trailing-
 * attribution, role-play, reading-aloud, Hindi-mixed or two-name turns, so it could not see ISS-PH3-006; those shapes
 * (every recorded ISS-PH3-006 form, plus families) are templates below.
 *
 * The oracle calls NOTHING from production and does not copy its allow-list table: it enumerates strings.
 * Base side: a FROZEN VERBATIM COPY of 536a56a (./frozen-base-536a56a/, .mts, never imported by production code).
 *
 * Grid: NAMES x TEMPLATES x 8 LAYOUTS x proposed LABEL (spk:0, spk:1) x EVERY cited turn, end to end through extractSpeakers.
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
/** f: family. "genuine*" is the only family the oracle accepts; the lane must never ship evidence of any other. */
const TEMPLATES: { s: string; f: string }[] = [
  { s: "My name is {N} and I lead admissions.", f: "genuine" }, { s: "Hi all, {N} here.", f: "genuine" }, { s: "Good morning everyone, {N} speaking.", f: "genuine" },
  { s: "I am {N} from the admissions team.", f: "genuine" }, { s: "Hello, I'm {N}.", f: "genuine" }, { s: "Hello, I’m {N}.", f: "genuine" },
  { s: "This is {N} speaking.", f: "genuine-multi" }, { s: "Hi everyone. I'm {N}. We will start soon.", f: "genuine" }, { s: "Thank you. Hello everyone. My name is {N}. I work at Uni-Italia.", f: "genuine" },
  { s: "Before I invite our next speaker, I should say: call me {N}.", f: "genuine" }, { s: "I am {N} and today we will discuss admissions.", f: "genuine" },
  { s: "Call me {N}.", f: "call-me" }, { s: "They call me {N}.", f: "call-me" },
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
  // ISS-PH3-006, every recorded form verbatim (checker cycle 4)
  { s: "I am {N}, he said.", f: "p6-recorded" }, { s: "As he put it yesterday when we spoke about the visa process, I am {N}.", f: "p6-recorded" }, { s: "His words: I am {N}.", f: "p6-recorded" },
  { s: "Quote, I am {N}, unquote.", f: "p6-recorded" }, { s: "Reading the question from Priya: I am {N}", f: "p6-recorded" }, { s: "For instance, my name is {N}.", f: "p6-recorded" },
  { s: "Take the case where I am {N}.", f: "p6-recorded" }, { s: "Their message: I am {N}.", f: "p6-recorded" }, { s: "The email starts with I am {N}.", f: "p6-recorded" },
  { s: "Try repeating after me: My name is {N}.", f: "p6-recorded" }, { s: "Repeat after me, I am {N}.", f: "p6-recorded" }, { s: "I am {N} in the movie.", f: "p6-recorded" },
  { s: "I am {N} in the play.", f: "p6-recorded" }, { s: "Usne kaha I am {N}.", f: "p6-recorded" }, { s: "Woh bol raha tha my name is {N}.", f: "p6-recorded" },
  { s: "Maine nahi kaha, my name is {N}.", f: "p6-recorded" }, { s: "Main nahi hoon, I am {N} ka friend.", f: "p6-recorded" },
  { s: "I am Rashi and this is {N}.", f: "p6-two-name" }, { s: "I am {N} and this is Priya.", f: "p6-two-name" }, { s: "My name is {N} and over to Priya.", f: "p6-two-name" },
  // families around them: multi-clause, trailing attribution, framing across a full stop, role-play, reading aloud, Hindi-mixed, filler
  { s: "Repeat after me. I am {N}.", f: "p6-frame-stop" }, { s: "Quote. I am {N}.", f: "p6-frame-stop" }, { s: "He said hello. I am {N}.", f: "p6-frame-stop" },
  { s: "Reading aloud from the script. My name is {N}.", f: "p6-frame-stop" }, { s: "I am {N}. That is what he said.", f: "p6-trailing" }, { s: "I am {N}. Those were his words.", f: "p6-trailing" },
  { s: "My name is {N}. Unquote.", f: "p6-trailing" }, { s: "Say after me: I'm {N}.", f: "p6-recorded" }, { s: "Playing the host, I am {N}.", f: "p6-roleplay" },
  { s: "In the role play I am {N}.", f: "p6-roleplay" }, { s: "Mera naam {N} hai.", f: "p6-hindi" }, { s: "Main {N} hoon, I am {N}.", f: "p6-hindi" },
  { s: "I'm {N}, yeah.", f: "p6-filler" }, { s: "I'm {N}, um, and welcome.", f: "p6-filler" }, { s: "Namaste, usne bola I'm {N}.", f: "p6-hindi" },
];
type Layout = { id: string; turns: (T: string, N: string) => [string, string][] };
const F = "I think so, yes.";
const LAYOUTS: Layout[] = [
  { id: "own-turn", turns: (T) => [["spk:0", T], ["spk:1", "ok"]] },
  { id: "own-first-of-block", turns: (T) => [["spk:0", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "own-last-of-block (boundary)", turns: (T) => [["spk:0", F], ["spk:0", T], ["spk:1", "ok"]] },
  { id: "preceding-turn", turns: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", "ok"]] },
  { id: "following-turn", turns: (T) => [["spk:1", "ok"], ["spk:0", F], ["spk:1", T]] },
  { id: "both-neighbours", turns: (T) => [["spk:1", T], ["spk:0", F], ["spk:1", T]] },
  { id: "between-blocks", turns: (T) => [["spk:0", F], ["spk:1", T], ["spk:0", "ok"]] },
  { id: "own-block-third-person-mention", turns: (T, N) => [["spk:1", T], ["spk:0", `I think ${N} is not having any questions.`], ["spk:1", "ok"]] },
];
const mk = (rows: [string, string][]): Turns[] => rows.map(([ref, text], i) => ({ _id: `t${i + 1}`, tenantId: "t", sessionId: "s", speakerRef: ref, tStart: 0, tEnd: 0, text }) as Turns);
const replies = (json: unknown): SpeakersCompleteFn => async () => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 }) as CompleteResult;

/**
 * THE ORACLE (independent of production code): membership in a small GENERATED set. A turn is a clean self-introduction of N
 * iff it equals BEFORE + OPENER + FORM(N) + TAIL + END + AFTER for one choice from each list below. Nothing else is.
 */
const OPENERS = ["", "Hi, ", "Hello, ", "Hello everyone, ", "Hi all, ", "Good morning everyone, ", "Namaste, "];
const BEFORE = ["", "Hi everyone. ", "Thank you. Hello everyone. "];
const AFTER = ["", " I work at Uni-Italia.", " We will start soon."];
const TAILS = ["", " from the admissions team", " from Vidysea", " and I lead admissions", " and today we will discuss admissions"];
const cache = new Map<string, Set<string>>();
function genuineSet(N: string): Set<string> {
  const hit = cache.get(N);
  if (hit) return hit;
  const forms = [`My name is ${N}`, `I am ${N}`, `I'm ${N}`, `I’m ${N}`, `${N} here`, `${N} speaking`, ...(N.includes(" ") ? [`This is ${N}`, `This is ${N} speaking`] : [])];
  const out = new Set<string>();
  for (const b of BEFORE) for (const o of OPENERS) for (const f of forms) for (const t of TAILS) for (const e of ["", ".", "!"]) for (const a of AFTER) out.add(`${b}${o}${f}${t}${e}${a}`);
  out.add(`Before I invite our next speaker, I should say: call me ${N}.`);
  cache.set(N, out);
  return out;
}
const oracle = (T: string, N: string): boolean => genuineSet(N).has(T);

test("oracle self-check: it accepts the genuine templates and rejects every other family (a weak oracle would make the test vacuous)", () => {
  for (const { s, f } of TEMPLATES) for (const N of ["Nikhil", "Makrand Rajadhyaksha"]) {
    const T = s.replaceAll("{N}", N);
    assert.equal(oracle(T, N), f === "genuine" || (f === "genuine-multi" && N.includes(" ")), `${f}: ${T}`);
  }
});

const baseCue = (T: string, N: string): boolean => looksLikeAName(N) && !isDiscourseOnly(N) && citesNameAsAnIntroduction(T, N);
const laneCue = (T: string, N: string): boolean => looksLikeAName(N) && !isDiscourseOnly(N) &&
  (citesNameAsSelfIdentification(T, N) || citesNameAsHandover(T, N) || citesNameAsThanks(T, N));

test("differential (predicate level): the lane accepts nothing outside the oracle class, and nothing the base cue refused (curly typography aside)", () => {
  const bad: string[] = [];
  let cells = 0, laneAccepts = 0, baseAccepts = 0;
  for (const N of NAMES) for (const { s } of TEMPLATES) {
    const T = s.replaceAll("{N}", N); cells++;
    const [b, l] = [baseCue(T, N), laneCue(T, N)];
    if (b) baseAccepts++;
    if (l) laneAccepts++;
    if (l && !b && !T.includes("’")) bad.push(`not-in-base | ${N} | ${T}`);
    if (l && !oracle(T, N)) bad.push(`not-oracle | ${N} | ${T}`);
  }
  console.log(`DIFF predicate: ${cells} cells, base accepts ${baseAccepts}, lane accepts ${laneAccepts}, violations ${bad.length}`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} predicate acceptances outside the base or outside the oracle class`);
});

test("differential: the frozen base is the base (guard against a stale fixture)", () => {
  for (const [T, N] of [["Coming up next, Mumbai from the west zone.", "Mumbai"], ["My name is Ruby.", "Ruby"], ["Over to you, Nikhil.", "Nikhil"]] as [string, string][]) {
    assert.equal(baseRules.citesNameAsAnIntroduction(T, N), citesNameAsAnIntroduction(T, N), `${N}: frozen base and production base cue must agree`);
  }
});

test("differential (end to end through extractSpeakers): every lane shipment is backed by an oracle-class self-introduction spoken by the label itself", async () => {
  const bad: string[] = [], classes = new Map<string, number>();
  let cells = 0, laneShips = 0, baseShips = 0, laneOnly = 0, baseOnly = 0;
  const run = async (ex: typeof laneExtract, turns: Turns[], label: string, N: string, cite: string) =>
    (await ex(turns, replies([{ speakerRef: label, displayName: N, turnIds: [cite] }]))).resolved.find((r) => r.speakerRef === label && r.displayName === N);
  for (const N of NAMES) for (const { s } of TEMPLATES) {
    const T = s.replaceAll("{N}", N);
    for (const L of LAYOUTS) {
      const turns = mk(L.turns(T, N));
      for (const label of ["spk:0", "spk:1"]) for (let c = 1; c <= turns.length; c++) {
        cells++;
        const [b, l] = [await run(baseExtract, turns, label, N, `t${c}`), await run(laneExtract, turns, label, N, `t${c}`)];
        if (b) baseShips++;
        if (b && !l) baseOnly++;
        if (!l) continue;
        laneShips++;
        const ok = l.evidence.length > 0 && l.evidence.every((e) => { const t = turns.find((x) => x._id === e.turnId); return !!t && t.speakerRef === label && oracle(t.text, N); });
        if (!ok) { bad.push(`${L.id} label=${label} cite=t${c} | ${N} | ${T}`); continue; }
        if (!b) { laneOnly++; const k = PERSONS.includes(N) ? "person" : "place-org-role"; classes.set(k, (classes.get(k) ?? 0) + 1); }
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
