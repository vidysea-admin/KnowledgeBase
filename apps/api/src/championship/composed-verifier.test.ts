/** w17-wireapi item 1: the production championship store uses the composed saved-answer verifier
 * (knowledge visibility + native resolver), built through buildEvaluationIntegrations. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { DocumentPageSourceLocator } from "@lkb/core";
import { createChampionshipEvent, type ChampionshipEvent } from "./model.js";
import { addChampionshipTrial, freezeChampionship } from "./runtime.js";
import { answerTestDb } from "../answer-policy/answer-testdb.js";
import { createNativeEvidenceResolver } from "../native-evidence/resolver.js";
import { buildEvaluationIntegrations, type EvaluationIntegrationInput } from "../composition/integrations/evaluation.js";
import { createChampionshipRouter, type ChampionshipStore } from "../routes/championship/championship.js";

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const text = "Fee is 100.", nativeText = "Native page passage.", revisionHash = sha("rev");
const plan = { title: "Plan", questions: [{ id: "q", text: "Fee?", source: { kind: "toc", reference: "turn:1" } }], counsellors: [{ id: "c", name: "Name", evidenceReference: "pending" }], judges: [], rubric: { version: "draft", reference: "pending" }, reviewReference: "pending" };
const transcriptAnswer = () => ({ text: "Fee is 100", answer: "Fee is 100", sources: { web: [], internal: [{ node_id: "n1", evidence: { sessionRef: "s1", sourceQuotes: [{
  id: "q1", nodeId: "n1", sessionRef: "s1", turnId: "t1", speakerRef: "spk:0", tStart: 10, tEnd: 20, charStart: 0, charEnd: text.length,
  byteStart: 0, byteEnd: Buffer.byteLength(text), turnTextSHA256: sha(text), sliceSHA256: sha(text), quote: text, origin: "speech" }] } }] } });
const locator: DocumentPageSourceLocator = { kind: "document-page", documentId: "doc", documentSourceId: "doc-src", sourceId: "nsrc", headRevision: 1,
  revisionHash, pageNumber: 1, passage: { start: 0, end: nativeText.length, sha256: sha(nativeText) } };
const nativeAnswer = () => ({ text: "Native", answer: "Native", sources: { web: [], internal: [{ node_id: "nn", title: "Native", level: "topic", summary: "", children: [],
  evidence: { sourceId: "nsrc", revisionHash, sourceQuotes: [{ id: "nq", nodeId: "nn", quote: nativeText, origin: "document-page", sourceLocator: locator }] } }] } });

function rig(answer: unknown, consent?: boolean) {
  const t = answerTestDb("lkb_t056_test");
  t.rows("sessions").push({ _id: "s1", tenantId: "a", sourceId: "src" });
  t.rows("sources").push({ _id: "src", tenantId: "a", kind: "recording", ...(consent === undefined ? {} : { consent: { given: consent } }) });
  t.rows("turns").push({ _id: "t1", tenantId: "a", sessionId: "s1", speakerRef: "spk:0", tStart: 10, tEnd: 20, text });
  const created = createChampionshipEvent("a", plan, "2026-10-14T00:00:00Z");
  const event = addChampionshipTrial(freezeChampionship(created, created.bankDigest, "2026-10-14T00:01:00Z"), "q", "c", { _id: "e1", tenantId: "a", question: "Fee?",
    counsellor: { name: "Name" }, aiAnswer: answer as never, counsellorAnswer: { text: "Human" }, score: { ai: 4, counsellor: 3 }, credibility: "internal",
    createdAt: "2026-10-14T00:02:00Z" }, "2026-10-14T00:03:00Z");
  t.rows("championship_events").push(structuredClone(event) as never);
  const nativeEvidence = createNativeEvidenceResolver({ loadCurrent: async (tenantId, l) => tenantId !== "a" || l.kind !== "document-page" ? null : {
    tenantId, sourceId: "nsrc", revisionHash, currentRevisionHash: revisionHash, eligible: true as const, text: nativeText,
    kind: "document-page", documentId: "doc", documentSourceId: "doc-src", headRevision: 1, pageNumber: 1 } });
  const input = { db: t.db, env: { LKB_CHAMPIONSHIP: "1" }, root: "C:/nonexistent", index: undefined, ask: {}, routing: {}, nativeEvidence } as unknown as EvaluationIntegrationInput;
  const store = buildEvaluationIntegrations(input).championship;
  assert.ok(store, "LKB_CHAMPIONSHIP=1 on a work DB composes the store");
  return { event, store: store!, t };
}
function get(store: ChampionshipStore, id: string, tenantId = "a"): Promise<{ status: number; body: { event: ChampionshipEvent } }> {
  const router = createChampionshipRouter(store);
  return new Promise((resolve, reject) => {
    const req = { method: "GET", url: `/championship/${id}`, originalUrl: `/championship/${id}`, headers: {}, auth: { tenantId, scopes: ["compete"] } } as never;
    let statusCode = 200;
    const res = { status(c: number) { statusCode = c; return this; }, json(v: unknown) { resolve({ status: statusCode, body: v as never }); return this; },
      setHeader() {}, getHeader() {}, end() { reject(new Error("ended without json")); } } as never;
    (router as unknown as (a: unknown, b: unknown, c: (e?: unknown) => void) => void)(req, res, e => reject(e ?? new Error("fell through")));
  });
}
const trial = (e: ChampionshipEvent) => e.trials[0] as unknown as { state?: string; aiAnswer: { sources: { internal: unknown[] } } };

test("consent-withdrawn transcript trial is stripped and flagged stale", async () => {
  const f = rig(transcriptAnswer(), false), r = await get(f.store, f.event._id);
  assert.equal(r.status, 200); assert.equal(trial(r.body.event).aiAnswer.sources.internal.length, 0); assert.equal(trial(r.body.event).state, "stale");
});
test("valid transcript trial is kept", async () => {
  const f = rig(transcriptAnswer()), r = await get(f.store, f.event._id);
  assert.equal(trial(r.body.event).aiAnswer.sources.internal.length, 1); assert.equal(trial(r.body.event).state, undefined);
});
test("valid native trial is kept through the composed native resolver", async () => {
  const f = rig(nativeAnswer()), r = await get(f.store, f.event._id);
  assert.equal(trial(r.body.event).aiAnswer.sources.internal.length, 1); assert.equal(trial(r.body.event).state, undefined);
});
test("cross-tenant read is not found", async () => {
  const f = rig(transcriptAnswer()), r = await get(f.store, f.event._id, "b");
  assert.equal(r.status, 404);
});
