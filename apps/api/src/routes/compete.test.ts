/**
 * apps/api/src/routes/compete.test.ts — T-012 C5. In-process HTTP requests (matching
 * server.test.ts's `startTestServer` pattern) against the compete routes with fakes for every
 * injected dependency. Covers: `/compete/start` with a fake `askV2`/store produces an eval_runs
 * row with `credibility: 'internal'`; `/compete/:id/score` updates the existing row (not a new
 * one); missing `compete` scope -> 403 (T-009's auth middleware, no second auth system);
 * a nonexistent `:id` on `/score` -> 404; `GET /compete` serves the plain HTML form.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexNode } from "@lkb/core";
import { BoundedAskError } from "@lkb/ask";
import { createServer, type ServerDeps } from "../server.js";
import { requireAuth } from "../auth.js";
import { createSourceRequestDepsFor } from "../ask/source-context.js";
import { unpackContext } from "../../../../packages/ask/src/bounded-refine.js";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeAskDeps, fakeKeyStore, fakeEvalRunStore } from "../fixtures.js";

const COMPETE_KEY = { "compete-key": { tenantId: "tenant-1", scopes: ["ask", "compete"] } };

test("POST /compete/start produces an eval_runs row with credibility 'internal'", async () => {
  const evalRuns = fakeEvalRunStore();
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(COMPETE_KEY), evalRuns }));
  try {
    const res = await fetch(`${server.baseUrl}/compete/start`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer compete-key" },
      body: JSON.stringify({ question: "topic one", counsellor: { name: "Asha", org: "Acme" } }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { evalRunId: string; aiAnswer: { text: string } };
    assert.ok(body.evalRunId);
    assert.equal(body.aiAnswer.text, "This is the fake answer.");

    const row = evalRuns._rows.get(body.evalRunId);
    assert.ok(row, "eval_runs row must exist");
    assert.equal(row!.credibility, "internal");
    assert.equal(row!.tenantId, "tenant-1");
    assert.equal(row!.counsellor.name, "Asha");
    assert.equal(row!.counsellor.org, "Acme");
    assert.equal(row!.question, "topic one");
  } finally {
    await server.close();
  }
});

test("POST /compete/start with a missing question returns 400", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(COMPETE_KEY) }));
  try {
    const res = await fetch(`${server.baseUrl}/compete/start`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer compete-key" },
      body: JSON.stringify({ counsellor: { name: "Asha" } }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /compete/:id/score updates the existing row, not a new one", async () => {
  const evalRuns = fakeEvalRunStore();
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(COMPETE_KEY), evalRuns }));
  try {
    const startRes = await fetch(`${server.baseUrl}/compete/start`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer compete-key" },
      body: JSON.stringify({ question: "topic one", counsellor: { name: "Asha" } }),
    });
    const { evalRunId } = (await startRes.json()) as { evalRunId: string };

    const sizeBefore = evalRuns._rows.size;
    const scoreRes = await fetch(`${server.baseUrl}/compete/${evalRunId}/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer compete-key" },
      body: JSON.stringify({
        counsellorAnswer: { text: "counsellor's own answer" },
        score: { ai: 4, counsellor: 3 },
        notes: "AI cited a source",
      }),
    });
    assert.equal(scoreRes.status, 200);
    assert.equal(evalRuns._rows.size, sizeBefore, "score must update the existing row, not insert a new one");

    const row = evalRuns._rows.get(evalRunId)!;
    assert.equal(row.counsellorAnswer!.text, "counsellor's own answer");
    assert.equal(row.score!.ai, 4);
    assert.equal(row.score!.counsellor, 3);
    assert.equal(row.score!.notes, "AI cited a source");
  } finally {
    await server.close();
  }
});

test("POST /compete/start without the compete scope returns 403", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/compete/start`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer ask-only-key" },
      body: JSON.stringify({ question: "topic one", counsellor: { name: "Asha" } }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "forbidden");
  } finally {
    await server.close();
  }
});

test("POST /compete/:id/score with a nonexistent id returns 404", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(COMPETE_KEY) }));
  try {
    const res = await fetch(`${server.baseUrl}/compete/does-not-exist/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer compete-key" },
      body: JSON.stringify({ counsellorAnswer: { text: "x" }, score: { ai: 1, counsellor: 1 } }),
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "not_found");
  } finally {
    await server.close();
  }
});

test("GET /compete serves the plain HTML form", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(COMPETE_KEY) }));
  try {
    const res = await fetch(`${server.baseUrl}/compete`, { headers: { authorization: "Bearer compete-key" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /html/);
    const text = await res.text();
    assert.match(text, /\/compete\/start/);
  } finally {
    await server.close();
  }
});

/** Real server-mounted handlers with offline req/res; no sockets or external dependencies. */
async function mountedStart(deps: ServerDeps, key = "synthetic-key", question = "Is the grant guaranteed?") {
  const app = createServer(deps);
  type Layer = {handle: any; route?: {path: string; stack: Layer[]}};
  const mount = (app as any).router.stack.find((layer: Layer) => layer.handle?.stack?.some((item: Layer) => item.route?.path === "/compete/start"));
  assert.ok(mount, "actual createServer mounts compete");
  const route = mount.handle.stack.find((layer: Layer) => layer.route?.path === "/compete/start").route;
  const req: any = {body: {question, counsellor: {name: "Fixture"}, tenantId: "foreign"}, query: {tenantId: "foreign"},
    header: (name: string) => name === "authorization" ? key ? `Bearer ${key}` : undefined : "foreign"};
  let status = 200, body: any;
  const res: any = {status(code: number) {status = code; return this;}, json(value: unknown) {body = value; return this;}};
  await requireAuth(deps.keyStore)(req, res, () => {});
  if (body === undefined) for (const layer of route.stack) {await layer.handle(req, res, () => {}); if (body !== undefined) break;}
  return {status, body};
}

