/**
 * ISS-WA-REVIEW-WIRE-006 (T-007, qa/contracts/whatsapp-ingestion-first-slice.md criterion 9): one planted-text regression per trusted reader.
 * Unreviewed (pending), rejected and old-wiring WhatsApp material must reach none of: lexical search, semantic search, the /ask tree,
 * vector and lexical arms, the claims list, topic catalog, knowledge outputs, the eligible-tree input, brain/citation/tree/graph reads.
 * The public control session must still be served, so a reader that returns nothing cannot pass.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import type { Claims, TreeIndexNode } from "@lkb/core";
import { createMongoSearchDeps } from "../search-store.js";
import { readCurrentSemanticCorpus } from "../semantic-search/current-corpus.js";
import { createMongoSemanticSearchDeps } from "../semantic-search/semantic-search-store.js";
import { createAskArmsFor } from "../ask/ask-arms.js";
import { createMongoOutputReader } from "../knowledge-outputs/reader.js";
import { createMongoClaimsListDeps, type ClaimsListReaders } from "../claims/store.js";
import { eligibleTreeInput } from "../indexing/eligible-tree.js";
import { createMongoKnowledgeCatalog } from "../knowledge/catalog-store.js";
import { chunkContentId } from "../indexing/chunk-integrity.js";
import { leaks, PLANT, PUBLIC_TEXT, PUB_SESSION, TENANT, WA_SESSION, waWorld, type Row, type WaState } from "./wa-quarantine.testsupport.js";

const UNAPPROVED: WaState[] = ["pending", "rejected"];

/** Content-bound chunk ids, exactly as the indexer writes them, so a leak is not masked by an integrity failure. */
function bindChunks(w: ReturnType<typeof waWorld>) {
  for (const chunk of w.data.chunks!) {
    const turns = (chunk.turnRefs as string[]).map(id => String(w.data.turns!.find(t => t._id === id)!.text).trim());
    chunk._id = chunkContentId(chunk.tenantId as string, chunk.sourceRef as string, chunk.turnRefs as string[], turns.join(" "));
  }
  return w;
}

