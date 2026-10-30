/**
 * apps/api/src/search-store.test.ts — asserts what `createMongoSearchDeps` actually sends to and
 * does with Mongo, captured through an injected db handle.
 *
 * History, because it explains the shape: an earlier version captured the filter and then threw
 * most of it away. A checker executed six original mutations against it and FIVE went undetected
 * with 102/102 green —
 *   5A  `scopedCollection` removed from the turns handle  -> EVERY tenant's turns returned
 *   5B  `k` ignored                                        -> contract [I2]'s MAX_K guard inert
 *   5C  every hit given the wrong session
 *   5D  every hit given the wrong turn
 *   5F  session dedup removed                              -> the N+1 [I3] forbids
 * Only 5E (duplicated results) was caught. 5A is a cross-tenant read disclosure of verbatim
 * transcript text, and `packages/db/src/lib/tenantScope.test.ts` calls the tenant boundary "the one
 * invariant in this codebase whose failure is unrecoverable".
 *
 * Two root causes, both fixed here rather than patched around:
 *   1. The old fake had semantics real Mongo does not: `findOne` returned the same session for
 *      every `_id`, and `find` returned the whole corpus regardless of filter — so id-keyed and
 *      tenant-keyed resolution were unfalsifiable by construction. The fake below applies filters.
 *   2. The old assertion narrowed the captured object to `$or` and discarded `tenantId`. The repo
 *      already had the answer — `indexing.test.ts`'s `assertAllCallsConfined` — for the very
 *      function this store copied its injectable shape from. The shape was copied; the tenant
 *      assertion that came with it was not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lexicalSearchTurns, treeIndexRootFilter } from "@lkb/index";
import type { NativeSourceLocator } from "@lkb/core";
import { createMongoSearchDeps, createNativeSearch } from "./search-store.js";
import { createNativeEvidenceResolver, type NativeCurrentUnit } from "./native-evidence/resolver.js";
import { headId } from "./transcript-review/store.js";
import { buildTurnPrefilter } from "./search-prefilter.js";
import { readSearchCandidateTurns } from "./transcript-review/search-reader.js";

import { SESSIONS, CORPUS, capturingDb, matches, type Call } from "./search-cache/search-fixture.testsupport.js";

/** ISS-078. Mirrors `indexing.test.ts`'s `assertAllCallsConfined`: EVERY query must carry the
 * tenantId, not only the ones a given test happened to look at. */
function assertAllCallsConfined(calls: Call[], tenantId: string) {
  assert.ok(calls.length > 0, "expected at least one db call to assert on");
  for (const c of calls) {
    assert.equal(
      c.filter.tenantId, tenantId,
      `${c.coll}.${c.op} issued a query with no tenantId — it can reach another tenant's rows`,
    );
  }
}

function derivedQueries(): string[] {
  const words = [...new Set(CORPUS.filter((t) => t.tenantId === "toc")
    .flatMap((t) => t.text.toLowerCase().split(/\W+/).filter(Boolean)))];
  const pairs = words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);
  return [...words, ...pairs];
}

const OWN = CORPUS.filter((t) => t.tenantId === "toc");

test("EVERY query is tenant-confined — the filter's tenantId, not just its $or (ISS-078)", async () => {
  for (const q of ["2026", "visa", "rates", "counselling"]) {
    const { db, calls } = capturingDb();
    await createMongoSearchDeps({ db }).search("toc", q, 10);
    assertAllCallsConfined(calls, "toc");
  }
});

test("no other tenant's turn or session can ever be returned", async () => {
  const { db } = capturingDb();
  // "2026" matches another tenant's turn t9 too; only tenant-scoping keeps it out.
  const hits = await createMongoSearchDeps({ db }).search("toc", "2026", 10);
  assert.ok(hits.length > 0, "precondition: this query must hit something");
  for (const h of hits) {
    assert.notEqual(h.turnId, "t9", "another tenant's turn leaked into the results");
    assert.equal(h.turn?.tenantId, "toc");
    assert.notEqual(h.session?._id, "s9", "another tenant's session leaked into the results");
  }
});