test("compete replays recorded five-case context-bypass floor and factory failures without eval writes", {timeout: 10_000}, async () => {
  for (const mode of ["sync-refusing", "async-refusing", "legacy", "direct-refusing", "missing-scope", "throw", "reject", "unusable"]) {
    let factoryCalls = 0, hydrationCalls = 0, legacyArms = 0;
    const treeTenants: string[] = [], jobs: any[] = [], evalWrites: any[] = [], completionKinds: string[] = [];
    const deps = buildTestDeps({keyStore: fakeKeyStore({"synthetic-key": {tenantId: "tenant-a", scopes: mode === "missing-scope" ? ["ask"] : ["compete"]}})});
    const n: TreeIndexNode = {node_id: "s1", title: "Session", level: "session", summary: "UNREVIEWED CLAIM: grant is guaranteed.", evidence: {sessionRef: "s1", turn_id: "absent-turn"}, children: []};
    deps.ask.tree = {load: async tenant => {treeTenants.push(tenant); return {node_id: "tenant-a", title: "Tenant", level: "tenant", summary: "", children: [n]};}};
    deps.ask.askDeps = {...fakeAskDeps(), treeSearchFn: () => [n], write: async job => {jobs.push(job);}, complete: async job => {
      completionKinds.push(job.kind); const json = job.kind === "ask.select_nodes" ? {node_ids: ["s1"]} : undefined;
      return {text: json ? JSON.stringify(json) : "The grant is guaranteed.", json, provider: "offline-fixture", model: "fixture", costUsd: 0, usage: {inputTokens: 0, outputTokens: 0}};
    }};
    const refusing = () => ({...deps.ask.askDeps, sourceContext: {hydrate: async () => {hydrationCalls++; throw new BoundedAskError("literal cited turn absent SECRET /private");}}});
    if (mode === "sync-refusing" || mode === "missing-scope") deps.ask.requestDepsFor = tenant => {factoryCalls++; assert.equal(tenant, "tenant-a"); return refusing();};
    if (mode === "async-refusing") deps.ask.requestDepsFor = (async (tenant: string) => {factoryCalls++; assert.equal(tenant, "tenant-a"); await Promise.resolve(); return refusing();}) as unknown as NonNullable<typeof deps.ask.requestDepsFor>;
    if (mode === "direct-refusing") deps.ask.askDeps = refusing();
    if (mode === "throw") deps.ask.requestDepsFor = () => {factoryCalls++; throw new Error("SECRET factory /private");};
    if (mode === "reject") deps.ask.requestDepsFor = (() => {factoryCalls++; return Promise.reject(new Error("SECRET async /private"));}) as unknown as NonNullable<typeof deps.ask.requestDepsFor>;
    if (mode === "unusable") deps.ask.requestDepsFor = () => {factoryCalls++; return {} as never;};
    deps.ask.extraCandidateArmsFor = () => {legacyArms++; return async () => ({arms: [], degraded: null});};
    deps.evalRuns = {create: async (tenant, doc) => {evalWrites.push({tenantId: tenant, ...doc});}, recordScore: async () => false};
    const actual = await mountedStart(deps);
    if (mode === "legacy") {
      assert.equal(actual.status, 200); assert.equal(actual.body.aiAnswer.text, "The grant is guaranteed.");
      assert.equal(evalWrites.length, 1); assert.equal(evalWrites[0].tenantId, "tenant-a"); assert.equal(evalWrites[0].credibility, "internal");
    } else {
      assert.equal(actual.status, mode === "missing-scope" ? 403 : 503, mode); assert.equal(evalWrites.length, 0, mode);
      assert.equal(actual.body.aiAnswer, undefined); assert.equal(actual.body.evalRunId, undefined); assert.ok(!JSON.stringify(actual.body).includes("SECRET"));
      if (mode !== "missing-scope") assert.deepEqual(actual.body, {error: "source_context_unavailable", message: "Compete could not validate source evidence"});
    }
    assert.equal(factoryCalls, ["legacy", "direct-refusing", "missing-scope"].includes(mode) ? 0 : 1, mode);
    assert.equal(hydrationCalls, ["sync-refusing", "async-refusing", "direct-refusing"].includes(mode) ? 1 : 0, mode);
    assert.equal(legacyArms, 0); assert.ok(jobs.every(job => job.tenantId === "tenant-a"));
    if (["sync-refusing", "async-refusing", "direct-refusing"].includes(mode)) assert.ok(jobs.some(job => job.kind === "ask.source_context_refused"));
    if (mode === "missing-scope") {assert.deepEqual(treeTenants, []); assert.deepEqual(completionKinds, []);}
  }
});

