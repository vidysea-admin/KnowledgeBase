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

import { buildProductionDeps } from "./composition/production.js";

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
