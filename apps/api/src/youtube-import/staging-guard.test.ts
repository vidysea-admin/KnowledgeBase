import { test } from "node:test";
import assert from "node:assert/strict";
import { requireStagingDatabase } from "./staging-guard.js";

test("staging guard refuses every non-staging target and a missing opt-in; allows lkb_staging", () => {
  for (const env of [{ MONGODB_DB: "lkb" }, { MONGODB_DB: "lkb", LKB_ALLOW_STAGING: "lkb_staging" }, { MONGODB_DB: "global_university_db" }, { MONGODB_DB: "LKB_STAGING", LKB_ALLOW_STAGING: "lkb_staging" },
    { MONGODB_DB: "lkb_staging" }, { MONGODB_DB: "lkb_staging", LKB_ALLOW_STAGING: "yes" }, {}, { MONGODB_DB: "  " }]) {
    assert.throws(() => requireStagingDatabase(env), Error, JSON.stringify(env));
  }
  assert.equal(requireStagingDatabase({ MONGODB_DB: "lkb_staging", LKB_ALLOW_STAGING: "lkb_staging" }), "lkb_staging");
});
