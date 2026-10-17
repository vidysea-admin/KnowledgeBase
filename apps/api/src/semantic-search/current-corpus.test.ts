import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Claims, Sessions, Sources, Turns } from "@lkb/core";
import type { Db } from "mongodb";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { detectWhatsAppReviewCandidates } from "../whatsapp/review/detection.js";
import { whatsAppClaimId } from "../whatsapp/review/materializer.js";
import { headId } from "../transcript-review/store.js";
import { createAskArmsFor } from "../ask/ask-arms.js";
import { trustedTreeReads } from "../composition/integrations/trusted-readers.js";
import { createMongoSemanticSearchDeps } from "./semantic-search-store.js";
import { SemanticIndexPendingError } from "./readiness.js";
import { chunkContentId } from "../indexing/chunk-integrity.js";
import { corpusFixtureDb, corpusSnapshotModel, type FixtureRead, type FixtureRow } from "./corpus-fixture.js";

const embed = async () => ({ vectors: [[1, 0]], dims: 2, provider: "fixture", model: "fixture" });
function fixture() {
  const tenantId = "tenant";
  const source: Sources = { _id: "wa", tenantId, kind: "whatsapp-batch", path: "group@g.us", captureMode: "provided",
    hash: createHash("sha256").update("Scholarship closes Friday.").digest("hex"),
    consent: { given: true, recordedBy: "synthetic-fixture-owner", note: "Synthetic supplied export; no external group data" },
    createdAt: "2026-10-14T10:00:00.000Z" };
  const session: Sessions = { _id: "chat", tenantId, sourceId: source._id, title: "PRIVATE group", participants: ["PRIVATE person"],
    date: "2026-10-14", status: { transcribe: "done", index: "done" } };
  const first: Turns = { _id: "approved", tenantId, sessionId: session._id, speakerRef: "expert", speakerLabel: "Asha",
    tStart: 0, tEnd: 0, occurredAt: "2026-10-14T10:00:00.000Z", text: "Scholarship closes Friday." };
  const pending: Turns = { ...first, _id: "pending", text: "Scholarship PRIVATE sibling fee is 99." };
  const candidate = { ...detectWhatsAppReviewCandidates(tenantId, { source, session, turns: [first] }, "2026-10-14T11:00:00.000Z")[0]!,
    status: "approved", decision: { action: "approved", actor: "reviewer", at: "2026-10-14T11:00:00.000Z" } };
  const claim: Claims = { _id: whatsAppClaimId(candidate._id), tenantId, text: candidate.text, source: "whatsapp", status: "verified", origin: "speaker-statement",
    evidence: candidate.evidence.map(e => ({ sessionId: e.sessionId, turnId: e.turnId, quote: e.quote })) as Claims["evidence"],
    waReview: { candidateId: candidate._id, kind: candidate.kind, approvedBy: candidate.decision.actor, approvedAt: candidate.decision.at } };
  const doc: Turns = { _id: "document-turn", tenantId, sessionId: "document", speakerRef: "document", text: "Scholarship document guidance.", tStart: 1, tEnd: 2 };
  const chunk = (turn: Turns) => ({ _id: chunkContentId(tenantId, turn.sessionId, [turn._id], turn.text), tenantId,
    sourceRef: turn.sessionId, turnRefs: [turn._id], vector: [1, 0], dims: 2, embeddingModel: "fixture" });
  const rows = { sources: [source, { _id: "doc", tenantId, kind: "document" }], sessions: [session, { ...session, _id: "document", sourceId: "doc", title: "Public document" }],
    turns: [first, pending, doc], whatsapp_candidates: [candidate], claims: [claim], whatsapp_review_log: [], transcript_reviews: [],
    chunks: [chunk(first), { ...chunk(pending), embeddingModel: "wrong-model", vector: [NaN, 0] }, chunk(doc)],
    gaps: [{ _id: "private-gap", tenantId, kind: "vector-pending", status: "open", sourceRef: "private-session" }] } as unknown as Record<string, FixtureRow[]>;
  const calls: FixtureRead[] = [], db = corpusFixtureDb(rows, calls);
  return { rows, calls, db, first, doc, chunk, candidate, deps: createMongoSemanticSearchDeps({ db, embed }) };
}

test("actual approval provenance admits only published chat turn; semantic/readiness exclude unreviewed vectors and private metadata", async () => {
  const f = fixture();
  const hits = await f.deps.search("tenant", "scholarship", 10, "chunks");
  assert.deepEqual(new Set(hits.map(hit => hit.quote!.turnId)), new Set([f.first._id, f.doc._id]));
  assert.ok(!JSON.stringify(hits).includes("PRIVATE"));
  assert.equal(hits.find(hit => hit.sessionId === "chat")!.session!.title, "Reviewed expert guidance");
  const readiness = await f.deps.readiness!("tenant");
  assert.equal(readiness.status, "ready"); assert.equal(readiness.total, 2); assert.equal(readiness.pendingGaps, 0);
  for (const call of f.calls) assert.equal(call.filter.tenantId, "tenant");
});