test("the filter sent to Mongo is a superset of what the scorer can score — over DERIVED queries", async () => {
  const queries = derivedQueries();
  assert.ok(queries.length > 40, `expected a real generated query set, got ${queries.length}`);
  assert.ok(queries.some((q) => /\d/.test(q)), "the corpus must contribute numeric tokens");

  for (const q of queries) {
    const { db, calls } = capturingDb();
    await createMongoSearchDeps({ db }).search("toc", q, 50);
    const scored = lexicalSearchTurns(q, OWN, OWN.length);
    if (scored.length === 0) continue;
    const turnsFind = calls.find((c) => c.coll === "turns" && c.op === "find");
    assert.ok(turnsFind, `"${q}" issued no turns query`);
    for (const hit of scored) {
      const turn = OWN.find((t) => t._id === hit.turnId)!;
      assert.ok(
        matches(turnsFind!.filter, turn as unknown as Record<string, unknown>),
        `"${q}" scores turn ${hit.turnId} at ${hit.score}, but the filter SENT TO MONGO excludes it — silently lost`,
      );
    }
  }
});

test("k is honoured — the store must not return more than asked (ISS-079, contract [I2])", async () => {
  const { db } = capturingDb();
  const all = await createMongoSearchDeps({ db }).search("toc", "2026", 10);
  assert.ok(all.length >= 3, `precondition: "2026" must hit >=3 turns, got ${all.length}`);
  for (const k of [1, 2]) {
    const { db: db2 } = capturingDb();
    const hits = await createMongoSearchDeps({ db: db2 }).search("toc", "2026", k);
    assert.equal(hits.length, k, `k=${k} must cap the result count — ignoring k makes MAX_K inert`);
  }
});

test("each hit carries ITS OWN turn and session, not another hit's (ISS-080)", async () => {
  // "2026" spans s1 and s3, whose titles differ — the old single-session fixture made a broken
  // Map lookup indistinguishable from a correct one.
  const { db } = capturingDb();
  const hits = await createMongoSearchDeps({ db }).search("toc", "2026", 10);
  const bySession = new Set(hits.map((h) => h.sessionId));
  assert.ok(bySession.size >= 2, `precondition: query must span >=2 sessions, got ${bySession.size}`);
  for (const h of hits) {
    assert.equal(h.turn?._id, h.turnId, "hit carries a different turn than the one it scored");
    assert.equal(h.turn?.sessionId, h.sessionId, "hit's turn belongs to a different session");
    assert.equal(h.session?._id, h.sessionId, "hit carries a different session than its own");
    const expected = SESSIONS.find((s) => s._id === h.sessionId)!;
    assert.equal(h.session?.title, expected.title, "hit carries the wrong session's title");
  }
});

test("hit.score matches what the scorer independently computes for that turn (ISS-083)", async () => {
  // A sixth-bypass hunt found this uncaught: `score: 0.5` hardcoded on every hit left 107/107
  // green, because no test read the field. Cross-checks against a SEPARATE lexicalSearchTurns
  // call over the same corpus, so the store cannot pass a value it merely copied from itself.
  for (const q of ["visa", "2026", "counselling"]) {
    const { db } = capturingDb();
    const hits = await createMongoSearchDeps({ db }).search("toc", q, 10);
    const independent = new Map(lexicalSearchTurns(q, OWN, OWN.length).map((h) => [h.turnId, h.score]));
    for (const h of hits) {
      assert.equal(h.score, independent.get(h.turnId), `"${q}" hit ${h.turnId} carries score ${h.score}, scorer independently computed ${independent.get(h.turnId)}`);
    }
  }
});

