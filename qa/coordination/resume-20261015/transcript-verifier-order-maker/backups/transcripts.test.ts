import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTranscriptIntegrations, type TranscriptIntegrationInput } from "../composition/integrations/transcripts.js";
import { transactionalFixture } from "../transcript-review/refresh-testkit.js";
import { headId } from "../transcript-review/store.js";
import { runRefresh } from "../transcript-review/service.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { createGroundedContentDeps } from "../grounded-content/reader.js";
import { verifyIndexGeneration } from "../indexing/generation.js";
import { routedFixture, turns, session, source, FACT, ACTION, ANSWER } from "./fixture.testsupport.js";

function context({ name = "lkb_t054_composition", env = {} as NodeJS.ProcessEnv, judgeFails = false } = {}) {
  const transaction = transactionalFixture(), provider = routedFixture({ judgeFails });
  Object.assign(transaction.db, { databaseName: name });
  const input: TranscriptIntegrationInput = { db: transaction.db, env, root: process.cwd(),
    index: async () => { throw new Error("legacy unbound indexer must not refresh a reviewed transaction"); },
    ask: {} as TranscriptIntegrationInput["ask"], routing: provider.routing };
  return { transaction, provider, input };
}

function seed(state: ReturnType<typeof context>) {
  for (const turn of turns) state.transaction.seed("turns", { ...turn, text: turn._id === "turn-2" ? "The programme fee is 2,000 rupees today." : turn.text });
  state.transaction.seed("sessions", { ...session, status: { transcribe: "done", index: "done" } });
  state.transaction.seed("sources", source);
  state.transaction.seed("transcript_reviews", { _id: headId("t", "s1"), tenantId: "t", sessionId: "s1", revision: "r1", parentRevision: "base-r0",
    overlay: [{ turnId: "turn-2", text: FACT, speakerRef: "person:reviewed", speakerLabel: "Reviewed host" }],
    audit: { actorRef: "apikey:verified-fixture", reviewedAt: "2026-10-14T10:00:00Z", reason: "Correct source fee", changes: [{
      turnId: "turn-2", before: { text: "The programme fee is 2,000 rupees today.", speakerRef: "speaker:host" },
      after: { text: FACT, speakerRef: "person:reviewed", speakerLabel: "Reviewed host" },
    }] },
    committedAt: "2026-10-14T10:00:00Z", refresh: { status: "pending", revision: "r1", targets: ["claims", "session-page", "chunks", "tree", "graph"], completed: [] } });
}

test("real transcript factory is lazy and enforces D168 exact production database opt-in", () => {
  for (const [name, env, expected] of [
    ["lkb_t054_composition", {}, true], ["lkb_staging", {}, false], ["lkb_staging", { LKB_ALLOW_STAGING: "lkb_staging" }, true],
    ["LKB_STAGING", { LKB_ALLOW_STAGING: "lkb_staging" }, false], ["lkb", {}, false], ["lkb", { MONGODB_DB: "lkb", LKB_I_KNOW_THIS_IS_PRODUCTION: "1" }, true],
    ["LKB", { MONGODB_DB: "lkb", LKB_I_KNOW_THIS_IS_PRODUCTION: "1" }, false],
    ["lkb", { MONGODB_DB: "lkb_staging", LKB_I_KNOW_THIS_IS_PRODUCTION: "1" }, false],
    ["global_university_db", { MONGODB_DB: "lkb", LKB_I_KNOW_THIS_IS_PRODUCTION: "1" }, false], ["", {}, false],
  ] as Array<[string, NodeJS.ProcessEnv, boolean]>) {
    const state = context({ name, env }), integrations = buildTranscriptIntegrations(state.input);
    assert.equal(Boolean(integrations.transcriptReview), expected);
    assert.equal(state.transaction.calls.length, 0); assert.equal(state.provider.kinds.length, 0); assert.equal(state.provider.jobs.length, 0);
  }
});

