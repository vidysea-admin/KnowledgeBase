/**
 * packages/index/src/pipeline/speaker-name-rules.test.ts — the LEDGER REGRESSION CORPORA.
 *
 * Split out of `speakers-llm.test.ts` when that file crossed the 400-line budget, along the same
 * seam as the source split: these are the recorded attack and recall sets for the name rules, and
 * they exist because of D-015 — a fix must be measured against its issue's OWN recorded cases, not
 * a corpus its author chose.
 *
 * Both directions are pinned here on purpose. Cycle 2 of this seam measured refusal against the
 * ledger and recall against 14 self-chosen probes, claimed "zero recall loss", and had in fact
 * dropped ten recorded introductions. Refusal and recall are asserted together so tightening one
 * at the other's cost fails loudly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";

import { extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const replies = (json: unknown): SpeakersCompleteFn => async () => completion("", json);

/**
 * ISS-093's OWN recorded corpus, transcribed verbatim from its `qa/issues.jsonl` evidence field.
 *
 * Required by D-015. Cycle 3 of this seam added the discourse denylist, measured 12/12 against a
 * corpus the maker authored that same cycle, and reported it -- while ISS-093's own 20 cases gave
 * 15/20 and still shipped `person:not` from "I am Not sure about that.". `not` was named by that
 * exact word in the issue's fix_direction. A fix measured against a corpus its own author chose is
 * marking homework with an easier exam.
 *
 * Four cases are deliberately NOT closed and are asserted as still-shipping so the number stays
 * honest: India, Mumbai, Google, English are proper nouns, not discourse words. No pattern
 * separates a city or a company from a person -- that needs a gazetteer, and the model, not this
 * module, is the layer that should decline to propose them. They are carried to the apply unit.
 *
 * Current standing: ISS-093: 17/20 refused, 3 open (all gazetteer-class).
 *
 * "English" was in that residue set until the cycle-1 checker showed it was NOT gazetteer-bound:
 * in "English speaking students may apply." the `speaking` cue is a participial modifier, not the
 * self-identification idiom, and the distinction is candidate-independent ("Prasanti speaking
 * students may apply." is not a naming construction either). ISS-097. Writing it off as
 * unreachable was my error, and pinning it as expected-shipping entrenched it.
 */
const ISS_093_CORPUS: [string, string][] = [
  ["Hello Everyone, thanks for joining.", "Everyone"],
  ["Welcome Everyone to the session.", "Everyone"],
  ["Hey Everyone welcome aboard.", "Everyone"],
  ["Thanks All for being here.", "All"],
  ["Hi Guys, let us start.", "Guys"],
  ["Hi There, can you hear me?", "There"],
  ["Welcome Back to the second session.", "Back"],
  ["Welcome To the annual conference.", "To"],
  ["Thank you So much everyone.", "So"],
  ["I'm Sorry about the delay.", "Sorry"],
  ["I am Not sure about that.", "Not"],
  ["That's Great news for us.", "Great"],
  ["This is Important for all of you.", "Important"],
  ["Thank you Monday for the slot.", "Monday"],
  ["Monday with us marks the deadline.", "Monday"],
  ["Welcome Diwali celebrations this week.", "Diwali"],
  ["This is India speaking on the panel.", "India"],
  ["Coming up next, Mumbai from the west zone.", "Mumbai"],
  ["Google here has an announcement.", "Google"],
  ["English speaking students may apply.", "English"],
];

/** The four ISS-093 cases that remain open by design -- proper nouns, not discourse words. */
const ISS_093_GAZETTEER = new Set(["India", "Mumbai", "Google"]);

