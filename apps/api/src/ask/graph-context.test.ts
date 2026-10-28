import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexNode } from "@lkb/core";
import { createGraphContextFor, createMongoGraphSnapshotReader, type GraphContextSnapshot } from "./graph-context.js";
import { publicPreservedReviewFixture, PUBLIC_REVIEW_QUOTE } from "../indexing/public-preserved-review.fixture.js";
import { indexSession } from "../indexing/session.js";
import { createSourceRequestDepsFor } from "./source-context.js";

const node = (s: string): TreeIndexNode => ({ node_id: `tenant:A/session:${s}`, level: "session", title: s, summary: "", children: [], evidence: { sessionRef: s } });
const tree: TreeIndexNode = { node_id: "root", level: "topic", title: "Root", summary: "", children: [node("one"), node("two")] };
function snapshot(): GraphContextSnapshot {
  const source = (s: string) => ({ tenantId: "A", sessionId: s, sourceId: `source:${s}`, revisionHash: "a".repeat(64) });
  return { visibleSources: [source("one"), source("two")], turns: [{ sessionId: "one", turnId: "turn:1", quote: "Evidence" }], edges: [
    { id: "speaker-one", tenantId: "A", status: "accepted", from: { kind: "speaker", ref: "person:a" }, to: { kind: "statement", ref: "c1" }, provenance: [source("one")] },
    { id: "speaker-two", tenantId: "A", status: "accepted", from: { kind: "speaker", ref: "person:a" }, to: { kind: "statement", ref: "c2" }, provenance: [source("two")] },
    { id: "topic-one", tenantId: "A", status: "accepted", from: { kind: "topic", ref: "topic:x" }, to: { kind: "statement", ref: "c1" }, provenance: [source("one")] },
  ] };
}
test("API graph consumer calls actual bounded helper with dimension intersection and request-local authority", async () => {
  const calls: unknown[] = [];
  const make = createGraphContextFor({ async readSnapshot(t, selected) { calls.push([t, selected]); return snapshot(); } });
  const graph = make("A", { speakerRefs: ["person:a"], topicRefs: ["topic:x"] });
  const result = await graph.arm("ignored hint", tree);
  assert.deepEqual(result.arms[0]!.map(n => n.node_id), [node("one").node_id]);
  assert.deepEqual([...await graph.allowedTurns()], ['["one","turn:1"]']); assert.equal(calls.length, 1);
  await make("A", { speakerRefs: ["person:a"] }).arm("hint", tree); assert.equal(calls.length, 2);
});
test("API graph consumer refuses malformed selections before source reads", () => {
  let calls = 0; const factory = createGraphContextFor({ async readSnapshot() { calls++; return snapshot(); } });
  for (const selected of [{ speakerRefs: ["not-person"] }, { speakerRefs: ["person:a", "person:a"] }, { speakerRefs: Array.from({ length: 17 }, (_, n) => `person:${n}`) }, { speakerRefs: ["person:a"], actorId: "forged" }]) assert.throws(() => factory("A", selected));
  assert.equal(calls, 0);
});
test("API graph consumer omits suggested foreign stale and tree-excluded graph proofs", async () => {
  for (const change of [(s: GraphContextSnapshot) => { s.edges.forEach(e => { e.status = "suggested"; }); }, (s: GraphContextSnapshot) => { s.edges.forEach(e => { e.tenantId = "FOREIGN"; }); }, (s: GraphContextSnapshot) => { s.visibleSources.forEach(s => { s.revisionHash = "b".repeat(64); }); }]) {
    const s = snapshot(); change(s); const graph = createGraphContextFor({ async readSnapshot() { return s; } })("A", { speakerRefs: ["person:a"] });
    const result = await graph.arm("hint", tree); assert.deepEqual(result.arms, [[]]); assert.ok(result.degraded);
  }
  const graph = createGraphContextFor({ async readSnapshot() { return snapshot(); } })("A", { speakerRefs: ["person:a"] });
  assert.deepEqual((await graph.arm("hint", { ...tree, children: [] })).arms, [[]]);
});
test("API graph consumer sanitizes snapshot failures and copies trusted mutable projection", async () => {
  const graph = createGraphContextFor({ async readSnapshot() { throw new Error("SECRET transcript"); } })("A", { speakerRefs: ["person:a"] });
  const r = await graph.arm("hint", tree); assert.deepEqual(r.arms, [[]]); assert.equal(r.degraded!.includes("SECRET"), false);
  const s = snapshot(); const copied = createGraphContextFor({ async readSnapshot() { return s; } })("A", { speakerRefs: ["person:a"] });
  await copied.scope(); s.edges.length = 0; assert.equal((await copied.arm("hint", tree)).arms[0]!.length, 2);
});
test("Mongo graph reader refuses unavailable snapshots without any collection access", async () => {
  let reads = 0; const read = createMongoGraphSnapshotReader({ collection() { reads++; throw new Error("must not read"); } } as unknown as Db);
  await assert.rejects(read("A", { speakerRefs: ["person:a"] }), /snapshot unavailable/); assert.equal(reads, 0);
  await assert.rejects(read("A", { topicRefs: ["topic:x"] }), /snapshot unavailable/); assert.equal(reads, 0);
});