test("each hit's (turnId, sessionId) pair matches what the scorer actually ranked at that position (ISS-084)", async () => {
  // A sixth-bypass hunt found this uncaught too: rotating turnId/sessionId/turn/session together
  // across hits (each internally self-consistent) left 107/107 green, because prior assertions
  // only checked a hit against ITSELF, never against the scorer's own independent ranking.
  for (const q of ["visa", "2026", "counselling"]) {
    const { db } = capturingDb();
    const hits = await createMongoSearchDeps({ db }).search("toc", q, 10);
    const independent = lexicalSearchTurns(q, OWN, OWN.length);
    const bySessionId = new Map(OWN.map((t) => [t._id, t.sessionId]));
    assert.equal(hits.length, independent.length, `"${q}" returned ${hits.length} hits, scorer independently ranked ${independent.length}`);
    for (let i = 0; i < hits.length; i++) {
      assert.equal(hits[i]!.turnId, independent[i]!.turnId, `"${q}" position ${i}: turnId does not match the scorer's own rank order`);
      assert.equal(hits[i]!.sessionId, bySessionId.get(independent[i]!.turnId), `"${q}" position ${i}: sessionId does not match this turn's real session`);
    }
  }
});

test("candidate turns load once; visibility is batched per distinct session, not per candidate (ISS-080/085, D-206 K1/K2)", async () => {
  const { db, calls } = capturingDb();
  const hits = await createMongoSearchDeps({ db, cacheTtlMs: 0 }).search("toc", "2026", 10);
  const distinct = new Set(hits.map((h) => h.sessionId)).size;
  const turnsFinds = calls.filter((c) => c.coll === "turns" && c.op === "find");
  const turnsFindOnes = calls.filter((c) => c.coll === "turns" && c.op === "findOne").length;
  const lookups = calls.filter((c) => c.coll === "sessions" && c.op === "findOne").length;
  assert.ok(hits.length > distinct, `precondition: need a repeated session (${hits.length} hits over ${distinct})`);
  // One candidate load (the $or prefilter) and ONE batched live-turn proof (_id $in) for the whole slice: never a find per candidate.
  assert.equal(turnsFinds.length, 2, `${turnsFinds.length} turns.find calls`);
  assert.equal(turnsFinds.filter((c) => "$or" in c.filter).length, 1, "the candidate prefilter runs exactly once per request");
  assert.equal(turnsFinds.filter((c) => c.filter._id !== undefined).length, 1, "live-turn proof is a single batched $in read");
  assert.equal(turnsFindOnes, 0, "no per-candidate turns.findOne (the former N+1)");
  assert.equal(lookups, 2 * distinct, "one source context per DISTINCT session plus one final safe label per distinct session");
});

test("K2: visibility is judged on the best-ranked slice only, not on every candidate", async () => {
  // 120 matching turns in s1 (all visible) -> asking for k=3 must not prove all 120.
  const many = Array.from({ length: 120 }, (_, i) => ({ _id: `m${i}`, tenantId: "toc", sessionId: "s1", speakerRef: "spk:0", tStart: i, tEnd: i + 1,
    text: `scholarship ${"filler ".repeat(i % 5)}deadline ${i}` }));
  const { db, calls } = capturingDb({ turns: many });
  const hits = await createMongoSearchDeps({ db, cacheTtlMs: 0 }).search("toc", "scholarship deadline", 3);
  assert.equal(hits.length, 3);
  const proof = calls.find((c) => c.coll === "turns" && c.op === "find" && c.filter._id !== undefined)!;
  const asked = ((proof.filter._id as { $in: string[] }).$in).length;
  assert.ok(asked <= 24, `visibility proof covered ${asked} of 120 candidates; expected only the first slice`);
});

