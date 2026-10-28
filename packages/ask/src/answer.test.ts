/**
 * packages/ask/src/answer.test.ts — T-005b C5. `answer` generates from refined context via the
 * injected `complete` and passes `sources` through unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeComplete } from "./testUtils.js";
import { answer } from "./answer.js";
import { BoundedAskError } from "./source-context.js";
import { contextStrips, type ContextSource } from "./bounded-refine.js";
import type { CompleteFn } from "./select-nodes.js";

test("answer generates from refined context and passes sources through unchanged", async () => {
  const complete = fakeComplete({ text: "Apples are red." });
  const sources = { internal: [{ node_id: "n1" }], web: [] };
  const result = await answer("what color are apples?", "Apples are red.", sources, complete);

  assert.equal(result.text, "Apples are red.");
  assert.equal(result.sources, sources, "sources object identity must pass through unchanged");
  assert.equal(complete.calls.length, 1);
  assert.match(complete.calls[0]!.messages[0]!.content, /Apples are red\./);
  assert.match(complete.calls[0]!.messages[0]!.content, /what color are apples\?/);
});

// D-191: the grounding judge drops only the sentences it rejects; refuse only if none remain.

const sources: ContextSource[] = ["A", "B", "C"].map((k) => ({ id: "src-" + k, origin: "speech", text: "Fact " + k + " is explicit." }));
const strips = JSON.stringify(contextStrips(sources));
const result = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
const SENTENCES = [
  { text: "Sentence about A.", sourceIds: ["src-A"] },
  { text: "Sentence about B.", sourceIds: ["src-B"] },
  { text: "Sentence about C.", sourceIds: ["src-C"] },
];
function run(decisions: unknown) {
  const complete: CompleteFn = async (job) => job.kind === "ask.answer" ? result({ sentences: SENTENCES }) : (job.kind === "ask.answer_grounding" ? result(decisions) : result({}));
  return answer("q", strips, { internal: [] }, complete, { boundedSources: sources });
}
const dec = (id: number, supported: unknown, answersQuery: unknown) => ({ id: "sentence-" + id, supported, answersQuery });

test("mixed decisions keep only supported+relevant sentences and count the rest", async () => {
  const r = await run({ decisions: [dec(0, true, true), dec(1, false, true), dec(2, true, false)] });
  assert.equal(r.text, "Sentence about A.");
  assert.equal(r.removedSentences, 2);
  const kept = await run({ decisions: [dec(0, true, true), dec(1, false, true), dec(2, true, true)] });
  assert.equal(kept.text, "Sentence about A.\nSentence about C.");
  assert.equal(kept.removedSentences, 1);
});
test("all supported removes nothing", async () => {
  const r = await run({ decisions: [dec(0, true, true), dec(1, true, true), dec(2, true, true)] });
  assert.equal(r.removedSentences, 0);
  assert.equal(r.text.split("\n").length, 3);
});
test("nothing supported refuses with the same code", async () => {
  await assert.rejects(run({ decisions: [dec(0, false, true), dec(1, true, false), dec(2, false, false)] }),
    (e: unknown) => e instanceof BoundedAskError && e.code === "source_context_unavailable" && /support or relevance/.test(e.message));
});
test("missing, malformed, unknown or duplicate decisions drop the sentence (fail closed)", async () => {
  const r = await run({ decisions: [dec(0, true, true), dec(1, "true", true), { id: "ghost", supported: true, answersQuery: true }, dec(2, true, true), dec(2, true, true)] });
  assert.equal(r.text, "Sentence about A.", "string 'true' and duplicated id are not accepted");
  assert.equal(r.removedSentences, 2);
  const missing = await run({ decisions: [dec(1, true, true)] });
  assert.equal(missing.text, "Sentence about B.");
  await assert.rejects(run({ decisions: "nope" }), BoundedAskError);
  await assert.rejects(run({}), BoundedAskError);
  await assert.rejects(run({ decisions: [null, 5, { supported: true, answersQuery: true }] }), BoundedAskError);
});
test("dropped sentences leave no text or source id in the returned answer", async () => {
  const r = await run({ decisions: [dec(0, false, true), dec(1, true, true), dec(2, false, false)] });
  assert.deepEqual(Object.keys(r).sort(), ["removedSentences", "sources", "text"]);
  assert.ok(!/A\.|C\.|src-A|src-C/.test(JSON.stringify(r)));
  assert.equal(r.text, "Sentence about B.");
});
