/**
 * apps/api/src/ask-arms.test.ts — U1.5 part 2, hybrid-retrieval C5/C6.
 *
 * C6 is the reason this module is a FACTORY rather than a bound function, so the tests are about
 * the SHAPE as much as the behaviour: it must be impossible to serve one tenant's vectors to
 * another tenant's question, and impossible to bind the arms before a tenant is known.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createAskArmsFor } from "./ask-arms.js";
import type { TreeIndexNode } from "@lkb/core";
import { startTestServer } from "./testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeTreeStore, fakeAskDeps } from "./fixtures.js";

const TREE: TreeIndexNode = {
  node_id: "tenant:t1", title: "t1", level: "tenant", summary: "", children: [
    { node_id: "tenant:t1/year:2026", title: "2026", level: "year", summary: "", children: [
      { node_id: "tenant:t1/year:2026/month:06/session:s1", title: "S1", level: "session", summary: "Visas.", children: [] },
      { node_id: "tenant:t1/year:2026/month:06/session:s2", title: "S2", level: "session", summary: "Funding.", children: [] },
    ] },
  ],
};

/** Records every tenantId the arms actually queried with. */
function fakeDb(rows: { chunks?: unknown[]; turns?: unknown[] } = {}) {
  const queriedTenants: string[] = [];
  const db = {
    collection(name: string) {
      return {
        find: (filter?: Record<string, unknown>) => ({
          toArray: async () => {
            if (filter && typeof filter.tenantId === "string") queriedTenants.push(`${name}:${filter.tenantId}`);
            return (name === "chunks" ? rows.chunks : rows.turns) ?? [];
          },
        }),
      };
    },
  } as unknown as Pick<Db, "collection">;
  return { db, queriedTenants };
}

const embedOk = async () => ({ vectors: [[1, 0, 0]], dims: 3, provider: "fake", model: "fake" });

test("C6: the arms are a FACTORY — they cannot be bound before a tenant is known", () => {
  const factory = createAskArmsFor({});
  assert.equal(typeof factory, "function", "createAskArmsFor returns a factory, not the arms");
  assert.equal(typeof factory("t1"), "function", "and the factory must be given a tenant to yield arms");
});

test("C6: every collection read carries the tenant the factory was called with", async () => {
  const { db, queriedTenants } = fakeDb();
  await createAskArmsFor({ embed: embedOk as never, db })("tenant-a")("visas?", TREE);
  assert.ok(queriedTenants.length > 0, "the arms must actually query");
  for (const q of queriedTenants) {
    assert.match(q, /:tenant-a$/, `a read escaped its tenant: ${q}`);
  }
});

// ISS-179. The version of this test that shipped in cycle 2 was VACUOUS, and the way it was vacuous
// is the failure mode this repo keeps finding: it asserted
//   a.queriedTenants.every((q) => q.endsWith(":tenant-a"))
// and `[].every()` is `true`. A module-level cache of `turns`/`chunks` not keyed by tenant — one
// `??=`, the most ordinary perf change anyone would make to this file — suppresses the second
// tenant's read entirely and PASSES, because there is nothing left to iterate. It also used two
// SEPARATE db fakes and asserted on the query FILTER STRING, never on what came back, so it could
// not see a cross-tenant candidate even in principle.
//
// C6's Verified-by asks for the data boundary: "tenant B's question never returns a candidate
// resolving to tenant A's session". So: ONE db holding BOTH tenants' rows, and assertions on the
// RETURNED NODES, plus an explicit non-vacuity check so this can never pass by querying nothing.
test("C6: tenant B's arms return only tenant B's session — ONE corpus, both tenants in it", async () => {
  const rows = {
    chunks: [
      { _id: "a:c1", tenantId: "tenant-a", sourceRef: "s1", vector: [1, 0, 0] },
      { _id: "b:c1", tenantId: "tenant-b", sourceRef: "s2", vector: [1, 0, 0] },
    ],
    turns: [
      { _id: "a:t1", tenantId: "tenant-a", sessionId: "s1", text: "visas" },
      { _id: "b:t1", tenantId: "tenant-b", sessionId: "s2", text: "visas" },
    ],
  };
  // A single db whose find() HONOURS the tenantId filter, so a leak is expressible: if the arms
  // ever query without a tenant (or with the wrong one), the other tenant's rows really do come
  // back and land in the returned nodes.
  const seen: string[] = [];
  const db = {
    collection(name: string) {
      return {
        find: (filter?: Record<string, unknown>) => ({
          toArray: async () => {
            const t = filter && typeof filter.tenantId === "string" ? filter.tenantId : undefined;
            seen.push(`${name}:${t ?? "UNSCOPED"}`);
            const all = (name === "chunks" ? rows.chunks : rows.turns) as { tenantId: string }[];
            return t === undefined ? all : all.filter((r) => r.tenantId === t);
          },
        }),
      };
    },
  } as unknown as Pick<Db, "collection">;

  const factory = createAskArmsFor({ embed: embedOk as never, db });
  const aRes = await factory("tenant-a")("visas?", TREE);
  const bRes = await factory("tenant-b")("visas?", TREE);

  const aIds = aRes.arms.flat().map((n) => n.node_id);
  const bIds = bRes.arms.flat().map((n) => n.node_id);

  // NON-VACUITY FIRST (ISS-179): every assertion below is meaningless if nothing was queried or
  // nothing came back. A cache that serves tenant B from tenant A's rows must not be able to
  // satisfy this test by returning an empty set.
  assert.ok(seen.length >= 4, `both tenants must actually read both collections: ${JSON.stringify(seen)}`);
  assert.ok(aIds.length > 0, "tenant A must retrieve something, or the isolation claim is empty");
  assert.ok(bIds.length > 0, "tenant B must retrieve something, or the isolation claim is empty");
  assert.equal(seen.filter((s) => s.endsWith(":UNSCOPED")).length, 0, `an unscoped read: ${seen}`);

  // THE DATA BOUNDARY, asserted on what came back — not on the filter that was sent.
  const A_NODE = "tenant:t1/year:2026/month:06/session:s1";
  const B_NODE = "tenant:t1/year:2026/month:06/session:s2";
  assert.deepEqual([...new Set(aIds)], [A_NODE], "tenant A saw a session that is not its own");
  assert.deepEqual([...new Set(bIds)], [B_NODE], "tenant B saw a session that is not its own");
});

