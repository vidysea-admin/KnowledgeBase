// Dry-run of 20261029100000-user-accounts.cjs against an in-memory fake Db. Never connects to Mongo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const migration = require("./20261029100000-user-accounts.cjs");
const declared = JSON.parse(readFileSync(new URL("../schema/index.json", import.meta.url), "utf8"));
const NAMES = ["users", "user_sessions", "user_tokens", "auth_throttles", "auth_events"];

function fakeDb(databaseName, existing = []) {
  const calls = { created: [], commands: [], indexes: [] };
  return {
    calls, databaseName,
    listCollections: () => ({ toArray: async () => existing.map((name) => ({ name })) }),
    createCollection: async (name, options) => { calls.created.push({ name, options }); },
    command: async (c) => { calls.commands.push(c); },
    collection: (name) => ({ createIndex: async (keys, options) => { calls.indexes.push({ name, keys, options }); } }),
  };
}
async function withEnv(env, fn) {
  const saved = { MONGO_WORK_DB: process.env.MONGO_WORK_DB, MONGODB_URL: process.env.MONGODB_URL, MONGODB_DB: process.env.MONGODB_DB, LKB_ALLOW_STAGING: process.env.LKB_ALLOW_STAGING };
  for (const k of Object.keys(saved)) delete process.env[k];
  Object.assign(process.env, env);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const WORK = { MONGO_WORK_DB: "lkb_ua_dry", MONGODB_URL: "mongodb://127.0.0.1:27018" };

test("up refuses production, staging, unset and mismatched databases; down refuses rollback", async () => {
  for (const [env, name] of [[{}, "lkb_ua_dry"], [WORK, "lkb"], [WORK, "lkb_prod"], [WORK, "other_db"], [{ MONGO_WORK_DB: "lkb_prod", MONGODB_URL: WORK.MONGODB_URL }, "lkb_prod"], [{ MONGO_WORK_DB: "lkb", MONGODB_URL: WORK.MONGODB_URL }, "lkb"], [{ MONGO_WORK_DB: "global_university_db", MONGODB_URL: WORK.MONGODB_URL }, "global_university_db"]]) {
    const db = fakeDb(name);
    await withEnv(env, () => assert.rejects(migration.up(db)));
    assert.deepEqual(db.calls.created, [], `no collection may be created on ${name}`);
    assert.deepEqual(db.calls.indexes, []);
  }
  await assert.rejects(migration.down(), /Refusing destructive rollback/);
});

test("up creates exactly the five collections and exactly the indexes declared in schema/index.json", async () => {
  const db = fakeDb("lkb_ua_dry");
  await withEnv(WORK, () => migration.up(db));
  assert.deepEqual(db.calls.created.map((c) => c.name), NAMES);
  for (const c of db.calls.created) { assert.equal(c.options.validationLevel, "strict"); assert.equal(c.options.validationAction, "error"); assert.equal(c.options.validator.$jsonSchema.additionalProperties, false); }
  for (const name of NAMES) {
    const got = db.calls.indexes.filter((i) => i.name === name).map(({ keys, options }) => ({ keys, ...options }));
    assert.deepEqual(got, declared[name], name);
  }
});

test("the required indexes exist: unique email, unique tokenHash, TTL purgeAt on sessions/tokens/throttles/events", () => {
  assert.ok(declared.users.some((i) => JSON.stringify(i.keys) === '{"emailNormalized":1}' && i.unique === true), "global unique normalised email");
  assert.ok(declared.user_sessions.some((i) => JSON.stringify(i.keys) === '{"tokenHash":1}' && i.unique === true));
  assert.ok(declared.user_tokens.some((i) => JSON.stringify(i.keys) === '{"tokenHash":1}' && i.unique === true));
  assert.ok(declared.auth_throttles.some((i) => JSON.stringify(i.keys) === '{"tenantId":1,"subjectHash":1}' && i.unique === true));
  for (const n of ["user_sessions", "user_tokens", "auth_throttles", "auth_events"]) assert.ok(declared[n].some((i) => JSON.stringify(i.keys) === '{"purgeAt":1}' && i.expireAfterSeconds === 0), `${n} TTL`);
  assert.equal(declared.users.some((i) => "expireAfterSeconds" in i), false, "users are never expired by TTL");
  for (const n of NAMES) assert.deepEqual(declared[n][0].keys, { tenantId: 1 }, `${n} leads with tenantId`);
});

test("validators translate the JSON Schema without leaking annotations Mongo rejects", () => {
  const dump = (n) => JSON.stringify(migration.validatorFor(n));
  for (const n of NAMES) { const v = dump(n); assert.doesNotMatch(v, /tsType|x-bsonType|dependentRequired|"format"|\$schema/, n); assert.equal(JSON.parse(v).additionalProperties, false); }
  assert.deepEqual(migration.validatorFor("user_sessions").properties.purgeAt, { bsonType: "date" });
  assert.deepEqual(migration.validatorFor("user_sessions").dependencies, { revokedAt: ["revokedReason", "purgeAt"], revokedReason: ["revokedAt", "purgeAt"], purgeAt: ["revokedAt", "revokedReason"] });
  for (const n of ["user_tokens", "auth_throttles", "auth_events"]) assert.deepEqual(migration.validatorFor(n).properties.purgeAt, { bsonType: "date" }, n);
  assert.ok(migration.validatorFor("users").not, "active-requires-role rule survives translation");
  const ev = migration.validatorFor("auth_events");
  assert.equal(ev.properties.type.bsonType, "string", "a property NAMED type stays a property schema, not a keyword");
  assert.ok(ev.properties.type.enum.includes("login_ok"));
  assert.ok("type" in ev.properties && ev.required.includes("type"));
});

test("up is idempotent on existing collections: collMod instead of create, indexes re-applied", async () => {
  const db = fakeDb("lkb_ua_dry", NAMES);
  await withEnv(WORK, () => migration.up(db));
  assert.deepEqual(db.calls.created, []);
  assert.deepEqual(db.calls.commands.map((c) => c.collMod), NAMES);
  assert.equal(db.calls.indexes.length, NAMES.reduce((n, k) => n + declared[k].length, 0));
});
