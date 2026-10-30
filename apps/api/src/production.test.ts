/**
 * apps/api/src/production.test.ts — ISS-274. `buildProductionDeps()` builds no live Mongo/network
 * connection at construction time (every `createMongo*Deps()` factory in `store.ts` binds
 * LAZILY, per-call — see its own module doc), so this can run as a plain unit test.
 *
 * The one thing this file exists to prove: `askDeps.tavilySearchFn` is wired UNCONDITIONALLY now
 * (D-041 ruling 2 / ISS-274), not only when `TAVILY_API_KEY` happens to be set. Before this unit,
 * `production.ts` used `...(tavilySearchFn ? { tavilySearchFn } : {})`, so an unset key meant the
 * key was entirely ABSENT from `askDeps` and `askV2` never even attempted the fallback path. The
 * contract (qa/contracts/ask-web-fallback-tavily.md) verified this only by manual code reading
 * ("How to verify" step 5) — this test makes it a real, automated, falsifiable assertion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildProductionDeps, buildIndexer } from "./composition/production.js";
import { routedFixture, turns, session, source } from "./grounded-postprocessing/fixture.testsupport.js";
import { transactionalFixture } from "./transcript-review/refresh-testkit.js";
import { buildTestDeps, fakeKeyStore } from "./fixtures.js";
import { startTestServer } from "./testUtils.js";

test("ISS-274: buildProductionDeps wires tavilySearchFn into askDeps even with no TAVILY_API_KEY set", () => {
  const prev = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const deps = buildProductionDeps();
    assert.equal(
      typeof deps.ask.askDeps.tavilySearchFn,
      "function",
      "tavilySearchFn must be present in production's askDeps regardless of TAVILY_API_KEY",
    );
  } finally {
    if (prev !== undefined) process.env.TAVILY_API_KEY = prev;
  }
});

test("ISS-274: buildProductionDeps constructs without throwing or requiring a live Mongo/network connection", () => {
  // Every createMongo*Deps() factory binds lazily; if this ever stops being true, this whole
  // file (and every other unit test that calls buildProductionDeps-adjacent factories) would
  // start needing a live database, which is exactly the regression this test guards against.
  assert.doesNotThrow(() => buildProductionDeps());
});

test("production native/review readers bind before connection while DB-name policies remain deferred", () => {
  const deps = buildProductionDeps({ onIndexCommitted: async () => {} });
  assert.equal(typeof deps.nativeEvidence?.resolve, "function");
  assert.equal(typeof deps.sessionDecisions?.getSessionDecisions, "function");
  assert.equal(typeof deps.speakerProfiles?.get, "function");
  assert.equal(typeof deps.ask.askDeps.tavilySearchFn, "function");
  for (const key of ["transcriptReview", "answerWorkflow", "answerPolicyService", "evaluationFlywheel"]) {
    assert.equal(typeof Object.getOwnPropertyDescriptor(deps, key)?.get, "function");
  }
  assert.equal(typeof Object.getOwnPropertyDescriptor(deps.ask, "answerWorkflow")?.get, "function");
});

test("production buildIndexer forwards trusted callback after acknowledged outer commit", async () => {
  const transaction = transactionalFixture(), provider = routedFixture();
  for (const turn of turns) transaction.seed("turns", turn);
  transaction.seed("sessions", session);
  transaction.seed("sources", source);
  let notified = 0;
  const index = buildIndexer(provider.routing, { db: transaction.db, strictWebinar: true, onIndexCommitted: async binding => {
    notified++;
    assert.equal(binding.tenantId, "t");
    assert.equal(binding.sessionId, "s1");
    assert.equal(transaction.rows("sessions")[0]!.indexAttempt.generation, binding.generation);
  } });
  const result = await index("t", "s1");
  assert.equal(result.completion?.complete, true);
  assert.equal(notified, 1);
});

/** ua-production-enable P-1: production composes `userAccounts` (usable AUTH_CSRF_SECRET only) and createServer then mounts /auth + /admin. */
async function withSecret<T>(secret: string | undefined, run: () => Promise<T>): Promise<T> {
  const prev = process.env.AUTH_CSRF_SECRET;
  if (secret === undefined) delete process.env.AUTH_CSRF_SECRET; else process.env.AUTH_CSRF_SECRET = secret;
  try { return await run(); } finally { if (prev === undefined) delete process.env.AUTH_CSRF_SECRET; else process.env.AUTH_CSRF_SECRET = prev; }
}
async function probe(userAccounts: ReturnType<typeof buildProductionDeps>["userAccounts"]) {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore({ "key-ask": { tenantId: "t", scopes: ["ask"] } }), userAccounts }));
  const status = async (path: string, bearer?: string) =>
    (await fetch(server.baseUrl + path, { headers: { connection: "close", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } })).status;
  return { status, close: server.close };
}

test("P-1: a usable AUTH_CSRF_SECRET makes buildProductionDeps set userAccounts and the server mounts /auth and /admin", async () => {
  await withSecret("s".repeat(48), async () => {
    const deps = buildProductionDeps();
    assert.ok(deps.userAccounts, "userAccounts is composed");
    assert.equal(typeof deps.userAccounts.session.attach, "function");
    assert.equal(typeof deps.userAccounts.authRouter, "function", "A4 router, not the 503 placeholder");
    assert.equal(typeof deps.userAccounts.adminRouter, "function", "A6 router, not the 503 placeholder");
    const s = await probe(deps.userAccounts);
    try {
      assert.equal(await s.status("/auth/no-such-route"), 404, "/auth is mounted: terminal 404, not the shared 401");
      assert.equal(await s.status("/admin/users"), 401, "/admin is mounted behind requireAuth: anonymous is 401");
      assert.equal(await s.status("/admin/users", "key-ask"), 403, "/admin is mounted: a key without user-admin is refused by the router scope check");
    } finally { await s.close(); }
  });
});

test("P-1: without a usable AUTH_CSRF_SECRET userAccounts is undefined and API-key behaviour is unchanged", async () => {
  for (const secret of [undefined, "short-secret"]) await withSecret(secret, async () => {
    const deps = buildProductionDeps();
    assert.equal(deps.userAccounts, undefined, `secret=${String(secret)}`);
    assert.ok(deps.keyStore, "API key store still composed");
    const s = await probe(deps.userAccounts);
    try {
      assert.equal(await s.status("/auth/no-such-route"), 401, "/auth is NOT mounted: the shared perimeter answers");
      assert.equal(await s.status("/system/status", "key-ask") === 401, false, "a valid API key still authenticates");
      assert.equal(await s.status("/system/status"), 401, "anonymous is still 401");
    } finally { await s.close(); }
  });
});
