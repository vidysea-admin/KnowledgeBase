import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndexer } from "../../../apps/api/src/composition/production.js";
import { createMongoGroundedContentDeps } from "../../../apps/api/src/grounded-content/reader.js";
import { verifyIndexGeneration, indexArtifactRef } from "../../../apps/api/src/indexing/generation.js";
import { fixture, QUESTION, ANSWER, FACT, ACTION } from "../../../apps/api/src/grounded-postprocessing/fixture.testsupport.js";

// The provider and database are offline fixtures. The factory, routed generation, writes,
// tenant-scoped database reader and evidence projection are actual product implementations.
test("actual caller grounded opt-in overrides explicit legacy choice and real stored-row reader consumes citations", async () => {
  const state = fixture();
  const result = await buildIndexer(state.routing, { strictWebinar: false, groundedNotes: true, db: state.db })("t", "s1");
  assert.equal(result.completion?.strict, true);
  assert.equal(result.completion?.complete, true);
  assert.ok(result.completion);
  assert.equal(result.completion.version, 2);
  const generation = result.completion.generation;
  assert.match(generation, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.ok(state.kinds.includes("note-judge"));
  assert.ok(state.kinds.includes("embedding"));
  assert.ok(state.jobs.length > 0 && state.jobs.every((job) => job.tenantId === "t"));
  for (const collection of ["session_pages", "claims", "chunks", "tree_index"]) {
    assert.ok(state.rows(collection).length > 0, `${collection} has actual stored output`);
    assert.ok(state.rows(collection).every((row) => row.tenantId === "t"));
  }
  const storedSession = state.rows("sessions").find((row) => row._id === "s1");
  assert.ok(storedSession);
  assert.equal(storedSession.status.index, "done");
  assert.equal(storedSession.indexAttempt.state, "complete");
  assert.equal(storedSession.indexAttempt.generation, generation);
  const storedPage = state.rows("session_pages")[0]!;
  assert.deepEqual(storedSession.indexAttempt.manifest.page, indexArtifactRef(storedPage));
  for (const collection of ["session_pages", "claims", "chunks"]) for (const row of state.rows(collection)) {
    assert.equal(row.indexArtifact.generation, generation);
    assert.equal(row.indexArtifact.sessionId, "s1");
    assert.equal(row.indexArtifact.sourceId, "src1");
    assert.equal(row.indexArtifact.turnDigest, storedSession.indexAttempt.turnDigest);
  }
  const writes = () => state.calls.filter((call) => ["insertOne", "insertMany", "replaceOne", "updateOne", "deleteMany", "deleteOne"].includes(call.method)).length;
  const beforeReadback = writes();
  const physicalProof = await verifyIndexGeneration(state.db, "t", "s1", generation);
  assert.deepEqual(physicalProof, { generation, sessionId: "s1", sourceId: "src1", strict: true,
    turnCount: 4, chunkCount: state.rows("chunks").length });
  assert.equal(writes(), beforeReadback, "native verification performs no write or new generation");
  assert.equal(await verifyIndexGeneration(state.db, "foreign", "s1", generation), null);
  assert.equal(await verifyIndexGeneration(state.db, "t", "s1", "00000000-0000-4000-8000-000000000000"), null);
  // Fault injection affects only this isolated in-memory fixture row, never source files/real Mongo.
  // A cached complete result cannot bless a changed physical page; restore the fixture in finally.
  const originalSummary = storedPage.summary;
  try {
    storedPage.summary = `${originalSummary} Unsupported post-completion content.`;
    assert.equal(await verifyIndexGeneration(state.db, "t", "s1", generation), null);
  } finally { storedPage.summary = originalSummary; }
  assert.deepEqual(await verifyIndexGeneration(state.db, "t", "s1", generation), physicalProof);
  const reader = createMongoGroundedContentDeps(state.db);
  const content = await reader.getGroundedContent("t", "s1");
  assert.ok(content);
  const fact = content.notes.find((note) => note.text === FACT);
  assert.deepEqual(fact?.evidence, [{ turnId: "turn-2", sessionId: "s1", quote: FACT,
    available: true, tStart: 6, tEnd: 8, speaker: "speaker:host" }]);
  assert.equal(content.notes.find((note) => note.kind === "action")?.text, ACTION);
  assert.equal(content.qa[0]?.question, QUESTION);
  assert.equal(content.qa[0]?.answer, ANSWER);
  assert.equal(content.qa[0]?.questionEvidence[0]?.turnId, "turn-0");
  assert.equal(content.qa[0]?.answerEvidence[0]?.turnId, "turn-1");
  assert.equal(content.qa[0]?.questionEvidence[0]?.available, true);
  assert.equal(content.qa[0]?.answerEvidence[0]?.available, true);
  assert.equal(content.claims[0]?.evidence[0]?.quote, FACT);
  assert.equal(await reader.getGroundedContent("foreign", "s1"), null);
  assert.equal(await reader.getGroundedContent("t", "missing-session"), null);
  assert.ok(state.calls.some((call) => call.collection === "session_pages" && call.method === "findOne"));
});
