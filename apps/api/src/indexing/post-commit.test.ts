import test from "node:test";
import assert from "node:assert/strict";
import { notifyIndexCommitted } from "./post-commit.js";
import { fakeDb } from "./testutils.js";

test("unconfigured post-commit hook performs no persistence reads", async () => {
  const db = { collection() { throw new Error("unexpected persistence read"); } };
  assert.equal(await notifyIndexCommitted(db as never, "t", "s"), "unconfigured");
});
test("pending, missing and foreign index generations never notify archive consumers", async () => {
  const { db } = fakeDb(); let calls = 0;
  for (const tenant of ["t", "foreign"]) {
    assert.equal(await notifyIndexCommitted(db, tenant, "s1", async () => { calls++; }), "unavailable");
  }
  assert.equal(calls, 0);
});