async function publishedTopic() {
  const f = publicPreservedReviewFixture({ preserveReview: false });
  await indexSession("tenant-a", "session-a", f.deps);
  const root = f.rows("tree_index")[0] as unknown as TreeIndexNode;
  const stack = [root]; let sessionNode: TreeIndexNode | undefined;
  while (stack.length) { const n = stack.pop()!; if (n.level === "session" && n.evidence?.sessionRef === "session-a") sessionNode = n; stack.push(...n.children); }
  assert.ok(sessionNode);
  sessionNode.children.push({ node_id: `${sessionNode.node_id}/topic:fee-policy`, level: "topic", title: PUBLIC_REVIEW_QUOTE, summary: "", children: [], evidence: { sessionRef: "session-a" } });
  const canonical = "tenant-a:fee-policy";
  f.rows("topics").push({ _id: canonical, tenantId: "tenant-a", name: PUBLIC_REVIEW_QUOTE, sessionRefs: ["session-a"] });
  for (const claim of f.rows("claims")) claim.topicRefs = [canonical];
  const reads: { name: string; filter: unknown }[] = [];
  const db = { client: { startSession: () => ({ withTransaction: async (run: () => Promise<unknown>) => run(), async endSession() {} }) },
    collection(name: string) { const original = f.db.collection(name); return { ...original,
      find(filter: Record<string, unknown>) { reads.push({ name, filter }); let limit = Infinity; const cursor = original.find(filter);
        const bound = { limit(n: number) { limit = n; return bound; }, sort() { return bound; }, async toArray() { return (await cursor.toArray()).slice(0, limit); } }; return bound; },
      findOne(filter: Record<string, unknown>) { reads.push({ name, filter }); return original.findOne(filter); },
    }; } } as unknown as Db;
  return { f, db, root, canonical, reads };
}
test("topic-only actual Mongo reader and request factory consume current published exact source without embeddings", async () => {
  const { db, root, canonical, reads } = await publishedTopic(); let embeddingCalls = 0;
  const deps = createSourceRequestDepsFor({ db, graph: { readSnapshot: createMongoGraphSnapshotReader(db) },
    embed: async () => { embeddingCalls++; throw new Error("embedding forbidden"); }, write: async () => {}, treeSearchFn: () => [],
    dispatch: async () => { throw new Error("no completion needed for source admission fixture"); } })("tenant-a", { topicRefs: [canonical] });
  const candidates = await deps.extraCandidateArmsFn!("fee", root); assert.ok(candidates.arms.flat().length, candidates.degraded ?? "topic journey returned no nodes");
  const admitted = [...new Map(candidates.arms.flat().map(n => [n.node_id, n])).values()];
  const hydrated = await deps.sourceContext!.hydrate("fee rupees", admitted); assert.ok(hydrated.nodes.length);
  const quotes = hydrated.nodes.flatMap(n => n.evidence!.sourceQuotes as { quote: string; turnId: string }[]);
  assert.ok(quotes.every(q => q.turnId === "t1" && q.quote.includes("5000 rupees"))); assert.equal(embeddingCalls, 0);
  const topicRead = reads.find(r => r.name === "topics")!;
  assert.deepEqual(topicRead.filter, { _id: { $in: [canonical] }, tenantId: "tenant-a" });
  assert.equal(reads.some(r => r.name === "speakers"), false);
});
test("topic-only current publication withholds stale foreign unpublished and ungrounded canonical topics", async () => {
  const { f, db, canonical } = await publishedTopic(); const read = createMongoGraphSnapshotReader(db);
  const topic = f.rows("topics").find(t => t._id === canonical)!, session = f.rows("sessions")[0]!, turn = f.rows("turns")[0]!;
  assert.ok((await read("tenant-a", { topicRefs: [canonical] })).edges.length);
  const original = turn.text; turn.text = `${original} changed after publication`;
  assert.deepEqual((await read("tenant-a", { topicRefs: [canonical] })).edges, []); turn.text = original;
  const status = session.status as Record<string, unknown>; status.index = "processing";
  assert.deepEqual((await read("tenant-a", { topicRefs: [canonical] })).edges, []); status.index = "done";
  topic.tenantId = "foreign"; assert.deepEqual((await read("tenant-a", { topicRefs: [canonical] })).edges, []); topic.tenantId = "tenant-a";
  assert.deepEqual((await read("foreign", { topicRefs: [canonical] })).edges, []);
  const root = f.rows("tree_index")[0] as unknown as TreeIndexNode; const stack = [root];
  while (stack.length) { const n = stack.pop()!; if (n.node_id.endsWith("/topic:fee-policy")) n.title = "Fabricated label absent from source"; stack.push(...n.children); }
  assert.deepEqual((await read("tenant-a", { topicRefs: [canonical] })).edges, []);
});
test("API graph consumer applies OR within topic IDs and AND across speaker and topic dimensions", async () => {
  const s = snapshot(); s.edges.push({ ...s.edges[2]!, id: "topic-two", from: { kind: "topic", ref: "topic:y" }, to: { kind: "statement", ref: "c2" }, provenance: [s.visibleSources[1]!] });
  const make = createGraphContextFor({ async readSnapshot() { return s; } });
  const topicOnly = await make("A", { topicRefs: ["topic:x", "topic:y"] }).arm("hint", tree);
  assert.deepEqual(topicOnly.arms[0]!.map(n => n.evidence!.sessionRef), ["one", "two"]);
  const intersect = await make("A", { speakerRefs: ["person:a"], topicRefs: ["topic:x"] }).arm("hint", tree);
  assert.deepEqual(intersect.arms[0]!.map(n => n.evidence!.sessionRef), ["one"]);
  const foreignSpeaker = await make("A", { speakerRefs: ["person:other"], topicRefs: ["topic:x"] }).arm("hint", tree);
  assert.deepEqual(foreignSpeaker.arms, [[]]);
});
test("Mongo graph reader opens read-only snapshot and loads only explicit speaker identities", async () => {
  const calls: unknown[] = []; const session = { async withTransaction(run: () => Promise<unknown>, options: unknown) { calls.push(["transaction", options]); return run(); }, async endSession() { calls.push("end"); } };
  const db = { client: { startSession() { return session; } }, collection(name: string) { return { async findOne(filter: unknown, options: unknown) { calls.push([name, filter, options]); return null; } }; } } as unknown as Db;
  const result = await createMongoGraphSnapshotReader(db)("A", { speakerRefs: ["person:a", "person:b"] });
  assert.deepEqual(result, { edges: [], visibleSources: [], turns: [] });
  const reads = calls.filter(c => Array.isArray(c) && c[0] === "speakers") as unknown[][];
  assert.deepEqual(reads.map(r => r[1]), [{ personId: "person:a", tenantId: "A" }, { personId: "person:b", tenantId: "A" }]);
  assert.ok(reads.every(r => (r[2] as { session: unknown }).session === session)); assert.equal(calls.at(-1), "end");
});

// ISS-WA-REVIEW-WIRE-006 (T-007 criterion 9): the ask graph arm must not turn unreviewed WhatsApp claims into topic edges or allowed turns.
test("topic graph snapshot withholds a published topic once its session source is an unreviewed WhatsApp batch", async () => {
  const { f, db, canonical } = await publishedTopic(); const read = createMongoGraphSnapshotReader(db);
  const control = await read("tenant-a", { topicRefs: [canonical] });
  assert.ok(control.edges.length && control.turns.length && control.visibleSources.length, "control: the public published topic is served");
  const source = f.rows("sources")[0]!; const original = source.kind;
  source.kind = "whatsapp-batch";
  const quarantined = await read("tenant-a", { topicRefs: [canonical] });
  assert.deepEqual(quarantined.edges, []); assert.deepEqual(quarantined.turns, []); assert.deepEqual(quarantined.visibleSources, []);
  source.kind = original;
  assert.ok((await read("tenant-a", { topicRefs: [canonical] })).edges.length, "restoring the recording source restores the edges");
});
