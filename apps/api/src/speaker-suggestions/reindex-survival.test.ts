/**
 * D-141: a human decision survives any re-index. Real writeSpeakerDocs + real extractSpeakersGrounded + the real scoped accessors,
 * over an in-memory Db. After confirm and after reject, re-run the speaker writer and the full extractor and check that the
 * confirmed name (provenance human-confirmed) and the rejection tombstone are byte-for-byte untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SpeakerSuggestions, Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { memoryDb } from "../../../../packages/db/src/collections/speaker-suggestions/testdb.js";
import {
  confirmSpeakerSuggestion, rejectSpeakerSuggestion, insertSuggestionsIfAbsent, listConfirmed, listRejected, speakerSuggestions,
} from "../../../../packages/db/src/collections/speaker-suggestions/index.js";
import { scopedCollection } from "../../../../packages/db/src/lib/tenantScope.js";
import { buildSpeakerDocs, writeSpeakerDocs, isHumanConfirmed } from "../../../../packages/index/src/pipeline/speaker-docs.js";
import { extractSpeakersGrounded, dropOverriddenByConfirmed } from "../../../../packages/index/src/pipeline/speakers-grounded.js";
import { buildSuggestionDocs } from "../../../../packages/index/src/pipeline/speaker-suggestions.js";
import { resolveSpeakers } from "../../../../packages/index/src/pipeline/speakers.js";

const T = "tenant-A", S = "s1";
const turn = (id: string, speakerRef: string, text: string): Turns => ({ _id: id, tenantId: T, sessionId: S, speakerRef, tStart: 0, tEnd: 0, text });
const TURNS = [
  turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?"),
  turn("t1", "spk:1", "I think they are slow to apply."),
  turn("t2", "spk:2", "Next topic please."),
];
const QA = "Priya Nair, what do you think about the new rules";
const proposer = (entries: unknown[]) => async (_j: Job): Promise<CompleteResult> => ({ text: "", json: entries, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const YES = async () => ({ verdict: "yes" as const });
const propose = (name: string, quote: string) => [{ label: "spk:1", name, evidenceQuote: quote, evidenceKind: "called-on" }];

async function seededSuggestion() {
  const m = memoryDb();
  m.seed("sessions", { _id: S, tenantId: T, sourceId: "synthetic-reindex-source", title: "Synthetic reindex fixture",
    date: "2026-10-16", status: { transcribe: "done", index: "pending" } });
  const first = await extractSpeakersGrounded(TURNS, proposer(propose("Priya Nair", QA)), { verifier: YES, suggest: true });
  const docs = buildSuggestionDocs(T, S, first.suggested!);
  assert.equal(await insertSuggestionsIfAbsent(T, S, docs, m.db), 1);
  return { m, id: docs[0]!._id };
}
const speakersColl = (m: ReturnType<typeof memoryDb>) => scopedCollection<never>(m.db, "speakers")(T) as unknown as Parameters<typeof writeSpeakerDocs>[0];
/** An auto/floor-derived doc for the same person, as sync-speakers would rebuild it. */
const autoDoc = () => buildSpeakerDocs(T, [{ sessionId: S, resolved: [{ speakerRef: "spk:1", displayName: "Priya Nair", personId: "person:priya-nair", evidence: [{ turnId: "tZ", sessionId: S }], blocks: [] }] }]).docs;

test("writeSpeakerDocs re-run after CONFIRM leaves the human-confirmed row untouched", async () => {
  const { m, id } = await seededSuggestion();
  await confirmSpeakerSuggestion(T, S, id, m.db, new Date("2026-10-13T00:00:00Z"));
  const before = JSON.stringify(m.rows("speakers"));
  assert.ok(isHumanConfirmed(m.rows("speakers")[0]!));
  const r1 = await writeSpeakerDocs(speakersColl(m), autoDoc());
  const r2 = await writeSpeakerDocs(speakersColl(m), autoDoc());
  assert.deepEqual([r1.written, r1.preserved, r2.written, r2.preserved], [0, 1, 0, 1]);
  assert.equal(JSON.stringify(m.rows("speakers")), before, "byte-for-byte: provenance, confirmations, aliases, evidence, confidence");
  assert.equal(m.rows("speakers")[0]!.provenance, "human-confirmed");
});

test("writeSpeakerDocs still replaces an ordinary (non-confirmed) row and writes new people", async () => {
  const m = memoryDb();
  m.seed("speakers", { _id: "tenant-A-person:priya-nair", tenantId: T, personId: "person:priya-nair", aliases: ["Old"], evidence: [{ turnId: "t0", sessionId: S }], confidence: 0.1 });
  const r = await writeSpeakerDocs(speakersColl(m), autoDoc());
  assert.deepEqual([r.written, r.preserved], [1, 0]);
  assert.deepEqual(m.rows("speakers")[0]!.aliases, ["Priya Nair"]);
});

