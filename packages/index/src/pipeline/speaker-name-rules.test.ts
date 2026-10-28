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
 *
 * W-S step 1 (2026-10-28): the ISS-098/110 `speaking` cases, the ISS-255 handover cases and the ISS-104
 * closed-class/collision cases moved, assertion for assertion, to speaker-name-rules-{speaking,handover,closed-class}.test.ts.
 * This file keeps what shares ISS_093_CORPUS: the LLM-path replay, the ledger-fidelity check and the predicate replay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";

import { extractSpeakersRuleBased as extractSpeakers, type SpeakersCompleteFn } from "./speakers-llm.js";
import { citesNameAsAnIntroduction, isDiscourseOnly, looksLikeAName } from "./speaker-name-rules.js";

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
 * ONE case is deliberately NOT closed and is asserted as still-shipping so the number stays honest:
 * "This is India speaking on the panel." is not separable from "This is Rahul speaking on the
 * panel." by anything inside the sentence, and the place signal (D-052 ruling 2) needs a locative
 * frame that this turn does not supply. Its GENERALISATION is closed -- "Our students in India.
 * India speaking on the panel." refuses -- which is the honest boundary of a contextual signal.
 *
 * Current standing: ISS-093 (= ISS-104): 20/20 refused through the LLM path AND 20/20 at the bare naming-cue predicate
 * (replayed below). India was the last open row at the predicate: "X speaking" now needs X to OPEN its clause.
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

/**
 * The ISS-093 cases that remain open. Mumbai and Google left this set in cycle 5 (handover / third-party
 * deictic, ISS-255). ISS-282 c1b closed "India": "This is India speaking" -- "X speaking" binds only when
 * X opens a clause, so nothing is left open through the LLM path.
 */
const ISS_093_GAZETTEER = new Set<string>();

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
      // Only the ISS-104 row is parsed. An unrelated shard row that is not valid JSON (e.g. the bad
      // escape in qa/issues.webhigh.jsonl line 2) must not fail THIS test; a malformed ISS-104 row still throws.
      if (!/"id"\s*:\s*"ISS-104"/.test(line)) continue;
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
 * ISS-104, D-015 -- the SAME 20 recorded reproductions replayed at the bare naming-cue predicate (shape guard, discourse
 * guard, cue), with no extractSpeakers allow-list in front of it. The rule must never ship a fabricated person by itself:
 * the relation rules call `hasNamingCueAt` directly, so a hole here is a hole there. Before this unit 19/20 refused here
 * and "This is India speaking on the panel." shipped person:india.
 */
for (const [text, name] of ISS_093_CORPUS) {
  test(`ISS-104 predicate corpus: ${JSON.stringify(name)} in ${JSON.stringify(text)} is refused`, () => {
    assert.equal(looksLikeAName(name) && !isDiscourseOnly(name) && citesNameAsAnIntroduction(text, name), false);
  });
}