test("K2: hits removed by visibility are refilled from the next slice (bounded by the ranking, not by a cap)", async () => {
  // s1 holds the 60 best-scoring turns and is WITHDRAWN; s2 holds weaker ones. k=3 must still return 3 hits from s2.
  const top = Array.from({ length: 60 }, (_, i) => ({ _id: `a${i}`, tenantId: "toc", sessionId: "s1", speakerRef: "spk:0", tStart: i, tEnd: i + 1, text: "scholarship deadline" }));
  const low = Array.from({ length: 5 }, (_, i) => ({ _id: `b${i}`, tenantId: "toc", sessionId: "s2", speakerRef: "spk:0", tStart: i, tEnd: i + 1, text: `scholarship only ${i}` }));
  const sources = SESSIONS.map((session) => ({ _id: session.sourceId, tenantId: session.tenantId, kind: "recording", path: `x/${session._id}`,
    ...(session._id === "s1" ? { consent: { given: false, recordedBy: "owner" } } : {}) }));
  const { db } = capturingDb({ turns: [...top, ...low], sources });
  const hits = await createMongoSearchDeps({ db, cacheTtlMs: 0 }).search("toc", "scholarship deadline", 3);
  assert.deepEqual(hits.map((h) => h.turnId), ["b0", "b1", "b2"]);
  assert.ok(hits.every((h) => h.sessionId === "s2"), "no row of the withdrawn session may surface, however well it ranks");
});

test("K2 equivalence: score-first returns exactly what filter-first returned, over random corpora with random exclusions", async () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const words = ["visa", "loan", "uk", "canada", "ielts", "fees", "toronto", "cost", "living", "deadline", "intake", "masters"];
  const { createKnowledgeVisibility: makeVisibility } = await import("./visibility/knowledge.js");
  for (let round = 0; round < 25; round++) {
    const turns = Array.from({ length: 90 }, (_, i) => ({ _id: `r${i}`, tenantId: "toc", sessionId: `s${1 + (i % 3)}`, speakerRef: "spk:0", tStart: i, tEnd: i + 1,
      text: Array.from({ length: 2 + Math.floor(rand() * 5) }, () => words[Math.floor(rand() * words.length)]).join(" ") }));
    const withdrawn = new Set(["s1", "s2", "s3"].filter(() => rand() < 0.4));
    const sources = SESSIONS.map((session) => ({ _id: session.sourceId, tenantId: session.tenantId, kind: "recording", path: `x/${session._id}`,
      ...(withdrawn.has(session._id) ? { consent: { given: false, recordedBy: "owner" } } : {}) }));
    const { db } = capturingDb({ turns, sources });
    const query = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => words[Math.floor(rand() * words.length)]).join(" ");
    const k = 1 + Math.floor(rand() * 12);
    // Reference = the pre-D-206 algorithm: filter EVERY candidate, then score.
    const prefilter = buildTurnPrefilter(query)!;
    const candidates = await readSearchCandidateTurns(db, "toc", prefilter);
    const visible = await makeVisibility(db).filterTurns("toc", candidates);
    const expected = lexicalSearchTurns(query, visible.map((t) => ({ _id: t._id, sessionId: t.sessionId, text: t.text })), k);
    const actual = await createMongoSearchDeps({ db, cacheTtlMs: 0 }).search("toc", query, k);
    assert.deepEqual(actual.map((h) => [h.turnId, h.sessionId, h.score]), expected.map((h) => [h.turnId, h.sessionId, h.score]),
      `round ${round} q=${JSON.stringify(query)} k=${k} withdrawn=${[...withdrawn]}`);
  }
});

test("a query with no usable tokens issues no database query at all", async () => {
  const { db, calls } = capturingDb();
  const hits = await createMongoSearchDeps({ db }).search("toc", "!!! ???", 10);
  assert.deepEqual(hits, []);
  assert.equal(calls.length, 0, "an unmatchable query must not scan the collection");
});

test("results still resolve through the injected handle end to end", async () => {
  const { db } = capturingDb();
  const hits = await createMongoSearchDeps({ db }).search("toc", "visa", 10);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.turnId, "t1");
  assert.equal(hits[0]?.turn?.text, CORPUS[0]!.text);
  assert.equal(hits[0]?.session?.title, "New Zealand Visas");
});

