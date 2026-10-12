/**
 * U2.4 suggested speaker names (D-141, pending append): the generation side. Offline: fake proposer + fake verifier, no network.
 * Pins: suggestions are single-verified only; the auto-final path stays pair mode; the flag is OFF by default; quote+kind travel;
 * a rejected (label, person) is not re-suggested; a suggestion never leaks into `resolved`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { extractSpeakersGrounded, selectSuggestions } from "./speakers-grounded.js";
import { buildSuggestionDocs, suggestionId } from "./speaker-suggestions.js";
import type { SpeakerVerifier } from "./speakers-verifier.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
const completion = (json: unknown): CompleteResult => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const prop = (label: string, name: string, evidenceQuote: string, evidenceKind: string) => ({ label, name, evidenceQuote, evidenceKind });
const YES: SpeakerVerifier = async () => ({ verdict: "yes" });
const NO: SpeakerVerifier = async () => ({ verdict: "no" });
const proposer = (entries: unknown[]) => async (_job: Job): Promise<CompleteResult> => completion(entries);

// spk:1 is introduced ONCE by the host right before its block: single evidence (no independent second witness).
const SINGLE = [
  turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?"),
  turn("t1", "spk:1", "I think they are slow to apply."),
  turn("t2", "spk:2", "Next topic please."),
];
const QA = "Priya Nair, what do you think about the new rules";
const ONE = [prop("spk:1", "Priya Nair", QA, "called-on")];

// spk:1 has an independent pair: called on before, thanked after, by a different speaker.
const PAIR = [
  turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?"),
  turn("t1", "spk:1", "I think they are slow to apply."),
  turn("t2", "spk:3", "Thank you, Priya Nair, that was really helpful."),
  turn("t3", "spk:2", "Next topic please."),
];
const BOTH = [prop("spk:1", "Priya Nair", QA, "called-on"), prop("spk:1", "Priya Nair", "Thank you, Priya Nair, that was really helpful", "thanks")];

test("flag OFF (default): single evidence ships NOTHING, and no `suggested` key exists", async () => {
  const out = await extractSpeakersGrounded(SINGLE, proposer(ONE), { verifier: YES });
  assert.deepEqual(out.resolved, []);
  assert.equal("suggested" in out, false);
});

test("flag ON: single verified evidence becomes a SUGGESTION with its quote and kind, and is NOT in `resolved`", async () => {
  const out = await extractSpeakersGrounded(SINGLE, proposer(ONE), { verifier: YES, suggest: true });
  assert.deepEqual(out.resolved, [], "the auto-final path stays pair mode: one witness is not enough");
  assert.equal(out.suggested?.length, 1);
  const s = out.suggested![0]!;
  assert.deepEqual([s.speakerRef, s.displayName, s.personId], ["spk:1", "Priya Nair", "person:priya-nair"]);
  assert.deepEqual(s.provenance.map((p) => [p.turnId, p.evidenceQuote, p.evidenceKind]), [["t0", QA, "called-on"]]);
});

test("flag ON but the verifier says no: nothing suggested", async () => {
  const out = await extractSpeakersGrounded(SINGLE, proposer(ONE), { verifier: NO, suggest: true });
  assert.deepEqual(out.suggested, []);
});

test("an independent pair is auto-FINAL and is not also suggested", async () => {
  const out = await extractSpeakersGrounded(PAIR, proposer(BOTH), { verifier: YES, suggest: true });
  assert.equal(out.resolved.length, 1);
  assert.deepEqual(out.suggested, []);
});

test("deterministic grounding still gates suggestions: a paraphrased quote and a two-name quote yield no suggestion", async () => {
  const paraphrase = [prop("spk:1", "Priya Nair", "Priya Nair, what is your view on the rules", "called-on")];
  assert.deepEqual((await extractSpeakersGrounded(SINGLE, proposer(paraphrase), { verifier: YES, suggest: true })).suggested, []);
  const two = [turn("t0", "spk:0", "Priya Nair, and Rohan Gupta, what do you think?"), turn("t1", "spk:1", "I think they are slow."), turn("t2", "spk:2", "Ok.")];
  const q = [prop("spk:1", "Priya Nair", "Priya Nair, and Rohan Gupta, what do you think", "called-on")];
  assert.deepEqual((await extractSpeakersGrounded(two, proposer(q), { verifier: YES, suggest: true })).suggested, []);
});

test("a suggestion that contradicts the deterministic floor is not made", async () => {
  const turns = [turn("t0", "spk:0", "Rohan Gupta, what do you think about the new rules?"), turn("t1", "spk:1", "My name is Priya Nair and I think they are slow."), turn("t2", "spk:2", "Ok.")];
  const q = [prop("spk:1", "Rohan Gupta", "Rohan Gupta, what do you think about the new rules", "called-on")];
  const out = await extractSpeakersGrounded(turns, proposer(q), { verifier: YES, suggest: true });
  assert.deepEqual(out.suggested, []);
  assert.deepEqual(out.resolved, [], "and it did not slip into the final tier either");
});

test("a rejected (label, person) is not re-suggested; a different person on the same label still is", async () => {
  const out = await extractSpeakersGrounded(SINGLE, proposer(ONE), { verifier: YES, suggest: true, rejected: [{ speakerRef: "spk:1", personId: "person:priya-nair" }] });
  assert.deepEqual(out.suggested, []);
  const other = await extractSpeakersGrounded(SINGLE, proposer(ONE), { verifier: YES, suggest: true, rejected: [{ speakerRef: "spk:1", personId: "person:someone-else" }] });
  assert.equal(other.suggested?.length, 1);
});

test("selectSuggestions drops anything without a quote and anything already final", () => {
  const base = { speakerRef: "spk:1", displayName: "A B", personId: "person:a-b", evidence: [{ turnId: "t0", sessionId: "s1" }], blocks: [] };
  assert.deepEqual(selectSuggestions([{ ...base }], [], []), []);
  assert.equal(selectSuggestions([{ ...base, provenance: [{ turnId: "t0", evidenceQuote: "q q q", evidenceKind: "address" }] }], [], []).length, 1);
  assert.deepEqual(selectSuggestions([{ ...base, provenance: [{ turnId: "t0", evidenceQuote: "q q q", evidenceKind: "address" }] }], [{ ...base, speakerRef: "spk:9" }], []), []);
});

test("buildSuggestionDocs: schema-shaped, status suggested, deterministic id, quote and kind kept, no finalProvenance", async () => {
  const out = await extractSpeakersGrounded(SINGLE, proposer(ONE), { verifier: YES, suggest: true });
  const docs = buildSuggestionDocs("tenant-A", "s1", out.suggested!, new Date("2026-10-13T00:00:00Z"));
  assert.equal(docs.length, 1);
  const d = docs[0]!;
  assert.equal(d._id, suggestionId("tenant-A", "s1", "spk:1", "person:priya-nair"));
  assert.equal(d.status, "suggested");
  assert.equal(d.tenantId, "tenant-A");
  assert.equal(d.suggestedAt, "2026-10-13T00:00:00.000Z");
  assert.deepEqual(d.provenance, [{ turnId: "t0", evidenceQuote: QA, evidenceKind: "called-on" }]);
  assert.equal("finalProvenance" in d, false);
  assert.equal("aliases" in d, false, "it is not a speakers row");
});
