/**
 * T-008: semantic-search-store — fakes only (in-memory db that APPLIES filters, stub embedder).
 * The tenant boundary is asserted on the filter that reaches `find`/`findOne` (ISS-078), and
 * behaviourally: another tenant's closer vector must never be returned.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMongoSemanticSearchDeps, semanticSearchEnabled } from "./semantic-search-store.js";
import { chunkContentId } from "../indexing/chunk-integrity.js";
import { SemanticIndexPendingError } from "./readiness.js";
import { buildSourceSlices } from "@lkb/index";
import { corpusFixtureDb } from "./corpus-fixture.js";

const CHUNKS = [
  { _id: "c1", tenantId: "toc", sourceRef: "s1", turnRefs: ["t1"], vector: [1, 0] },
  { _id: "c2", tenantId: "toc", sourceRef: "s1", turnRefs: ["t1", "t3"], vector: [0.9, 0.1] },
  { _id: "c3", tenantId: "toc", sourceRef: "s2", turnRefs: ["t2"], vector: [0, 1] },
  { _id: "c4", tenantId: "toc", sourceRef: "s3", vector: [1, 0, 0] }, // dimension mismatch: skipped
  { _id: "c5", tenantId: "toc", sourceRef: "s4" }, // no vector
  { _id: "x1", tenantId: "other", sourceRef: "s9", turnRefs: ["t9"], vector: [1, 0] }, // other tenant, perfect match
];
const TURNS = [
  { _id: "t1", tenantId: "toc", sessionId: "s1", speakerRef: "speaker:1", tStart: 3, tEnd: 9, text: "Visa rules matter. Apply early." },
  { _id: "t3", tenantId: "toc", sessionId: "s1", speakerRef: "speaker:1", tStart: 9, tEnd: 12, text: "Check the application deadline." },
  { _id: "t2", tenantId: "toc", sessionId: "s2", speakerRef: "speaker:2", tStart: 1, tEnd: 2, text: "Portfolios win." },
  { _id: "t9", tenantId: "other", sessionId: "s9", speakerRef: "speaker:9", tStart: 0, tEnd: 1, text: "Secret other tenant text." },
];
for (const chunk of CHUNKS) {
  if (chunk.turnRefs) chunk._id = chunkContentId(chunk.tenantId, chunk.sourceRef, chunk.turnRefs,
    chunk.turnRefs.map(id => TURNS.find(turn => turn._id === id)!.text.trim()).join(" "));
}
const EMBEDDED_CHUNKS = CHUNKS.map(chunk => ({ ...chunk, embeddingModel: "fake" }));
const SESSIONS = [
  { _id: "s1", tenantId: "toc", sourceId: "doc1", title: "One", date: "2026-10-14", status: { transcribe: "done", index: "done" } },
  { _id: "s2", tenantId: "toc", sourceId: "doc2", title: "Two", date: "2026-10-14", status: { transcribe: "done", index: "done" } },
  { _id: "s9", tenantId: "other", sourceId: "doc9", title: "Other", date: "2026-10-14", status: { transcribe: "done", index: "done" } },
];
interface Call { coll: string; op: string; filter: Record<string, unknown> }

function fakeDb() {
  const calls: Call[] = [];
  const db = corpusFixtureDb({ chunks: EMBEDDED_CHUNKS, turns: TURNS, sessions: SESSIONS,
    sources: [{ _id: "doc1", tenantId: "toc", kind: "document" }, { _id: "doc2", tenantId: "toc", kind: "document" },
      { _id: "doc9", tenantId: "other", kind: "document" }] } as never, calls);
  return { db: db as never, calls };
}
const embed = async () => ({ vectors: [[1, 0]], dims: 2, provider: "fake", model: "fake" });

test("every query carries the tenantId inside the filter (ISS-078)", async () => {
  const { db, calls } = fakeDb();
  await createMongoSemanticSearchDeps({ embed, db }).search("toc", "q", 10);
  assert.ok(calls.some((c) => c.coll === "chunks") && calls.some((c) => c.coll === "sessions"));
  for (const c of calls) assert.equal(c.filter.tenantId, "toc", `${c.coll}.${c.op} lacks tenantId`);
});

test("another tenant's perfect match is never returned; ranking, dedupe, mismatch and missing vector handled", async () => {
  const { db } = fakeDb();
  const hits = await createMongoSemanticSearchDeps({ embed, db }).search("toc", "q", 10);
  assert.deepEqual(hits.map((h) => h.sessionId), ["s1", "s2"]);
  assert.equal(hits[0]?.chunkId, CHUNKS[0]!._id);
  assert.equal(hits[0]?.session?.title, "One");
  assert.ok(hits.every((h) => (h.session as { tenantId?: string } | null)?.tenantId === "toc"));
  const other = await createMongoSemanticSearchDeps({ embed, db }).search("other", "q", 10);
  assert.deepEqual(other.map((h) => h.sessionId), ["s9"]);
});

test("k limits results; invalid tenantId is refused before any read", async () => {
  const { db, calls } = fakeDb();
  const deps = createMongoSemanticSearchDeps({ embed, db });
  assert.equal((await deps.search("toc", "q", 1)).length, 1);
  calls.length = 0;
  await assert.rejects(() => deps.search("", "q", 5));
  await assert.rejects(() => deps.search({ $ne: null } as never, "q", 5));
  assert.equal(calls.length, 0);
});

test("embedder returning no vector throws instead of ranking garbage", async () => {
  const { db } = fakeDb();
  const deps = createMongoSemanticSearchDeps({ embed: async () => ({ vectors: [], dims: 0, provider: "f", model: "f" }), db });
  await assert.rejects(() => deps.search("toc", "q", 5), /no query vector/);
});

test("flag is OFF unless exactly LKB_SEMANTIC_SEARCH=1", () => {
  assert.equal(semanticSearchEnabled({}), false);
  for (const v of ["0", "true", "", "yes"]) assert.equal(semanticSearchEnabled({ LKB_SEMANTIC_SEARCH: v }), false);
  assert.equal(semanticSearchEnabled({ LKB_SEMANTIC_SEARCH: "1" }), true);
});

test("hits carry turn/time/quote evidence (additive); turns are loaded tenant-pinned", async () => {
  const { db, calls } = fakeDb();
  const hits = await createMongoSemanticSearchDeps({ embed, db }).search("toc", "visa", 10);
  assert.deepEqual(hits.map((h) => h.sessionId), ["s1", "s2"]);
  assert.deepEqual(hits[0]?.turnIds, ["t1"]);
  assert.equal(hits[0]?.tStart, 3);
  assert.equal(hits[0]?.tEnd, 9);
  assert.equal(hits[0]?.quote?.text, "Visa rules matter.");
  const tc = calls.filter((c) => c.coll === "turns");
  assert.ok(tc.length >= 1);
  for (const c of tc) assert.equal(c.filter.tenantId, "toc");
  const other = await createMongoSemanticSearchDeps({ embed, db }).search("other", "q", 10);
  assert.equal(other[0]?.quote?.text, "Secret other tenant text.");
  assert.ok(hits.every((h) => !JSON.stringify(h).includes("Secret")));
});

test("missing source turns quarantine their chunks before ranking", async () => {
  const { db } = fakeDb();
  TURNS.splice(0, 1);
  try {
    assert.deepEqual((await createMongoSemanticSearchDeps({ embed, db }).search("toc", "q", 10)).map(hit => hit.sessionId), ["s2"]);
  } finally {
    TURNS.unshift({ _id: "t1", tenantId: "toc", sessionId: "s1", speakerRef: "speaker:1", tStart: 3, tEnd: 9, text: "Visa rules matter. Apply early." });
  }
});

test("chunk mode preserves multiple passages per source; default still dedupes before k", async () => {
  const { db, calls } = fakeDb();
  const deps = createMongoSemanticSearchDeps({ embed, db });
  const chunks = await deps.search("toc", "visa", 2, "chunks");
  assert.deepEqual(chunks.map(hit => hit.chunkId), [CHUNKS[0]!._id, CHUNKS[1]!._id]);
  assert.deepEqual(chunks.map(hit => hit.sessionId), ["s1", "s1"]);
  assert.deepEqual((await deps.search("toc", "visa", 2)).map(hit => hit.sessionId), ["s1", "s2"]);
  for (const hit of chunks) {
    assert.equal(hit.quote?.speakerRef, "speaker:1");
    assert.equal(hit.quote?.tStart, 3);
    assert.equal(hit.quote?.tEnd, 9);
    assert.equal(TURNS[0]!.text.slice(hit.quote!.charStart, hit.quote!.charEnd), hit.quote!.text);
  }
  for (const call of calls) assert.equal(call.filter.tenantId, "toc");
});

test("malformed query embeddings and foreign joined sessions fail closed", async () => {
  const { db } = fakeDb();
  for (const result of [{ vectors: [[NaN, 0]], dims: 2 }, { vectors: [[1, 0]], dims: 3 }]) {
    await assert.rejects(() => createMongoSemanticSearchDeps({ db, embed: async () => ({ ...result, provider: "f", model: "f" }) }).search("toc", "q", 2), /malformed query vector/);
  }
  const corrupted = { collection: (name: string) => name === "sessions" ?
    { findOne: async () => ({ _id: "s1", tenantId: "other", title: "SECRET" }) } :
    (db as unknown as { collection(name: string): unknown }).collection(name) };
  assert.deepEqual(await createMongoSemanticSearchDeps({ db: corrupted as never, embed }).search("toc", "q", 1, "chunks"), []);
});

test("chunk mode refuses absent attribution or source session instead of inventing a citation", async () => {
  const { db } = fakeDb();
  const deps = createMongoSemanticSearchDeps({ db, embed });
  const speaker = TURNS[0]!.speakerRef;
  TURNS[0]!.speakerRef = "";
  try { assert.deepEqual((await deps.search("toc", "q", 1, "chunks")).map(hit => hit.sessionId), ["s2"]); }
  finally { TURNS[0]!.speakerRef = speaker; }
  const session = SESSIONS.shift()!;
  try {
    assert.deepEqual((await deps.search("toc", "q", 1, "chunks")).map(hit => hit.sessionId), ["s2"]);
    assert.deepEqual((await deps.search("toc", "q", 1)).map(hit => hit.sessionId), ["s2"], "default dedupe also quarantines unavailable sources");
  } finally { SESSIONS.unshift(session); }
});

test("source text changed without a successful re-embedding cannot return an old vector hit", async () => {
  const { db } = fakeDb();
  const original = TURNS[0]!.text;
  TURNS[0]!.text = "Updated policy; the old embedding is stale.";
  try { await assert.rejects(() => createMongoSemanticSearchDeps({ embed, db }).search("toc", "visa", 1, "chunks"), SemanticIndexPendingError); }
  finally { TURNS[0]!.text = original; }
});

test("equal dimensions across different or missing model identities refuse instead of scoring", async () => {
  const { db } = fakeDb();
  await assert.rejects(() => createMongoSemanticSearchDeps({ db,
    embed: async () => ({ ...await embed(), model: "different-model" }) }).search("toc", "q", 1), SemanticIndexPendingError);
  const original = EMBEDDED_CHUNKS[0]!.embeddingModel;
  EMBEDDED_CHUNKS[0]!.embeddingModel = "other-model";
  try { await assert.rejects(() => createMongoSemanticSearchDeps({ db, embed }).search("toc", "q", 1), SemanticIndexPendingError); }
  finally { EMBEDDED_CHUNKS[0]!.embeddingModel = original; }
  await assert.rejects(() => createMongoSemanticSearchDeps({ db,
    embed: async () => ({ ...await embed(), model: "" }) }).search("toc", "q", 1), /model identity/);
});

test("recovery vector slices retain existing identity, verified proof and quote inside embedded substring", async () => {
  const turn = { _id: "bounded-turn", tenantId: "toc", sessionId: "bounded-source", speakerRef: "expert", tStart: 3, tEnd: 9,
    text: "Local source evidence. " + "Distant visa instructions. ".repeat(20) };
  const rows = buildSourceSlices([turn], 32).map(({ text: _text, ...plan }, i) => ({ ...plan,
    _id: `recovery-row-${String(i).padStart(3, "0")}`, tenantId: "toc", sourceRef: turn.sessionId,
    vector: [1, 0], dims: 2, embeddingModel: "fake" }));
  const calls: Call[] = [];
  const db = corpusFixtureDb({ chunks: rows, turns: [turn], sessions: [
    { _id: "bounded-source", tenantId: "toc", sourceId: "bounded-doc", title: "Bounded source", date: "2026-10-14", status: { transcribe: "done", index: "done" } }],
    sources: [{ _id: "bounded-doc", tenantId: "toc", kind: "document" }] } as never, calls);
  const [hit] = await createMongoSemanticSearchDeps({ embed, db: db as never }).search("toc", "Distant visa instructions", 1, "chunks");
  assert.equal(hit!.chunkId, rows[0]!._id);
  assert.deepEqual(hit!.sourceSpans, rows[0]!.sourceSpans);
  assert.equal(hit!.rawTextSha256, rows[0]!.rawTextSha256);
  assert.equal(turn.text.slice(hit!.quote!.charStart, hit!.quote!.charEnd), hit!.quote!.text);
  assert.ok(hit!.sourceSpans!.some(span => span.turnId === hit!.quote!.turnId && span.charStart <= hit!.quote!.charStart && span.charEnd >= hit!.quote!.charEnd));
  for (const call of calls) assert.equal(call.filter.tenantId, "toc");
});