test("production search retrieves corrected-only text and uses corrected scoring without changing originals", async () => {
  const { db, data, calls } = capturingDb({ heads: [{ _id: headId("toc", "s1"), tenantId: "toc", sessionId: "s1", revision: "r1",
    overlay: [{ turnId: "t3", text: "Scotland guidance verified from the recording.", speakerRef: "person:expert" }] }] });
  const original = structuredClone(data.turns);
  const hits = await createMongoSearchDeps({ db }).search("toc", "scotland", 5);
  assert.equal(hits.length, 1); assert.equal(hits[0]!.turnId, "t3");
  assert.equal(hits[0]!.turn!.text, "Scotland guidance verified from the recording.");
  assert.equal(hits[0]!.turn!.speakerRef, "person:expert"); assert.equal(hits[0]!.session!.title, "New Zealand Visas");
  assert.deepEqual(data.turns, original); assertAllCallsConfined(calls, "toc");
});

test("source privacy filters before k-limited scoring; unapproved WhatsApp source cannot displace eligible guidance", async () => {
  const sources = SESSIONS.map((session) => ({ _id: session.sourceId, tenantId: session.tenantId,
    kind: session._id === "s1" ? "whatsapp-batch" : "recording", path: `offline-fixture/${session._id}` }));
  const { db, calls } = capturingDb({ sources });
  const hits = await createMongoSearchDeps({ db }).search("toc", "2026", 1);
  assert.equal(hits.length, 1); assert.equal(hits[0]!.turnId, "t4"); assert.equal(hits[0]!.session!.title, "AI in Counselling");
  assert.ok(!JSON.stringify(hits).includes("New Zealand")); assertAllCallsConfined(calls, "toc");
});

test("unknown source provenance fails closed instead of returning tenant-matching text", async () => {
  const { db } = capturingDb({ sources: [] });
  assert.deepEqual(await createMongoSearchDeps({ db }).search("toc", "2026", 10), []);
});

const nativeHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function nativeSearchFixture() {
  const text = "सही आवेदन visa guidance", revisionHash = nativeHash("canonical document bytes");
  const locator: NativeSourceLocator = { kind: "document-page", sourceId: "logical-source", documentId: "immutable-doc",
    documentSourceId: "immutable-source", headRevision: 1, revisionHash, pageNumber: 2,
    passage: { start: 0, end: text.length, sha256: nativeHash(text) } };
  let current: NativeCurrentUnit | null = { kind: "document-page", tenantId: "toc", sourceId: "logical-source", documentId: "immutable-doc",
    documentSourceId: "immutable-source", headRevision: 1, revisionHash, currentRevisionHash: revisionHash,
    pageNumber: 2, eligible: true, text, title: "Authoritative document title" };
  let authorityCalls = 0;
  const resolver = createNativeEvidenceResolver({ async loadCurrent() { authorityCalls++; return current; } });
  const tree: Record<string, unknown> = { _id: "root", ...treeIndexRootFilter("toc"), title: "Root", summary: "",
    children: [{ node_id: "actual-published-node", level: "native-passage", title: "UNTRUSTED label", summary: "invented search text",
      evidence: { sourceLocator: locator }, children: [] }] };
  const fx = capturingDb({ tree });
  return { ...fx, locator, tree, resolver, callsCount: () => authorityCalls, current: () => current,
    set: (row: NativeCurrentUnit | null) => { current = row; },
    search: createMongoSearchDeps({ db: fx.db, nativeEvidence: resolver }).searchNative! };
}