test("compete denied missing/invalid/revoked keys do no tree/factory/completion/eval work", async () => {
  let work = 0;
  const deps = buildTestDeps({keyStore: fakeKeyStore({})});
  deps.ask.tree.load = async () => {work++; return null;};
  deps.ask.requestDepsFor = () => {work++; throw new Error("unexpected");};
  deps.evalRuns = {create: async () => {work++;}, recordScore: async () => false};
  for (const key of ["", "invalid", "revoked"]) assert.equal((await mountedStart(deps, key)).status, 401);
  assert.equal(work, 0);
});

test("compete actual bounded factory preserves source grounding and concurrent tenant/query isolation", {timeout: 10_000}, async () => {
  const owners = ["tenant-a", "tenant-b"], filters: any[] = [], dispatches: {tenant: string; kind: string}[] = [], audits: any[] = [], writes: any[] = [], embeddings: string[] = [], factoryTenants: string[] = [];
  const nodes = Object.fromEntries(owners.map(tenant => [tenant, {node_id: `tenant:${tenant}/session:${tenant}-s`, title: "Visa", level: "session", summary: "UNREVIEWED_POISON ".repeat(1000), evidence: {sessionRef: `${tenant}-s`}, children: []} as TreeIndexNode]));
  const turns = owners.map(tenant => ({_id: `${tenant}-t1`, tenantId: tenant, sessionId: `${tenant}-s`, speakerRef: "spk:0", tStart: 0, tEnd: 5, text: `Visa form evidence for ${tenant}.`}));
  const chunks = owners.map(tenant => ({_id: `${tenant}-c1`, tenantId: tenant, sourceRef: `${tenant}-s`, turnRefs: [`${tenant}-t1`], chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "fixture"}));
  const db = {collection: (collection: string) => ({find: (filter: any) => {filters.push({collection, ...filter}); return {toArray: async () =>
    (collection === "turns" ? turns : chunks).filter(row => row.tenantId === filter.tenantId)};}})} as unknown as Db;
  const started: Record<string, Promise<void>> = {}, gates: Record<string, Promise<void>> = {}, release: Record<string, () => void> = {}, reached: Record<string, () => void> = {};
  for (const tenant of owners) {started[tenant] = new Promise(resolve => {reached[tenant] = resolve;}); gates[tenant] = new Promise(resolve => {release[tenant] = resolve;});}
  let attack = "";
  const completion = (json: unknown) => ({text: JSON.stringify(json), json, provider: "offline", model: "fixture", costUsd: 0, usage: {inputTokens: 1, outputTokens: 1}});
  const actualFactory = createSourceRequestDepsFor({db, write: async job => {audits.push(job);}, treeSearchFn: (tree, ids) => tree.children.filter(n => ids.includes(n.node_id)),
    embed: async job => {embeddings.push(job.texts[0]!); return {vectors: [[1, 0]], dims: 2, provider: "offline", model: "fixture"};},
    dispatch: async (job, tenant) => {
      dispatches.push({tenant, kind: job.kind}); assert.ok(!JSON.stringify(job.messages).includes("UNREVIEWED_POISON"));
      assert.ok(!JSON.stringify(job.messages).includes(tenant === "tenant-a" ? "tenant-b" : "tenant-a"));
      if (job.kind === "ask.select_nodes") {reached[tenant]!(); await gates[tenant]; return completion({node_ids: [nodes[tenant]!.node_id]});}
      if (job.kind === "evaluator") return completion({score: 0.9, reason: "literal source answers"});
      if (job.kind === "ask.answer_grounding") return completion({decisions: [{id: "sentence-0", supported: attack !== "grounding", answersQuery: true}]});
      const strips = unpackContext(JSON.parse(job.messages[1]!.content).context);
      assert.equal(strips[0]!.text, turns.find(turn => turn.tenantId === tenant)!.text);
      return completion({sentences: [{text: `The source says a visa form is needed for ${tenant}.`, sourceIds: [attack === "generation" ? "foreign-source" : strips[0]!.sourceId]}]});
    }});
  const deps = buildTestDeps({keyStore: fakeKeyStore(Object.fromEntries(owners.map(tenant => [tenant, {tenantId: tenant, scopes: ["compete"]}])))});
  deps.ask.tree = {load: async tenant => ({node_id: tenant, title: "Tenant", level: "tenant", summary: "UNREVIEWED_POISON", children: [nodes[tenant]!]})};
  deps.ask.askDeps = {...fakeAskDeps(), complete: async () => {throw new Error("legacy completion forbidden");}};
  deps.ask.extraCandidateArmsFor = () => {throw new Error("legacy arms forbidden");};
  deps.ask.requestDepsFor = tenant => {factoryTenants.push(tenant); return {...actualFactory(tenant), tenantId: "foreign"};};
  deps.evalRuns = {create: async (tenant, doc) => {writes.push({tenantId: tenant, ...doc});}, recordScore: async () => false};
  const pendingA = mountedStart(deps, "tenant-a", "Visa form tenant-a"), pendingB = mountedStart(deps, "tenant-b", "Visa form tenant-b");
  await Promise.all(owners.map(tenant => started[tenant])); release["tenant-b"]!();
  const resultB = await pendingB; assert.equal(resultB.status, 200); assert.deepEqual(writes.map(row => row.tenantId), ["tenant-b"]);
  release["tenant-a"]!(); const resultA = await pendingA; assert.equal(resultA.status, 200);
  assert.deepEqual(factoryTenants, owners); assert.deepEqual(writes.map(row => row.tenantId), ["tenant-b", "tenant-a"]);
  assert.deepEqual(embeddings.sort(), ["Visa form tenant-a", "Visa form tenant-b"]);
  for (const [tenant, result] of [["tenant-a", resultA], ["tenant-b", resultB]] as const) {
    assert.equal(result.body.aiAnswer.text, `The source says a visa form is needed for ${tenant}.`);
    const quote = result.body.aiAnswer.sources.internal[0].evidence.sourceQuotes[0];
    assert.equal(quote.turnId, `${tenant}-t1`); assert.equal(quote.quote, turns.find(turn => turn.tenantId === tenant)!.text);
    const saved = writes.find(row => row.tenantId === tenant); assert.deepEqual(saved.aiAnswer, result.body.aiAnswer); assert.equal(saved.credibility, "internal");
    assert.ok(result.body.aiAnswer.scored.length > 0); assert.equal(dispatches.filter(row => row.tenant === tenant && row.kind === "ask.answer_grounding").length, 1);
    assert.ok(audits.some(row => row.tenantId === tenant));
  }
  assert.ok(filters.length > 0 && filters.every(filter => owners.includes(filter.tenantId)));
  for (attack of ["generation", "grounding"]) {
    const before = writes.length; const refused = await mountedStart(deps, "tenant-a", "Visa form tenant-a");
    assert.equal(refused.status, 503); assert.equal(refused.body.evalRunId, undefined); assert.equal(writes.length, before);
    assert.ok(audits.some(row => row.tenantId === "tenant-a" && row.kind === "ask.source_context_refused"));
  }
});