for (const state of UNAPPROVED) {
  test(`lexical /search never returns ${state} WhatsApp turns, but still serves public turns`, async () => {
    const w = waWorld(state);
    const hits = await createMongoSearchDeps({ db: w.db as unknown as Db }).search(TENANT, "PLANTZEBRA scholarship deadline", 5);
    assert.deepEqual(hits.filter(h => h.sessionId === WA_SESSION), []);
    assert.deepEqual(leaks(hits), []);
    const control = await createMongoSearchDeps({ db: w.db as unknown as Db }).search(TENANT, "engineering admissions cutoff", 5);
    assert.equal(control.some(h => h.sessionId === PUB_SESSION), true);
  });

  test(`semantic corpus excludes ${state} WhatsApp turns, sessions and chunks`, async () => {
    const w = bindChunks(waWorld(state));
    const corpus = await readCurrentSemanticCorpus(TENANT, w.db);
    assert.deepEqual([...corpus.sessions.keys()], [PUB_SESSION]);
    assert.deepEqual(corpus.turns.map(t => t._id), ["pub-turn-1"]);
    assert.deepEqual(corpus.chunks.map(c => c.sourceRef), [PUB_SESSION]);
    assert.deepEqual(leaks([...corpus.turns, ...corpus.chunks]), []);
  });

  test(`semantic search ranks a ${state} WhatsApp chunk nowhere even when its vector is the nearest`, async () => {
    const w = bindChunks(waWorld(state));
    const deps = createMongoSemanticSearchDeps({ db: w.db, embed: async () => ({ kind: "embedding", vectors: [[1, 0]], dims: 2, model: "m" }) as never });
    const hits = await deps.search(TENANT, "PLANTZEBRA scholarship deadline", 5, "chunks").catch((error: unknown) => ({ error: String(error) }));
    assert.deepEqual(leaks(hits), []);
    assert.equal(Array.isArray(hits) && hits.some(h => h.sessionId === WA_SESSION), false);
  });

  test(`/ask lexical and vector arms never propose the ${state} WhatsApp session node`, async () => {
    const w = bindChunks(waWorld(state));
    const arms = createAskArmsFor({ db: w.db, k: 5, embed: async () => ({ kind: "embedding", vectors: [[1, 0]], dims: 2, model: "m" }) as never })(TENANT);
    const result = await arms("PLANTZEBRA scholarship deadline", w.treeRoot as unknown as TreeIndexNode);
    const proposed = result.arms.flat().map(n => n.evidence?.sessionRef);
    assert.equal(proposed.includes(WA_SESSION), false, `arms proposed ${JSON.stringify(proposed)}`);
    assert.deepEqual(leaks(result.arms.flat()), []);
  });

  test(`claims list hides the old-wiring needs-review WhatsApp claim while ${state}`, async () => {
    const w = waWorld(state);
    const readers: ClaimsListReaders = {
      claims: () => ({ find: (filter: Row) => memoryClaims(w, filter) }) as never,
      sessions: () => ({ find: () => ({ toArray: async () => [] }) }) as never,
    };
    const listed = await createMongoClaimsListDeps(readers, () => w.db).listClaims(TENANT, { limit: 50, offset: 0 } as never);
    assert.deepEqual(leaks(listed), []);
    assert.equal(JSON.stringify(listed).includes("claim-wa-old"), false);
    assert.equal(JSON.stringify(listed).includes("claim-pub"), true);
  });

  test(`knowledge outputs refuse a ${state} WhatsApp session and expose none of its claims or turns`, async () => {
    const w = waWorld(state);
    const read = createMongoOutputReader(w.db as unknown as Db);
    await assert.rejects(() => read(TENANT, [WA_SESSION]), (error: unknown) => (error as { status?: number }).status === 404);
    await assert.rejects(() => read(TENANT, [PUB_SESSION, WA_SESSION]), (error: unknown) => (error as { status?: number }).status === 404);
    const control = await read(TENANT, [PUB_SESSION]);
    assert.deepEqual(leaks(control), []);
    assert.equal(control.sessions.length, 1);
  });

  test(`eligible tree input drops the ${state} WhatsApp session and its page, and never retains a stale root`, async () => {
    const w = waWorld(state);
    const out = await eligibleTreeInput(w.db, TENANT, w.data.sessions as never, w.data.session_pages as never, w.treeRoot);
    assert.deepEqual(out.sessions.map(s => s._id), [PUB_SESSION]);
    assert.deepEqual(out.pages.map(p => p.sessionId), [PUB_SESSION]);
    assert.equal(out.existingRoot, undefined, "a cached root that cites the WhatsApp node must be rebuilt, not retained");
    assert.deepEqual(leaks(out), []);
  });

  test(`topic catalog hides ${state} WhatsApp claims and sessions`, async () => {
    const w = waWorld(state);
    w.data.topics = [{ _id: "topic-x", tenantId: TENANT, title: "Scholarships", sessionRefs: [WA_SESSION, PUB_SESSION], claimRefs: [] }];
    w.data.knowledge_collections = [];
    const catalog = createMongoKnowledgeCatalog(w.db as unknown as Db);
    const listed = await catalog.topics(TENANT).catch(() => [] as unknown[]);
    const detail = await catalog.topic(TENANT, "topic-x").catch(() => null);
    assert.deepEqual(leaks([listed, detail]), []);
  });
}

function memoryClaims(w: ReturnType<typeof waWorld>, filter: Row) {
  const rows = (w.data.claims as unknown as Claims[]).filter(c => (filter.status === undefined || c.status === filter.status)
    && (filter._id === undefined || String(c._id) > String((filter._id as { $gt: string }).$gt))).sort((a, b) => (a._id < b._id ? -1 : 1));
  const api = { sort: () => api, skip: () => api, limit: () => api, toArray: async () => structuredClone(rows) };
  return api;
}

test("approved WhatsApp text is the only WhatsApp text any trusted reader serves; the sibling turn and group title never leave", async () => {
  const w = bindChunks(waWorld("approved"));
  const hits = await createMongoSearchDeps({ db: w.db as unknown as Db }).search(TENANT, "PLANTZEBRA UNREVIEWEDOCELOT scholarship tuition", 5);
  assert.equal(hits.some(h => h.turnId === "wa-turn-2"), false);
  assert.deepEqual(leaks(hits, { allowApprovedText: true }), []);
  const corpus = await readCurrentSemanticCorpus(TENANT, w.db);
  assert.equal(corpus.turns.some(t => t._id === "wa-turn-2"), false);
  assert.deepEqual(leaks([...corpus.turns, ...corpus.chunks, ...[...corpus.sessions.values()]], { allowApprovedText: true }), []);
  const out = await eligibleTreeInput(w.db, TENANT, w.data.sessions as never, w.data.session_pages as never, w.treeRoot);
  assert.equal(out.sessions.some(s => s._id === WA_SESSION), false, "aggregate pages never include a chat session");
  assert.ok(PLANT.length > 0 && PUBLIC_TEXT.length > 0);
});