test("full extractor + writer re-run after CONFIRM: no re-suggestion, no second name for the label, confirmed row intact", async () => {
  const { m, id } = await seededSuggestion();
  await confirmSpeakerSuggestion(T, S, id, m.db);
  const before = JSON.stringify([m.rows("speakers"), m.rows("speaker_suggestions")]);
  // the model now proposes a DIFFERENT person for the same label; a re-index must not displace the confirmed name
  const confirmed = await listConfirmed(T, S, m.db);
  const other = [{ label: "spk:1", name: "Rohan Gupta", evidenceQuote: "Rohan Gupta, what do you think about the new rules", evidenceKind: "called-on" }];
  const turns = [turn("t0", "spk:0", "Rohan Gupta, what do you think about the new rules?"), ...TURNS.slice(1)];
  const out = await extractSpeakersGrounded(turns, proposer(other), { verifier: YES, suggest: true, confirmed, rejected: await listRejected(T, S, m.db) });
  assert.deepEqual(out.suggested, [], "no suggestion for a confirmed label");
  assert.deepEqual(out.resolved, []);
  const same = await extractSpeakersGrounded(TURNS, proposer(propose("Priya Nair", QA)), { verifier: YES, suggest: true, confirmed });
  assert.deepEqual(same.suggested, [], "the confirmed person is not re-suggested either");
  const docs = buildSuggestionDocs(T, S, same.suggested!);
  assert.equal(await insertSuggestionsIfAbsent(T, S, docs, m.db), 0);
  await writeSpeakerDocs(speakersColl(m), autoDoc());
  assert.equal(JSON.stringify([m.rows("speakers"), m.rows("speaker_suggestions")]), before);
});

test("a floor result for a confirmed label with a DIFFERENT person is dropped; the same person is kept", () => {
  const floor = resolveSpeakers([turn("t0", "spk:0", "Welcome."), turn("t1", "spk:1", "Hello, my name is Rohan Gupta.")]).resolved;
  assert.equal(floor[0]?.personId, "person:rohan-gupta");
  assert.deepEqual(dropOverriddenByConfirmed(floor, [{ speakerRef: "spk:1", personId: "person:priya-nair" }]), []);
  assert.equal(dropOverriddenByConfirmed(floor, [{ speakerRef: "spk:1", personId: "person:rohan-gupta" }]).length, 1);
  assert.equal(dropOverriddenByConfirmed(floor, [{ speakerRef: "spk:9", personId: "person:priya-nair" }]).length, 1);
});

test("re-index after REJECT: writer, extractor and re-insert leave the tombstone and create no final row", async () => {
  const { m, id } = await seededSuggestion();
  await rejectSpeakerSuggestion(T, S, id, m.db, new Date("2026-10-13T00:00:00Z"));
  const before = JSON.stringify(m.rows("speaker_suggestions"));
  const rejected = await listRejected(T, S, m.db);
  const out = await extractSpeakersGrounded(TURNS, proposer(propose("Priya Nair", QA)), { verifier: YES, suggest: true, rejected });
  assert.deepEqual(out.suggested, []);
  // even a caller that forgot to pass `rejected` cannot clear the tombstone: the insert is a no-op on an existing row
  const naive = await extractSpeakersGrounded(TURNS, proposer(propose("Priya Nair", QA)), { verifier: YES, suggest: true });
  assert.equal(await insertSuggestionsIfAbsent(T, S, buildSuggestionDocs(T, S, naive.suggested!), m.db), 0);
  await writeSpeakerDocs(speakersColl(m), []);
  assert.equal(JSON.stringify(m.rows("speaker_suggestions")), before);
  assert.equal((await speakerSuggestions(T, m.db).findOne({ _id: id }))?.status, "rejected");
  assert.equal(m.rows("speakers").length, 0);
  assert.deepEqual(await confirmSpeakerSuggestion(T, S, id, m.db), { result: "conflict", status: "rejected" });
});

test("types: a confirmed suggestion row is still schema-shaped", async () => {
  const { m, id } = await seededSuggestion();
  await confirmSpeakerSuggestion(T, S, id, m.db);
  const row = m.rows("speaker_suggestions")[0] as unknown as SpeakerSuggestions;
  assert.deepEqual([row.status, row.finalProvenance], ["confirmed", "human-confirmed"]);
});

test("confirming a name that already had an AUTO row (no row-level provenance) is still protected from the writer", async () => {
  const { m, id } = await seededSuggestion();
  m.seed("speakers", { _id: "tenant-A-person:priya-nair", tenantId: T, personId: "person:priya-nair", aliases: ["Priya"], confidence: 0.9, evidence: [{ turnId: "tZ", sessionId: S }] });
  await confirmSpeakerSuggestion(T, S, id, m.db);
  assert.equal(m.rows("speakers")[0]!.provenance, undefined, "the pre-existing row keeps its own provenance state");
  const before = JSON.stringify(m.rows("speakers"));
  const r = await writeSpeakerDocs(speakersColl(m), autoDoc());
  assert.deepEqual([r.written, r.preserved], [0, 1]);
  assert.equal(JSON.stringify(m.rows("speakers")), before);
});