test("POST /compete/:id/score confines an existing evaluation to its authenticated owner", { timeout: 10_000 }, async () => {
  const store = fakeEvalRunStore();
  for (const tenantId of ["tenant-a", "tenant-b"]) {
    await store.create(tenantId, {
      _id: `${tenantId}-evaluation`, question: `${tenantId} private question`,
      counsellor: { name: `${tenantId} counsellor` }, credibility: "internal",
      createdAt: "2026-10-09T00:00:00.000Z",
      counsellorAnswer: { text: `${tenantId} original answer` }, score: { ai: 2, counsellor: 3 },
    });
  }
  const originalA = structuredClone(store._rows.get("tenant-a-evaluation"));
  const originalB = structuredClone(store._rows.get("tenant-b-evaluation"));
  assert.ok(originalA && originalB, "both tenants must have real existing rows before probing");
  const attempts: { tenantId: string; id: string }[] = [];
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({
      "a-key": { tenantId: "tenant-a", scopes: ["compete"] },
      "b-key": { tenantId: "tenant-b", scopes: ["compete"] },
      "a-unscoped": { tenantId: "tenant-a", scopes: ["ask"] },
    }),
    evalRuns: {
      create: store.create,
      async recordScore(tenantId, id, update) {
        attempts.push({ tenantId, id });
        return store.recordScore(tenantId, id, update);
      },
    },
  }));
  const update = { counsellorAnswer: { text: "new owner answer" }, score: { ai: 5, counsellor: 4 } };
  const score = (key: string, id: string, tenantId: string) => fetch(`${server.baseUrl}/compete/${id}/score`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...update, tenantId }), signal: AbortSignal.timeout(3_000),
  });
  try {
    const denied = await score("b-key", "tenant-a-evaluation", "tenant-a");
    assert.equal(denied.status, 404);
    assert.deepEqual(await denied.json(), { error: "not_found", message: "no eval run with that id for this tenant" });
    assert.deepEqual(attempts, [{ tenantId: "tenant-b", id: "tenant-a-evaluation" }], "body tenant override must not control the store");
    assert.deepEqual(store._rows.get("tenant-a-evaluation"), originalA, "foreign probe must preserve every owner field");
    assert.deepEqual(store._rows.get("tenant-b-evaluation"), originalB, "foreign probe must not update the caller's other row");

    const forbidden = await score("a-unscoped", "tenant-a-evaluation", "tenant-a");
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json() as { error: string }).error, "forbidden");
    assert.equal(attempts.length, 1, "scope refusal must happen before any store write attempt");
    assert.deepEqual(store._rows.get("tenant-a-evaluation"), originalA);
    assert.deepEqual(store._rows.get("tenant-b-evaluation"), originalB);

    const allowed = await score("a-key", "tenant-a-evaluation", "tenant-b");
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true });
    assert.deepEqual(attempts[1], { tenantId: "tenant-a", id: "tenant-a-evaluation" });
    assert.deepEqual(store._rows.get("tenant-a-evaluation"), { ...originalA, ...update });
    assert.deepEqual(store._rows.get("tenant-b-evaluation"), originalB);
    assert.equal(store._rows.size, 2, "refused or accepted scores must never insert rows");

    const allowedB = await score("b-key", "tenant-b-evaluation", "tenant-a");
    assert.equal(allowedB.status, 200, "second tenant must also succeed on its own row");
    assert.deepEqual(await allowedB.json(), { ok: true });
    assert.deepEqual(attempts[2], { tenantId: "tenant-b", id: "tenant-b-evaluation" });
    assert.deepEqual(store._rows.get("tenant-b-evaluation"), { ...originalB, ...update });
    assert.deepEqual(store._rows.get("tenant-a-evaluation"), { ...originalA, ...update });
    assert.equal(attempts.length, 3);
    assert.equal(store._rows.size, 2);
  } finally {
    await server.close();
  }
});
