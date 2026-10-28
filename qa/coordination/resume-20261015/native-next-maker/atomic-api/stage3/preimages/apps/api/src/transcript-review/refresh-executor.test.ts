import { test } from "node:test";
import assert from "node:assert/strict";
import { transactionalFixture } from "./refresh-testkit.js";
import { createTranscriptRefreshExecutor } from "./refresh-executor.js";
import { indexSession } from "../indexing/session.js";
import { createMongoReviewStore, headId } from "./store.js";
import { loadReview, loadReviewHistory, runRefresh } from "./service.js";
import { readEffectiveTurns } from "./effective-reader.js";
import { transactionReviewDb } from "./transaction-db.js";
import type { ReviewTurn } from "./planner.js";
import { createGroundedContentDeps } from "../grounded-content/reader.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildChunks, buildKnowledgeGraph } from "@lkb/index";
import { commitReview } from "./service.js";

const TEXT = "The programme fee is 1,000 rupees today.";
const REVIEWED_TEXT = "Admissions are open.";
const TARGETS = ["claims", "session-page", "chunks", "tree", "graph"];
function fixture() {
  const h = transactionalFixture();
  const original = { _id: "t1", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", text: "The programme fee is 2,000 rupees today.", tStart: 0, tEnd: 4 };
  h.seed("turns", original);
  h.seed("turns", { _id: "t-reviewed", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", text: REVIEWED_TEXT, tStart: 5, tEnd: 7 });
  h.seed("sources", { _id: "src1", tenantId: "t", kind: "recording", path: "offline-fixture/fees" });
  h.seed("sessions", { _id: "s1", tenantId: "t", sourceId: "src1", title: "Fees", org: "Acme University", date: "2026-10-14", status: { index: "done", transcribe: "done" } });
  h.seed("transcript_reviews", { _id: headId("t", "s1"), tenantId: "t", sessionId: "s1", revision: "r1", parentRevision: "base-r0", committedAt: "2026-10-14T10:00:00Z",
    overlay: [{ turnId: "t1", text: TEXT, speakerRef: "person:reviewed", speakerLabel: "Reviewed speaker" }],
    audit: { actorRef: "apikey:t:key", reviewedAt: "2026-10-14T10:00:00Z", reason: "Correct fee", changes: [{ turnId: "t1", before: { text: original.text, speakerRef: original.speakerRef }, after: { text: TEXT, speakerRef: "person:reviewed" } }] },
    refresh: { status: "pending", revision: "r1", targets: TARGETS, completed: [] } });
  h.seed("claims", { _id: "reviewed", tenantId: "t", text: REVIEWED_TEXT, status: "verified", evidence: [{ turnId: "t-reviewed", sessionId: "s1", quote: REVIEWED_TEXT }], topicRefs: [] });
  return h;
}
const complete = async (job: { messages: { content: string }[] }) => {
  const p = JSON.parse(job.messages[1]!.content);
  const item = { text: TEXT, origin: "speaker-statement", verification: "unverified", evidence: [{ turnId: "t1", sessionId: "s1", quote: TEXT }] };
  const result = p.phase === "extract-summary" ? { processed: p.inventory, items: [{ ...item, kind: "insight" }], qa: [] } :
    p.phase === "extract-claims" ? { processed: p.inventory, claims: [item] } : { processed: p.inventory, complete: true, noContent: false, noClaims: false,
      verdicts: p.items.map((i: { id: string }) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
  return { text: JSON.stringify(result), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
};
const realIndex = (tenantId: string, sessionId: string, db: Parameters<typeof indexSession>[2]["db"]) => indexSession(tenantId, sessionId, { db, complete: complete as never,
  embed: async () => { assert.fail("Vectorless transcript refresh must never request embeddings"); }, strictWebinar: true, dropUnverified: true });

test("real indexer refresh consumes corrections and atomically publishes all targets, preserves reviewed claims/originals", async () => {
  const h = fixture(), originals = structuredClone(h.rows("turns"));
  const state = await runRefresh(createMongoReviewStore(h.db), createTranscriptRefreshExecutor({ db: h.db, index: realIndex }), "t", "s1");
  assert.equal(state?.status, "complete"); assert.deepEqual(state?.completed, TARGETS);
  assert.deepEqual(h.rows("turns"), originals);
  assert.ok(h.rows("claims").some((c) => c._id === "reviewed" && c.status === "verified"));
  assert.ok(h.rows("claims").some((c) => c.text === TEXT));
  assert.ok(JSON.stringify(h.rows("session_pages")).includes(TEXT));
  assert.ok(h.rows("chunks").length); assert.ok(h.rows("tree_index").length);
  assert.ok(h.rows("graph_edges").some((e) => e.from === "person:reviewed" && e.type === "spoke_in"));
  const projected = await createGroundedContentDeps({ async getSessionDetail() {
    return { session: h.rows("sessions")[0], page: h.rows("session_pages")[0], claims: h.rows("claims"),
      turns: await readEffectiveTurns(h.db, "t", h.rows("turns") as ReviewTurn[], "s1") } as never;
  } }).getGroundedContent("t", "s1");
  assert.ok(projected?.notes.length);
  assert.ok(projected!.notes.every((n) => n.evidence.every((e) => e.available && e.quote === TEXT && e.speaker === "Reviewed speaker")));
  const rawProjection = await createGroundedContentDeps({ async getSessionDetail() {
    return { session: h.rows("sessions")[0], page: h.rows("session_pages")[0], claims: h.rows("claims"), turns: h.rows("turns") } as never;
  } }).getGroundedContent("t", "s1");
  assert.ok(rawProjection!.notes.some((n) => n.evidence.some((e) => !e.available)), "raw source does not validate a corrected quote");
  assert.ok(h.calls.every((c) => c.transaction || ["turns", "transcript_reviews"].includes(c.collection)));
  assert.equal(h.maxActive(), 1, "transaction operations are serialized despite indexer Promise.all");
});
test("superseding review before publication aborts every derived write and leaves newer refresh pending", async () => {
  const h = fixture();
  h.onBeforeCommit(() => { const head = h.rows("transcript_reviews")[0]!; head.revision = "r2"; head.refresh = { status: "pending", revision: "r2", targets: TARGETS, completed: [] }; });
  await assert.rejects(createTranscriptRefreshExecutor({ db: h.db, index: realIndex })({ tenantId: "t", sessionId: "s1", revision: "r1", target: "claims" }), /WriteConflict/);
  for (const name of ["session_pages", "chunks", "tree_index", "graph_edges"]) assert.equal(h.rows(name).length, 0, name);
  assert.equal(h.rows("claims").length, 1); assert.equal(h.rows("transcript_reviews")[0]!.revision, "r2");
});

test("correction publication never replays paid work on transient body or commit errors", async () => {
  for (const fault of ["body", "commit"] as const) {
    const h = fixture();
    h.seed("session_pages", { _id: "accepted-page", tenantId: "t", sessionId: "s1", summary: "Previously accepted generation" });
    h.seed("chunks", { _id: "accepted-chunk", tenantId: "t", sessionId: "s1", text: "Previously accepted generation" });
    const names = ["claims", "session_pages", "chunks", "tree_index", "graph_edges"];
    const before = names.map(name => structuredClone(h.rows(name)));
    const transient = Object.assign(new Error(`transient ${fault}`), { hasErrorLabel: (label: string) => label === "TransientTransactionError" });
    let indexCalls = 0, providerCalls = 0, paidAtFault = 0, commits = 0, aborts = 0, convenientCalls = 0, starts = 0;
    const originalStart = h.db.client.startSession.bind(h.db.client);
    h.db.client.startSession = () => {
      const session = originalStart();
      const commit = session.commitTransaction.bind(session), abort = session.abortTransaction.bind(session);
      session.commitTransaction = async () => { commits++; if (fault === "commit" && commits === 1) throw transient; await commit(); };
      session.abortTransaction = async () => { aborts++; await abort(); };
      return new Proxy(session, { get(target, property) {
        if (property === "withTransaction") { convenientCalls++; return target.withTransaction.bind(target); }
        if (property === "startTransaction") return (options: Parameters<typeof target.startTransaction>[0]) => {
          starts++;
          const readConcern = options?.readConcern;
          assert.ok(readConcern && typeof readConcern === "object", "explicit snapshot read-concern object required");
          assert.equal(readConcern.level, "snapshot"); assert.equal(options?.writeConcern?.w, "majority"); target.startTransaction(options);
        };
        const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
      } });
    };
    const executor = createTranscriptRefreshExecutor({ db: h.db, index: async (tenant, session, db) => {
      indexCalls++;
      const result = await indexSession(tenant, session, { db, complete: async job => { providerCalls++; return complete(job as never); },
        embed: async () => { assert.fail("no embeddings during correction"); }, strictWebinar: true, dropUnverified: true });
      paidAtFault = providerCalls;
      if (fault === "body" && indexCalls === 1) throw transient;
      return result;
    } });
    await assert.rejects(executor({ tenantId: "t", sessionId: "s1", revision: "r1", target: "claims" }), /transient/);
    assert.equal(indexCalls, 1, fault); assert.ok(providerCalls > 0); assert.equal(providerCalls, paidAtFault);
    assert.equal(starts, 1); assert.equal(commits, fault === "commit" ? 1 : 0); assert.equal(aborts, 1); assert.equal(convenientCalls, 0);
    assert.deepEqual(names.map(name => h.rows(name)), before, "aborted refresh preserves every accepted derived row");
    assert.equal(h.rows("transcript_reviews")[0]!.refresh.status, "pending");
  }
});

test("correction unknown commit retries only commit with bounded uncertainty and paid work once", async () => {
  for (const exhausted of [false, true]) {
    const h = fixture(); let indexCalls = 0, providerCalls = 0, paidAtCommit = 0, commits = 0, aborts = 0;
    const originalStart = h.db.client.startSession.bind(h.db.client);
    h.db.client.startSession = () => {
      const session = originalStart(), commit = session.commitTransaction.bind(session), abort = session.abortTransaction.bind(session);
      session.commitTransaction = async () => {
        commits++; paidAtCommit ||= providerCalls;
        // The server may have committed before the acknowledgement was lost. A second
        // commit must be idempotent; neither database writes nor providers run again.
        await commit();
        if (exhausted || commits === 1) throw Object.assign(new Error("unknown commit"), {
          hasErrorLabel: (label: string) => label === "UnknownTransactionCommitResult",
        });
      };
      session.abortTransaction = async () => { aborts++; await abort(); };
      return session;
    };
    const executor = createTranscriptRefreshExecutor({ db: h.db, index: async (tenant, session, db) => {
      indexCalls++;
      return indexSession(tenant, session, { db, complete: async job => { providerCalls++; return complete(job as never); },
        embed: async () => { assert.fail("no embeddings during correction"); }, strictWebinar: true, dropUnverified: true });
    } });
    const publication = executor({ tenantId: "t", sessionId: "s1", revision: "r1", target: "claims" });
    if (exhausted) await assert.rejects(publication, /unknown commit/); else await publication;
    assert.equal(indexCalls, 1); assert.ok(providerCalls > 0); assert.equal(providerCalls, paidAtCommit);
    assert.equal(commits, exhausted ? 3 : 2); assert.equal(aborts, 0, "uncertain committed data cannot be rolled back by guessing");
    assert.equal(h.rows("transcript_reviews")[0]!.refresh.status, "complete", "durable head permits later reconciliation without repeated paid work");
    assert.equal(h.rows("session_pages").length, 1); assert.ok(h.rows("chunks").length > 0);
    assert.equal(new Set(h.rows("chunks").map(row => row._id)).size, h.rows("chunks").length, "commit retry creates no duplicate lexical chunks");
  }
});

test("runRefresh reconciles unknown committed head without downgrade or superseded revision leakage", async () => {
  for (const superseded of [false, true]) {
    const h = fixture(); let indexCalls = 0, providerCalls = 0, paidAtCommit = 0, commits = 0, aborts = 0;
    const originalStart = h.db.client.startSession.bind(h.db.client);
    h.db.client.startSession = () => {
      const session = originalStart(), commit = session.commitTransaction.bind(session), abort = session.abortTransaction.bind(session);
      session.commitTransaction = async () => {
        commits++; paidAtCommit ||= providerCalls;
        await commit();
        if (superseded && commits === 1) {
          const head = h.rows("transcript_reviews")[0]!;
          head.revision = "r2"; head.refresh = { status: "pending", revision: "r2", targets: TARGETS, completed: [] };
        }
        throw Object.assign(new Error("unknown commit"), { hasErrorLabel: (label: string) => label === "UnknownTransactionCommitResult" });
      };
      session.abortTransaction = async () => { aborts++; await abort(); };
      return session;
    };
    const executor = createTranscriptRefreshExecutor({ db: h.db, index: async (tenant, session, db) => {
      indexCalls++;
      return indexSession(tenant, session, { db, complete: async job => { providerCalls++; return complete(job as never); },
        embed: async () => { assert.fail("no embeddings during correction"); }, strictWebinar: true, dropUnverified: true });
    } });
    const state = await runRefresh(createMongoReviewStore(h.db), executor, "t", "s1");
    assert.equal(indexCalls, 1); assert.ok(providerCalls > 0); assert.equal(providerCalls, paidAtCommit); assert.equal(commits, 3); assert.equal(aborts, 0);
    const head = h.rows("transcript_reviews")[0]!;
    if (superseded) {
      assert.equal(state, null, "old refresh returns no newer-revision state");
      assert.equal(head.revision, "r2"); assert.equal(head.refresh.status, "pending"); assert.deepEqual(head.refresh.completed, []);
    } else {
      assert.equal(state?.status, "complete"); assert.deepEqual(state?.completed, TARGETS);
      assert.equal(head.refresh.status, "complete"); assert.deepEqual(head.refresh.completed, TARGETS);
    }
  }
});

test("review refresh refuses legacy/vector completion and missing lexical or provenance proof", async () => {
  for (const missing of ["retrievalMode", "lexicalWritten", "provenanceValidated"] as const) {
    const h = fixture();
    const executor = createTranscriptRefreshExecutor({ db: h.db, index: async (tenant, session, db) => {
      const result = await realIndex(tenant, session, db);
      delete result.completion![missing];
      return result;
    } });
    assert.equal((await runRefresh(createMongoReviewStore(h.db), executor, "t", "s1"))?.status, "failed", missing);
    for (const name of ["session_pages", "chunks", "tree_index", "graph_edges"]) assert.equal(h.rows(name).length, 0, `${missing}: ${name}`);
    assert.equal(h.rows("claims").length, 1, "the original reviewed claim survives rollback");
    assert.equal(h.rows("transcript_reviews")[0]!.revision, "r1");
  }
});
test("current generation refuses an unsupported preserved human claim without deleting its row or publishing partial knowledge", async () => {
  const h = fixture(), originals = structuredClone(h.rows("turns"));
  h.rows("claims")[0]!.text = "A human claim unsupported by its current source.";
  const claim = structuredClone(h.rows("claims")[0]);
  const state = await runRefresh(createMongoReviewStore(h.db), createTranscriptRefreshExecutor({ db: h.db, index: realIndex }), "t", "s1");
  assert.equal(state?.status, "failed"); assert.deepEqual(h.rows("claims"), [claim]); assert.deepEqual(h.rows("turns"), originals);
  for (const name of ["session_pages", "chunks", "tree_index", "graph_edges"]) assert.equal(h.rows(name).length, 0);
  assert.equal(h.rows("transcript_reviews")[0]!.revision, "r1");
});
test("text-only review preserves uncertain speaker confidence and graph inference; new mappings invent no score", async () => {
  const h = fixture(), head = h.rows("transcript_reviews")[0]!;
  head.overlay = [{ turnId: "t1", text: TEXT, speakerRef: "spk:0" }];
  head.audit.changes[0].after = { text: TEXT, speakerRef: "spk:0" };
  for (const score of [0.6, 0.9]) h.seed("graph_edges", { _id: `prior-${score}`, tenantId: "t", sessionRef: "s1", from: "spk:0", to: "session:s1", type: "spoke_in", confidence: score, evidence: [{ turnId: "t1", sessionId: "s1" }] });
  assert.equal((await runRefresh(createMongoReviewStore(h.db), createTranscriptRefreshExecutor({ db: h.db, index: realIndex }), "t", "s1"))?.status, "complete");
  const edge = h.rows("graph_edges").find((e) => e.type === "spoke_in")!;
  assert.equal(edge.confidence, 0.6);
  const graph = buildKnowledgeGraph({ treeRoot: null, entityEdges: h.rows("graph_edges"), sessions: [] });
  assert.equal(graph.edges.find((e) => e.type === "spoke_in")!.inferred, true);
  const mapped = fixture();
  await runRefresh(createMongoReviewStore(mapped.db), createTranscriptRefreshExecutor({ db: mapped.db, index: realIndex }), "t", "s1");
  assert.equal("confidence" in mapped.rows("graph_edges").find((e) => e.type === "spoke_in")!, false, "a mapping payload does not supply numerical confidence");
});
test("unsupported Mongo and disappeared reviewed ids fail closed with durable correction truth", async () => {
  for (const orphan of [false, true]) {
    const h = fixture(); if (orphan) h.rows("turns")[0]!._id = "renumbered"; else h.refuseTransactions();
    const state = await runRefresh(createMongoReviewStore(h.db), createTranscriptRefreshExecutor({ db: h.db, index: realIndex }), "t", "s1");
    assert.equal(state?.status, "failed"); assert.equal(h.rows("transcript_reviews")[0]!.revision, "r1");
    assert.equal(h.rows("chunks").length, 0); assert.equal(h.rows("claims").length, 1);
  }
});
test("head audit remains readable after secondary history failure without another human correction", async () => {
  const h = fixture();
  const history = await loadReviewHistory(createMongoReviewStore(h.db), "t", "s1");
  assert.equal(history.length, 1); assert.equal(history[0]!.revision, "r1"); assert.equal(history[0]!.changes[0]!.after.text, TEXT);
  assert.equal(h.rows("transcript_review_revisions").length, 0, "history read does not mutate");
});
test("complete source disappearance invalidates completed refresh but preserves accessible audit/reconciliation", async () => {
  const h = fixture(); h.rows("turns").splice(0);
  h.rows("transcript_reviews")[0]!.refresh = { status: "complete", revision: "r1", targets: TARGETS, completed: TARGETS };
  const store = createMongoReviewStore(h.db), loaded = await loadReview(store, "t", "s1");
  assert.deepEqual(loaded.snapshot.turns, []); assert.deepEqual(loaded.orphanedTurnIds, ["t1"]);
  assert.equal(loaded.refresh?.status, "failed"); assert.equal(loaded.refresh?.failedTarget, "source-reconciliation");
  assert.equal((await loadReviewHistory(store, "t", "s1"))[0]!.changes[0]!.after.text, TEXT);
  await assert.rejects(readEffectiveTurns(h.db, "t", [], "s1"), /reconciliation/);
  const state = await runRefresh(store, createTranscriptRefreshExecutor({ db: h.db, index: realIndex }), "t", "s1");
  assert.equal(state?.status, "failed"); assert.equal(h.rows("transcript_reviews")[0]!.refresh.status, "failed");
});
test("effective reader preserves source extras and rejects wrong tenant; transaction view forbids original writes", async () => {
  const h = fixture(), row = { ...h.rows("turns")[0]!, retainedExtra: "provenance" } as ReviewTurn & { retainedExtra: string };
  const [effective] = await readEffectiveTurns(h.db, "t", [row]);
  assert.equal(effective!.text, TEXT); assert.equal((effective as any).retainedExtra, "provenance");
  await assert.rejects(readEffectiveTurns(h.db, "foreign", [row]), /tenant/);
  const session = h.db.client.startSession(), db = transactionReviewDb(h.db, session, "t");
  assert.throws(() => db.collection("turns").updateOne({ tenantId: "t" }, { $set: { text: "overwrite" } }), /Original transcript/);
  assert.throws(() => db.collection("claims").find({ tenantId: "foreign" }), /Unscoped/);
  await session.endSession();
});

test("retained TOC literal valid prefix commits one overlay and actual chunk consumer uses corrected projection", {
  skip: process.env.T054_AUTHENTIC_INPUT_OPT_IN !== "1",
}, async () => {
  const configPath = process.env.T054_AUTHENTIC_INPUT_CONFIG;
  assert.ok(configPath, "Opted-in private fixture requires an explicit oracle config");
  const configBytes = readFileSync(configPath);
  assert.equal(createHash("sha256").update(configBytes).digest("hex"), "b6bebe4c3dcd07e87bff5fd586b40f330043af5dc3aec6f83379fe614e8c9755", "Private fixture oracle changed");
  const oracle: unknown = JSON.parse(configBytes.toString("utf8"));
  assert.ok(oracle && typeof oracle === "object");
  assert.ok("fixtureUrl" in oracle && typeof oracle.fixtureUrl === "string");
  assert.ok("expectedSessionId" in oracle && typeof oracle.expectedSessionId === "string");
  assert.ok("expected" in oracle && oracle.expected && typeof oracle.expected === "object");
  const expected = oracle.expected;
  assert.ok("prefixTurns" in expected && typeof expected.prefixTurns === "number");
  assert.ok("sourceTurns" in expected && typeof expected.sourceTurns === "number");
  assert.ok("invalidTurnIndex" in expected && typeof expected.invalidTurnIndex === "number");
  assert.ok("invalidStart" in expected && typeof expected.invalidStart === "number");
  assert.ok("invalidEnd" in expected && typeof expected.invalidEnd === "number");
  const source = JSON.parse(readFileSync(new URL(oracle.fixtureUrl, import.meta.url), "utf8")) as ReviewTurn[];
  const turns = source.slice(0, expected.prefixTurns), first = turns[0]!, original = JSON.stringify(turns);
  assert.equal(first.sessionId, oracle.expectedSessionId);
  assert.equal(source.length, expected.sourceTurns); assert.equal(source[expected.invalidTurnIndex]!.tStart, expected.invalidStart); assert.equal(source[expected.invalidTurnIndex]!.tEnd, expected.invalidEnd);
  const h = transactionalFixture(); for (const turn of turns) h.seed("turns", turn);
  h.seed("sessions", { _id: first.sessionId, tenantId: first.tenantId, sourceId: "offline-fixture-source",
    title: "Offline review fixture", date: "2026-10-15", status: { transcribe: "done", index: "pending" } });
  const store = createMongoReviewStore(h.db), snapshot = (await loadReview(store, first.tenantId, first.sessionId)).snapshot;
  const marker = "[offline durable review fixture]";
  const receipt = await commitReview(store, { tenantId: first.tenantId, sessionId: first.sessionId, actorRef: "maker:offline-fixture", now: "2026-10-14T20:00:00Z",
    request: { expectedRevision: snapshot.revision, reason: "Offline sample fixture only", corrections: [{ turnId: first._id, text: `${first.text} ${marker}` }] } });
  const effective = await readEffectiveTurns(h.db, first.tenantId, turns, first.sessionId);
  assert.equal(effective.find((t) => t._id === first._id)!.text, `${first.text} ${marker}`);
  assert.deepEqual(effective.filter((t) => t._id !== first._id), turns.filter((t) => t._id !== first._id));
  assert.equal(JSON.stringify(turns), original); assert.equal(JSON.stringify(h.rows("turns")), original);
  assert.ok(buildChunks(effective as never).some((c) => c.text.includes(marker)));
  assert.equal(receipt.commit, "committed"); assert.equal(receipt.refresh, "pending");
  console.log(JSON.stringify({ retainedSource: first.sessionId, sourceTurns: source.length, literalPrefixTurns: turns.length, correctedTurns: 1, rawPreserved: true, chunkConsumerCorrected: true, refresh: receipt.refresh }));
});