test("direct semantic citations exclude persisted generation manifests and capture capabilities", async () => {
  const f = fixture();
  Object.assign(f.rows.sessions![1]!, { indexAttempt: { manifest: { private: "PRIVATE generation" } }, controlToken: "PRIVATE control",
    controller: "PRIVATE controller", privateWindows: ["PRIVATE window"], unexpectedField: "PRIVATE future extension" });
  (f.rows.sessions![1]!.status as FixtureRow).unexpectedField = "PRIVATE nested status";
  const hit = (await f.deps.search("tenant", "scholarship", 10, "chunks")).find(row => row.sessionId === "document")!;
  assert.equal(hit.session!.title, "Public document"); assert.equal(hit.session!.date, "2026-10-14");
  assert.deepEqual(hit.session!.status, { transcribe: "done", index: "done" });
  assert.ok(!JSON.stringify(hit).includes("PRIVATE"));
});

test("rejected/pending/withdrawn approval and pending invalidation disappear from rank and readiness on next request", async () => {
  for (const change of ["pending", "rejected", "withdrawn", "invalidation", "source-relabel"] as const) {
    const f = fixture();
    if (change === "withdrawn") f.rows.claims!.length = 0;
    else if (change === "invalidation") f.rows.whatsapp_review_log!.push({ tenantId: "tenant", kind: "pending-invalidation", groupJid: "group@g.us" });
    else if (change === "source-relabel") f.rows.sources![0]!.kind = "document";
    else f.rows.whatsapp_candidates![0]!.status = change === "pending" ? "needs-review" : "rejected";
    assert.deepEqual((await f.deps.search("tenant", "scholarship", 10, "chunks")).map(hit => hit.sessionId), ["document"], change);
    assert.equal((await f.deps.readiness!("tenant")).total, 1, change);
  }
});

test("actual transcript overlay makes old embeddings unavailable; rebuilt current content and corrected speaker are consumed", async () => {
  const f = fixture();
  const corrected = { ...f.doc, text: "Corrected scholarship evidence.", speakerRef: "corrected-expert" };
  f.rows.transcript_reviews!.push({ _id: headId("tenant", f.doc.sessionId), tenantId: "tenant", sessionId: f.doc.sessionId,
    overlay: [{ turnId: corrected._id, text: corrected.text, speakerRef: corrected.speakerRef }] });
  await assert.rejects(() => f.deps.search("tenant", "scholarship", 10, "chunks"), SemanticIndexPendingError);
  assert.equal((await f.deps.readiness!("tenant")).stale, 1);
  f.rows.chunks![2] = f.chunk(corrected);
  const hit = (await f.deps.search("tenant", "scholarship", 10, "chunks")).find(row => row.sessionId === corrected.sessionId)!;
  assert.equal(hit.quote!.text, corrected.text); assert.equal(hit.quote!.speakerRef, corrected.speakerRef);
  assert.equal((await f.deps.readiness!("tenant")).status, "ready");
  assert.equal(f.rows.turns![2]!.text, f.doc.text, "overlay never rewrites original evidence");
});

test("shared trusted tree and actual Ask vector/lexical arms consume the same reviewed source and exclude its sibling", async () => {
  const f = fixture();
  const tree = await createKnowledgeVisibility(f.db).trustedTree("tenant", { node_id: "tenant:tenant", tenantId: "tenant", level: "tenant",
    title: "Knowledge", summary: "", children: [{ node_id: "tenant:tenant/session:document", title: "Document", summary: f.doc.text,
      level: "session", children: [], evidence: { sessionRef: f.doc.sessionId } }] });
  assert.ok(tree);
  const result = await createAskArmsFor({ db: f.db, embed })("tenant")("scholarship", tree!);
  assert.equal(result.arms.length, 2);
  for (const arm of result.arms) {
    assert.deepEqual(new Set(arm.map(node => node.evidence!.sessionRef)), new Set(["chat", "document"]));
    assert.ok(!JSON.stringify(arm).includes("PRIVATE"));
  }
  f.rows.claims!.length = 0;
  const withdrawn = await createKnowledgeVisibility(f.db).trustedTree("tenant", tree);
  assert.ok(withdrawn);
  const next = await createAskArmsFor({ db: f.db, embed })("tenant")("scholarship", withdrawn!);
  assert.ok(next.arms.every(arm => arm.every(node => node.evidence!.sessionRef === "document")));
});

test("actual trustedTreeReads uses the shared snapshot boundary and synthesizes only approved WA guidance (model only)", async () => {
  const f = fixture();
  const model = corpusSnapshotModel(f.rows, f.calls);
  const reader = trustedTreeReads(() => model.db as Db);
  const tree = await reader.load("tenant");
  assert.ok(tree);
  assert.deepEqual(tree!.children.map(node => node.evidence!.sessionRef), ["chat"]);
  const result = await createAskArmsFor({ db: f.db, embed })("tenant")("scholarship", tree!);
  assert.equal(result.arms.length, 2);
  assert.ok(result.arms.every(arm => arm.length === 1 && arm[0]!.evidence!.sessionRef === "chat"));
  assert.ok(!JSON.stringify(result.arms).includes("PRIVATE"));
  assert.equal(model.transactions[0]!.readConcern!.level, "snapshot");
  assert.ok(model.sessions.every(session => session.ended && !session.active));
  f.rows.claims!.length = 0;
  assert.equal(await reader.load("tenant"), null, "withdrawal cannot survive the next snapshot");
  const noClient = trustedTreeReads(() => f.db as Db);
  await assert.rejects(() => noClient.load("tenant"), { status: 503 });
});