test("C5: a FAILING vector arm still yields the lexical arm, and says why", async () => {
  const { db } = fakeDb({ turns: [{ _id: "t1", sessionId: "s1", text: "visas and permits" }] });
  const res = await createAskArmsFor({
    embed: async () => { throw new Error("all providers failed"); },
    db,
  })("t1")("visas?", TREE);
  assert.match(res.degraded ?? "", /vector: all providers failed/, "the failure must name the arm and reason");
  assert.equal(res.arms.length, 1, "the lexical arm must still be produced");
});

test("C5: a healthy run reports NO degradation — the field must mean something", async () => {
  const { db } = fakeDb({
    chunks: [{ _id: "c1", sourceRef: "s1", vector: [1, 0, 0] }],
    turns: [{ _id: "t1", sessionId: "s1", text: "visas" }],
  });
  const res = await createAskArmsFor({ embed: embedOk as never, db })("t1")("visas?", TREE);
  assert.equal(res.degraded, null);
  assert.equal(res.arms.length, 2, "both arms present");
});

test("arms return real TREE NODES, mapped from their own id vocabulary without re-deriving the path", async () => {
  const { db } = fakeDb({
    chunks: [{ _id: "c1", sourceRef: "s2", vector: [1, 0, 0] }],
    turns: [{ _id: "t1", sessionId: "s2", text: "funding" }],
  });
  const res = await createAskArmsFor({ embed: embedOk as never, db })("t1")("funding?", TREE);
  const ids = res.arms.flat().map((n) => n.node_id);
  assert.ok(ids.includes("tenant:t1/year:2026/month:06/session:s2"),
    `a vector/lexical hit must resolve to the real tree node: ${JSON.stringify(ids)}`);
});

test("a hit for a session NOT in this tree is dropped rather than invented", async () => {
  const { db } = fakeDb({
    chunks: [{ _id: "c1", sourceRef: "ghost-session", vector: [1, 0, 0] }],
    turns: [{ _id: "t1", sessionId: "ghost-session", text: "visas" }],
  });
  const res = await createAskArmsFor({ embed: embedOk as never, db })("t1")("visas?", TREE);
  assert.deepEqual(res.arms.flat(), [], "an unmapped session must not become a fabricated node");
});

// ISS-171. The lexical arm's `seen` set is what keeps one session from casting several lexical votes
// into rrfMerge (which counts per occurrence, no within-arm dedupe). Every earlier fixture gave a
// session exactly one turn, so deleting the two `seen` lines left the suite green (CHECKER MUTATION M).
// Replays the row's own case: 3 matching turns from the SAME session -> that node exactly once.
test("ISS-171: the lexical arm yields a session ONCE even when 3 of its turns match", async () => {
  const { db } = fakeDb({
    turns: [
      { _id: "t1", sessionId: "s1", text: "visas for students" },
      { _id: "t2", sessionId: "s1", text: "more about visas" },
      { _id: "t3", sessionId: "s1", text: "visas again" },
      { _id: "t4", sessionId: "s2", text: "funding" },
    ],
  });
  const res = await createAskArmsFor({ db })("t1")("visas?", TREE);
  assert.equal(res.arms.length, 1, "lexical arm only (no embedder)");
  const ids = res.arms[0]!.map((n) => n.node_id);
  assert.deepEqual(ids, ["tenant:t1/year:2026/month:06/session:s1"],
    `s1 must appear exactly once in the arm, got ${JSON.stringify(ids)}`);
});