test("actual factory refresh consumes corrected view and publishes canonical cited categories in one transaction", async () => {
  const state = context(); seed(state);
  const originals = structuredClone(state.transaction.rows("turns"));
  const deps = buildTranscriptIntegrations(state.input).transcriptReview!;
  assert.ok(deps.authorizeSession);
  assert.equal(await deps.authorizeSession("t", "s1"), true);
  assert.equal(await deps.authorizeSession("foreign", "s1"), false);
  const result = await runRefresh(deps.store, deps.refresh!, "t", "s1");
  assert.equal(result?.status, "complete"); assert.equal(result?.completed.length, 5);
  assert.deepEqual(state.transaction.rows("turns"), originals);
  assert.ok(state.provider.kinds.includes("note-judge"));
  assert.equal(state.provider.kinds.filter(kind => kind === "embedding").length, 0);
  assert.equal(state.provider.jobs.filter(job => job.kind === "embedding").length, 0);
  const indexed = state.transaction.rows("sessions")[0]!;
  assert.equal(indexed.status.index, "done"); assert.equal(indexed.indexAttempt.state, "complete");
  assert.equal(indexed.indexAttempt.manifest.retrievalMode, "vectorless");
  const lexical = state.transaction.rows("chunks");
  assert.ok(lexical.length > 0); assert.ok(state.transaction.rows("tree_index").length > 0);
  for (const chunk of lexical) {
    assert.equal(chunk.vector, undefined); assert.equal(chunk.dims, undefined); assert.equal(chunk.embeddingModel, undefined);
    assert.equal(chunk.indexArtifact.generation, indexed.indexAttempt.generation);
    assert.ok(chunk.turnRefs.length > 0);
  }
  assert.ok(await verifyIndexGeneration(state.transaction.db, "t", "s1", indexed.indexAttempt.generation));
  assert.ok(state.provider.jobs.length > 0 && state.provider.jobs.every((job) => job.tenantId === "t"));
  const page = state.transaction.rows("session_pages")[0]!;
  assert.ok(page.summary.includes(FACT)); assert.deepEqual(page.actionItems, [ACTION]); assert.equal(page.qa[0].answer, ANSWER);
  assert.ok(state.transaction.rows("graph_edges").some((edge) => edge.from === "person:reviewed" && edge.type === "spoke_in"));
  const content = await createGroundedContentDeps({ getSessionDetail: async () => ({
    session: state.transaction.rows("sessions")[0], page, claims: state.transaction.rows("claims"),
    turns: await readEffectiveTurns(state.transaction.db, "t", state.transaction.rows("turns") as never, "s1"),
  }) as never }).getGroundedContent("t", "s1");
  const fact = content!.notes.find((note) => note.text === FACT)!;
  assert.equal(fact.evidence[0]!.available, true); assert.equal(fact.evidence[0]!.speaker, "Reviewed host"); assert.equal(fact.evidence[0]!.tStart, 6);
  assert.equal(state.transaction.maxActive(), 1, "real transaction view serializes concurrent indexer operations");
});

test("unsupported transactions remain a durable failed refresh without publishing derived knowledge or calling providers", async () => {
  const state = context(); seed(state); state.transaction.refuseTransactions();
  const deps = buildTranscriptIntegrations(state.input).transcriptReview!;
  const result = await runRefresh(deps.store, deps.refresh!, "t", "s1");
  assert.equal(result?.status, "failed"); assert.equal(state.transaction.rows("transcript_reviews")[0]!.revision, "r1");
  for (const name of ["session_pages", "claims", "chunks", "tree_index", "graph_edges"]) assert.equal(state.transaction.rows(name).length, 0);
  assert.equal(state.provider.kinds.length, 0);
});

test("actual review factory judge outage retains the correction and rolls back all derived targets", async () => {
  const state = context({ judgeFails: true }); seed(state);
  const originals = structuredClone(state.transaction.rows("turns"));
  const deps = buildTranscriptIntegrations(state.input).transcriptReview!;
  const result = await runRefresh(deps.store, deps.refresh!, "t", "s1");
  assert.equal(result?.status, "failed");
  const head = state.transaction.rows("transcript_reviews")[0]!;
  assert.equal(head.revision, "r1"); assert.equal(head.overlay[0].text, FACT);
  assert.deepEqual(state.transaction.rows("turns"), originals);
  for (const name of ["session_pages", "claims", "chunks", "tree_index", "graph_edges"]) assert.equal(state.transaction.rows(name).length, 0);
  assert.ok(state.provider.jobs.some((job) => job.kind === "note-judge" && job.status === "failed"));
});

test("refresh notifies only after its outer commit and hook failure preserves completed knowledge", async () => {
  const state = context(); seed(state); let notifications = 0;
  state.input.onIndexCommitted = async binding => {
    notifications++;
    assert.equal(binding.reviewRevision, "r1");
    assert.equal(state.transaction.rows("transcript_reviews")[0]!.refresh.status, "complete");
    assert.equal(state.transaction.rows("sessions")[0]!.indexAttempt.generation, binding.generation);
    throw new Error("archive pending; successful refresh must remain complete");
  };
  const deps = buildTranscriptIntegrations(state.input).transcriptReview!;
  const result = await runRefresh(deps.store, deps.refresh!, "t", "s1");
  assert.equal(result?.status, "complete"); assert.ok(notifications > 0);
  const paidCalls = state.provider.jobs.length;
  await runRefresh(deps.store, deps.refresh!, "t", "s1");
  assert.equal(state.provider.jobs.length, paidCalls);
});

test("failed refresh never calls the archive hook", async () => {
  const state = context({ judgeFails: true }); seed(state); let notifications = 0;
  state.input.onIndexCommitted = async () => { notifications++; };
  const deps = buildTranscriptIntegrations(state.input).transcriptReview!;
  assert.equal((await runRefresh(deps.store, deps.refresh!, "t", "s1"))?.status, "failed");
  assert.equal(notifications, 0);
});