for (const [text, name] of ISS_093_CORPUS) {
  const expectedRefusal = !ISS_093_GAZETTEER.has(name);
  test(`ISS-093 corpus: ${JSON.stringify(name)} in ${JSON.stringify(text)} is ${expectedRefusal ? "refused" : "a known gazetteer residue"}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    if (expectedRefusal) {
      assert.deepEqual(resolved, [], `${JSON.stringify(name)} is a discourse word, not a person`);
    } else {
      // Asserted as still-shipping ON PURPOSE. If a later unit closes it, this test fails and
      // forces the count in the manifest to be corrected upward -- the number cannot silently rot.
      assert.equal(resolved.length, 1, `${JSON.stringify(name)} is a documented open residue; if it now refuses, update the ISS-093 count`);
    }
  });
}

/**
 * ISS-098's ten recorded recall regressions, verbatim from its `qa/issues.jsonl` evidence field.
 *
 * The cycle-2 `speaking` gate refused all ten. They are the self-identification idiom the cue
 * exists to admit, and the suite could not see the loss: reverting the whole gate reddened exactly
 * ONE test, so the gate was fully measured on refusal and completely unmeasured on recall.
 *
 * The manifest claimed "zero recall loss: all 14 probes correct". That was false, and the 14 probes
 * were ones I chose -- the same self-selected-denominator habit D-015 exists to stop, pointed at
 * recall instead of refusal. These cases are the checker's, not mine, which is the point.
 */
for (const text of [
  "Ruby speaking here.",
  "Ruby speaking and I lead admissions.",
  "Ruby speaking today from Pune.",
  "Ruby speaking again.",
  "Ruby speaking now.",
  "Ruby speaking -- good to be here.",
  "Ruby speaking as the panel chair.",
  "Ruby speaking (admissions).",
  "Ruby speaking\u2026 thanks all.",
  "Ruby speaking over Zoom.",
]) {
  test(`ISS-098 recall: still resolves ${JSON.stringify(text)}`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] },
    ]));
    assert.equal(resolved.length, 1, "the `speaking` idiom must keep resolving");
    assert.equal(resolved[0]?.personId, "person:ruby");
  });
}

test("ISS-098: a bare noun after `speaking` declines the cue WITHOUT vetoing later branches", async () => {
  // The cycle-2 bug was an unconditional early return: the speaking branch refused the whole
  // predicate, so no later cue could fire. Here the participle declines but the address comma
  // still supplies a cue, which only works if the branch falls through.
  const { resolved } = await extractSpeakers(
    [turn("t1", "spk:0", "Prasanti, what do you think of English speaking students?")],
    replies([{ speakerRef: "spk:0", displayName: "Prasanti", turnIds: ["t1"] }]),
  );
  assert.equal(resolved.length, 1, "a declining speaking branch must not veto the address cue");
});

/**
 * ISS-255's own recorded reproductions (from its qa/issues.jsonl evidence field, measured live
 * 2026-09-21 on the visa session). The handover-inversion is the defect: a turn that ANNOUNCES
 * the next speaker must not credit that name to the CURRENT label.
 */
test("ISS-255: a moderator's handover turn does NOT ship the introduced name as the moderator", async () => {
  // The exact recorded case: spk:0's own turn invites the next speaker, Ruby.
  const text =
    "Thank you, Shagun. In the essence of time, again, I invite our next speaker, Ruby, from " +
    "Uni-Italia, to take us forward and with the understanding of visa process in Italy.";
  const { resolved } = await extractSpeakers([turn("t205", "spk:0", text)], replies([
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t205"] },
  ]));
  assert.deepEqual(resolved, [], "the handover inversion must be refused, not shipped");
});

test("ISS-255: the handover still lets the REAL speaker self-name in their own turn", async () => {
  // Ground truth from the same session: spk:2's turn self-names; the handover must not stop that.
  const turns = [
    turn("t205", "spk:0", "I invite our next speaker, Ruby, from Uni-Italia, to take us forward."),
    turn("t206", "spk:2", "Thank you. Hello everyone. My name is Ruby. I work at Uni-Italia."),
  ];
  const { resolved } = await extractSpeakers(turns, replies([
    { speakerRef: "spk:2", displayName: "Ruby", turnIds: ["t206"] },
    { speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t205"] },
  ]));
  const ruby = resolved.find((r) => r.displayName === "Ruby");
  assert.ok(ruby, "Ruby still resolves");
  assert.equal(ruby?.speakerRef, "spk:2", "and via the SELF-NAMING label, never the moderator");
});

test("ISS-255: handover markers do not block genuine direct self-naming in the same turn", async () => {
  // "call me" + handover marker both present: the self-naming branch must survive the gate.
  const { resolved } = await extractSpeakers(
    [turn("t1", "spk:0", "Before I invite our next speaker, I should say: call me Ruby.")],
    replies([{ speakerRef: "spk:0", displayName: "Ruby", turnIds: ["t1"] }]),
  );
  assert.equal(resolved.length, 1, "self-naming overrides the handover refusal");
});

/**
 * ISS-104 cycle 4 — D-015, ENFORCED BY THE SUITE rather than by good intentions.
 *
 * D-015 exists because cycle 3 measured 12/12 against a 12-case corpus it authored that same
 * cycle while the ledger's own 20 gave 15/20. The rule was then written down, and the corpus
 * above was transcribed by hand — which leaves the identical failure one careless edit away: drop
 * a row, soften a string, and the suite goes green against a smaller exam with nobody the wiser.
 *
 * So the corpus is checked against the ledger itself. This test reads ISS-104's own `evidence`
 * field out of `qa/issues.jsonl` (per D-019, the union of the canonical file and any lane shards),
 * re-parses its recorded reproductions, and asserts the array above is byte-identical in content
 * and order. A future cycle can no longer quietly shrink its denominator: it fails here first.
 *
 * ISS-104 is the ledger id; it was filed as ISS-093 on `lane/a-speakers` and the row's
 * `id_collision` field records the renumber, which is why the constant above keeps the old name
 * and every manifest in this seam cites both.
 */
test("D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  // walk up from this test file to the repo root (the directory that owns `qa/`)
  let root = dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 12 && !existsIn(root, "qa"); hop++) root = dirname(root);
  function existsIn(dir: string, child: string): boolean {
    try { return readdirSync(dir).includes(child); } catch { return false; }
  }
  assert.ok(existsIn(root, "qa"), "repo root with qa/ must be findable from the test file");

  const qa = join(root, "qa");
  const shards = readdirSync(qa).filter((f) => f === "issues.jsonl" || /^issues\..+\.jsonl$/.test(f));
  assert.ok(shards.length > 0, "at least the canonical ledger must exist");

  let row: { evidence: string } | undefined;
  for (const shard of shards) {
    for (const line of readFileSync(join(qa, shard), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { id?: string; evidence?: string };
      if (parsed.id === "ISS-104" && typeof parsed.evidence === "string") row = { evidence: parsed.evidence };
    }
  }
  assert.ok(row, "ISS-104 must be present in the ledger union (D-019)");

  // Recorded shape, verbatim from the evidence field: "TEXT"/"NAME"->person:id
  const recorded = [...row.evidence.matchAll(/"([^"]+)"\/"([^"]+)"->person:/g)].map(
    (m) => [m[1]!, m[2]!] as [string, string],
  );
  assert.equal(recorded.length, 20, "ISS-104 records exactly 20 reproductions");
  assert.deepEqual(
    ISS_093_CORPUS,
    recorded,
    "the in-file corpus must equal the ledger's own cases, in order — substituting a corpus is the D-015 defect",
  );
});

/**
 * ISS-104 cycle 4 — the CLOSED-CLASS ENUMERATION, one standing case per class.
 *
 * The chargeable half of ISS-104 was `not`, a negation particle; the six rounds before this one
 * each added the single word they were shown. Adding `not` alone would have been the seventh.
 * Measured instead: of 406 words enumerated from the closed classes of English, 277 were absent
 * from `NEVER_A_PERSON` and ALL 277 shipped a fabricated person — every one through this exact
 * `"I am <Word> sure about that."` shape, the one ISS-104 recorded for `Not`.
 *
 * What is pinned here is the CLASS, not the words: one representative per class, so a future
 * refactor that drops a class reddens a named test instead of quietly reopening a whole grammar
 * category. The full 406 are the audit in the manifest; these are the sentinels.
 */
const CLOSED_CLASS_SENTINELS: [string, string[]][] = [
  ["pronoun (reflexive/possessive)", ["Myself", "Theirs", "Itself"]],
  ["pronoun (indefinite)", ["Anything", "Another", "Nothing"]],
  ["interrogative / relative", ["Whom", "Whatever", "Which"]],
  ["conjunction / conjunctive adverb", ["Because", "However", "Although"]],
  ["preposition", ["Between", "Despite", "Towards", "Via"]],
  ["auxiliary / modal", ["Should", "Might", "Been"]],
  ["adverbial particle", ["Away", "Together", "Aside"]],
  ["negator", ["Nowhere", "Nope"]],
  ["degree / focusing adverb", ["Hardly", "Entirely", "Rather"]],
  ["deictic / temporal adverb", ["Tonight", "Already", "Always"]],
  ["numeral / ordinal", ["Seven", "Twelve", "Third"]],
  ["greeting / farewell", ["Namaste", "Goodbye", "Cheers"]],
  ["acknowledgement", ["Indeed", "Certainly", "Noted"]],
  ["interjection / filler", ["Hmm", "Oops", "Wow"]],
  ["evaluative response", ["Perfect", "Brilliant", "Awesome"]],
  ["calendar term", ["Weekend", "Hour", "Year"]],
];

for (const [className, words] of CLOSED_CLASS_SENTINELS) {
  for (const word of words) {
    test(`ISS-104 closed class — ${className}: refuses ${JSON.stringify(word)}`, async () => {
      const text = `I am ${word} sure about that.`;
      const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
        { speakerRef: "spk:0", displayName: word, turnIds: ["t1"] },
      ]));
      assert.deepEqual(resolved, [], `${word} is a ${className}, not a person`);
    });
  }
}

/**
 * ISS-104 cycle 4 — the NAME-COLLISION COST, pinned in both directions so it stays visible.
 *
 * `will`, `can`, `dare`, `need`, `day` and `true` are closed-class words that are also attested
 * personal names, so a BARE single-token "Will" is now refused. That cost is deliberate — C12
 * makes these guards the only barrier against a fabricated identity, so refusal is the safe
 * direction of error, and `may`/`march`/`june`/`august` have carried the same cost as month names
 * since cycle 3. It is pinned rather than merely documented because a silent recall loss is
 * exactly what ISS-098 was.
 *
 * The bound on the cost is `isDiscourseOnly`'s ALL-tokens rule: multi-token names are untouched.
 * If a later cycle changes that to ANY-token, the second test here goes red immediately.
 */
test("ISS-104 collision cost: a bare closed-class name is refused (accepted, documented)", async () => {
  const { resolved } = await extractSpeakers([turn("t1", "spk:0", "My name is Will and I lead admissions.")], replies([
    { speakerRef: "spk:0", displayName: "Will", turnIds: ["t1"] },
  ]));
  assert.deepEqual(resolved, [], "bare 'Will' is refused — the accepted cost of the modal class");
});

for (const [text, name] of [
  ["My name is Will Smith and I lead admissions.", "Will Smith"],
  ["Good morning Doris Day, please go ahead.", "Doris Day"],
  ["This is Can Ozturk from the Istanbul office.", "Can Ozturk"],
] as [string, string][]) {
  test(`ISS-104 collision bound: multi-token ${JSON.stringify(name)} still resolves`, async () => {
    const { resolved } = await extractSpeakers([turn("t1", "spk:0", text)], replies([
      { speakerRef: "spk:0", displayName: name, turnIds: ["t1"] },
    ]));
    assert.equal(resolved.length, 1, "isDiscourseOnly requires EVERY token — a real surname rescues the name");
    assert.equal(resolved[0]?.displayName, name);
  });
}
