// Dry-run of 20261017120000-registration-link-approvals.cjs. Never connects to Mongo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const migration = require("./20261017120000-registration-link-approvals.cjs");
const schema = JSON.parse(readFileSync(new URL("../schema/registration_link_approvals.schema.json", import.meta.url), "utf8"));

test("validator maps dependentRequired to Mongo dependencies and keeps every required field", () => {
  const v = migration.mongoValidator(schema);
  assert.equal(v.dependentRequired, undefined);
  assert.deepEqual(v.dependencies, schema.dependentRequired);
  assert.deepEqual(v.required, schema.required);
  assert.equal(v.additionalProperties, false);
  assert.deepEqual(v.properties.policyRevision.bsonType, ["int", "long"]);
});
test("up refuses without an explicit isolated work database and down refuses rollback", async () => {
  await assert.rejects(migration.up({ databaseName: "lkb_staging" }));
  await assert.rejects(migration.down());
});
