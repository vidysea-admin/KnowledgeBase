import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWorkDb, STAGING_DB } from "./test-data-route.mjs";

test("a source that is not exactly testData:true keeps the configured work database", () => {
  for (const testData of [undefined, false, "true", 1, null]) {
    assert.deepEqual(resolveWorkDb({ testData, workDb: "lkb_work", env: {} }), { workDb: "lkb_work", testData: false });
  }
});

test("testData:true goes to lkb_staging, and only with the existing LKB_ALLOW_STAGING opt-in", () => {
  const r = resolveWorkDb({ testData: true, workDb: "lkb_work", env: { LKB_ALLOW_STAGING: "lkb_staging" } });
  assert.deepEqual(r, { workDb: STAGING_DB, testData: true, rerouted: true });
  assert.equal(resolveWorkDb({ testData: true, workDb: "lkb_staging", env: { LKB_ALLOW_STAGING: "lkb_staging" } }).rerouted, false);
});

test("testData:true without the opt-in is refused, never written elsewhere (not to the configured db, not to lkb)", () => {
  for (const workDb of ["lkb_work", "lkb", "lkb_staging", undefined]) {
    assert.throws(() => resolveWorkDb({ testData: true, workDb, env: {} }), /refusing to write it anywhere but lkb_staging/);
    assert.throws(() => resolveWorkDb({ testData: true, workDb, env: { LKB_ALLOW_STAGING: "LKB_STAGING" } }), /nothing was written/);
  }
});