test("native search reads actual tenant tree references and scores current Unicode quote only", async () => {
  const f = nativeSearchFixture();
  const result = await f.search("toc", "आवेदन visa", 10);
  assert.deepEqual(result, { hits: [{ nativeSourceLocator: f.locator, score: 1, title: "Authoritative document title" }], truncated: false });
  assert.deepEqual(Object.keys(result.hits[0]!).sort(), ["nativeSourceLocator", "score", "title"]);
  assert.equal(f.calls[0]?.coll, "tree_index"); assertAllCallsConfined(f.calls, "toc");
  assert.deepEqual((await f.search("toc", "invented", 10)).hits, [], "routing/index summary must not count as evidence");
  assert.equal(f.callsCount(), 3, "one candidate resolve plus one selected release read, then irrelevant candidate resolve");
});

test("native search current head/revoke/delete/foreign changes invalidate an unchanged tree reference", async () => {
  const f = nativeSearchFixture(), original = f.current()!;
  for (const patch of [{ currentRevisionHash: nativeHash("new head") }, { headRevision: 2 }, { tenantId: "foreign" },
    { eligible: false }, { text: "replaced body" }]) {
    f.set({ ...original, ...patch } as NativeCurrentUnit);
    assert.deepEqual((await f.search("toc", "visa", 10)).hits, []);
  }
  f.set(null); assert.deepEqual((await f.search("toc", "visa", 10)).hits, []);
  assert.equal(f.callsCount(), 6, "every local lifecycle refusal must reach current source authority");
  assert.deepEqual((await f.search("other", "visa", 10)).hits, []);
});

test("native search refuses malformed/duplicate/deep/oversized inventories before source disclosure", async () => {
  for (const mode of ["duplicate", "duplicate-locator", "cycle", "deep", "bytes", "nodes"] as const) {
    const f = nativeSearchFixture(), children = f.tree.children as Record<string, unknown>[];
    if (mode === "duplicate") children.push({ ...children[0]! });
    if (mode === "duplicate-locator") children.push({ ...children[0]!, node_id: "different-node-same-exact-locator" });
    if (mode === "cycle") children.push(f.tree);
    if (mode === "deep") {
      let node = children[0]!;
      for (let i = 0; i < 33; i++) { const next = { node_id: `deep-${i}`, level: "branch", children: [] }; node.children = [next]; node = next; }
    }
    if (mode === "bytes") f.tree.summary = "x".repeat(8 * 1024 * 1024);
    if (mode === "nodes") f.tree.children = Array.from({ length: 10_000 }, (_, i) => ({ node_id: `node-${i}`, children: [] }));
    await assert.rejects(f.search("toc", "visa", 10), /invalid_native_inventory/);
    assert.equal(f.callsCount(), 0);
  }
});

test("native inventory cap includes release checks and honestly marks partial results", async () => {
  const f = nativeSearchFixture(), original = f.current()!;
  const locators = Array.from({ length: 200 }, (_, i) => ({ ...f.locator, sourceId: `source-${i}` }));
  let reads = 0;
  const resolver = createNativeEvidenceResolver({ async loadCurrent(tenantId, locator) {
    reads++; return { ...original, tenantId, sourceId: locator.sourceId };
  } });
  const search = createNativeSearch({ nativeEvidence: resolver, listNativeLocators: async () => ({ locators, truncated: false }) });
  const result = await search("toc", "visa", 50);
  assert.equal(result.hits.length, 50); assert.equal(result.truncated, true); assert.equal(reads, 128);
  assert.deepEqual(await search("toc", "!!!", 10), { hits: [], truncated: false }); assert.equal(reads, 128);
  await assert.rejects(search("toc", "v".repeat(513), 10), /invalid_native_search_query/);
});

test("native search rechecks selected evidence immediately before release", async () => {
  const f = nativeSearchFixture(); let reads = 0;
  const resolver = createNativeEvidenceResolver({ async loadCurrent() { return ++reads === 1 ? f.current() : null; } });
  const search = createNativeSearch({ nativeEvidence: resolver, listNativeLocators: async () => ({ locators: [f.locator], truncated: false }) });
  assert.deepEqual(await search("toc", "visa", 10), { hits: [], truncated: false }); assert.equal(reads, 2);
});
