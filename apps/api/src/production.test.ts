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