test("no embedder configured = no vector arm, and that is NOT a degradation", async () => {
  const { db } = fakeDb({ turns: [{ _id: "t1", sessionId: "s1", text: "visas" }] });
  const res = await createAskArmsFor({ db })("t1")("visas?", TREE);
  assert.equal(res.degraded, null, "an install without embeddings is not broken");
  assert.equal(res.arms.length, 1);
});

// ---------------------------------------------------------------------------------------------
// ISS-169 — THE BINDING SITE, not the factory's internals.
//
// The tests above pin what `createAskArmsFor(deps)(tenantId)` does once a tenant is known. None of
// them pin WHERE that call happens, and that is the whole of C6: a checker hoisted
// `deps.extraCandidateArmsFor("system")` out of the request handler in `routes/ask.ts` — so every
// tenant's question would query the boot tenant's corpus — and 170/170 tests stayed GREEN. The
// shipped code was correct; the proof was missing, on the one criterion this contract marks
// security-class. `extraCandidateArmsFor` was referenced by zero tests in the repo.
//
// So these drive the real router over real HTTP with a RECORDING factory and assert the binding
// itself: once per request, with the VERIFIED KEY's tenant, and re-bound between requests.
// ---------------------------------------------------------------------------------------------

/** Records each `extraCandidateArmsFor(tenantId)` binding and each arms invocation. */
function recordingArms() {
  const boundWith: string[] = [];
  const calledWith: string[] = [];
  const extraCandidateArmsFor = (tenantId: string) => {
    boundWith.push(tenantId);
    return async (_query: string, _tree: TreeIndexNode) => {
      calledWith.push(tenantId);
      return { arms: [] as TreeIndexNode[][], degraded: null };
    };
  };
  return { boundWith, calledWith, extraCandidateArmsFor };
}

const TWO_TENANT_KEYS = fakeKeyStore({
  "key-a": { tenantId: "tenant-a", scopes: ["ask"] },
  "key-b": { tenantId: "tenant-b", scopes: ["ask"] },
});

async function askAs(baseUrl: string, key: string, body: Record<string, unknown> = { query: "topic one" }) {
  return fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
}

test("C6/ISS-169 — the arms are bound PER REQUEST from the verified key's tenant, never at boot", async () => {
  const rec = recordingArms();
  const server = await startTestServer(
    buildTestDeps({
      keyStore: TWO_TENANT_KEYS,
      ask: {
        tree: fakeTreeStore(),
        askDeps: fakeAskDeps(),
        extraCandidateArmsFor: rec.extraCandidateArmsFor,
      },
    }),
  );
  try {
    // Nothing may be bound before a request arrives: `buildProductionDeps()` has no tenant, and its
    // router-level id is the literal string "system".
    assert.deepEqual(rec.boundWith, [], "binding before any request is the boot-capture bug itself");

    assert.equal((await askAs(server.baseUrl, "key-a", { query: "topic one", tenantId: "tenant-b" })).status, 200);
    assert.equal((await askAs(server.baseUrl, "key-b")).status, 200);

    // The ORDERED list is the assertion, not a membership check: a hoisted binding produces
    // ["system"] and a bind-once-then-reuse produces ["tenant-a"] — both fail here, differently.
    assert.deepEqual(rec.boundWith, ["tenant-a", "tenant-b"], "one binding per request, in order");
    assert.deepEqual(rec.calledWith, ["tenant-a", "tenant-b"], "and each request used ITS OWN binding");
  } finally {
    await server.close();
  }
});

test("C6/ISS-169 — two requests from the SAME key still re-bind, so no binding outlives its request", async () => {
  // Caching one tenant's binding is safe today and is exactly what silently becomes unsafe the
  // moment the cache key is dropped or the process is reused. The invariant is structural.
  const rec = recordingArms();
  const server = await startTestServer(
    buildTestDeps({
      keyStore: TWO_TENANT_KEYS,
      ask: { tree: fakeTreeStore(), askDeps: fakeAskDeps(), extraCandidateArmsFor: rec.extraCandidateArmsFor },
    }),
  );
  try {
    await askAs(server.baseUrl, "key-a");
    await askAs(server.baseUrl, "key-a");
    assert.deepEqual(rec.boundWith, ["tenant-a", "tenant-a"], "two requests, two bindings");
  } finally {
    await server.close();
  }
});

test("C6/ISS-169 — an UNAUTHORIZED request binds nothing at all", async () => {
  // The bind must sit behind `requireScope("ask")`, not in front of it: a factory that runs before
  // auth would touch a tenant's corpus for a caller who was about to be refused.
  const rec = recordingArms();
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "no-scope": { tenantId: "tenant-a", scopes: ["sources"] } }),
      ask: { tree: fakeTreeStore(), askDeps: fakeAskDeps(), extraCandidateArmsFor: rec.extraCandidateArmsFor },
    }),
  );
  try {
    assert.equal((await askAs(server.baseUrl, "no-scope")).status, 403);
    assert.equal((await askAs(server.baseUrl, "not-a-key")).status, 401);
    assert.deepEqual(rec.boundWith, [], "a refused caller must never reach the corpus");
  } finally {
    await server.close();
  }
});
