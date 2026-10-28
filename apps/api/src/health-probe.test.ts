/**
 * apps/api/src/health-probe.test.ts — ISS-070 regression, narrowed by ISS-T057SCREEN-001: the probe is
 * liveness-only (ping), takes no count function, and degrades to `{db: "error"}` instead of throwing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeMongoHealth } from "./health-probe.js";

test("a successful ping returns exactly {db: ok} — no counts", async () => {
  assert.deepEqual(await probeMongoHealth(async () => ({})), { db: "ok" });
});

test("a ping failure degrades to {db: error}, never throws", async () => {
  const report = await probeMongoHealth(async () => { throw new Error("connection refused"); });
  assert.deepEqual(report, { db: "error" });
});
