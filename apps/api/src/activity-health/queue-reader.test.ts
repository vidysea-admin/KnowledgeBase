import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createConfiguredActivityHealthDeps, createQueueActivityHealthReader, readQueueConfiguration, type QueueConfiguration, type QueueReadCollection } from "./queue-reader.js";

const env = { UPLOAD_TENANT_ID: " owner ", UPLOAD_ACTOR: " operator ", UPLOAD_QUEUE_DB: "upload_queue_fixture01", MONGODB_URL: "mongodb://fixture.invalid" };
const config = readQueueConfiguration(env);
const row = { _id: "a".repeat(64), tenantId: "owner", kind: "transcribe.rpc", status: "processing", createdAt: "2026-10-09T12:00:00Z", updatedAt: "2026-10-09T12:01:00+00:00", deadlineMs: Date.parse("2026-10-09T12:30:00Z"), attempts: 2, maxAttempts: 2 };
function collection(rows: unknown[], calls: unknown[] = []): QueueReadCollection {
  return { find(filter, options) { calls.push([filter, options]); return { toArray: async () => rows }; } };
}
test("configuration parity against authoritative connectQueue and identity for exact positive/negative corpus", async () => {
  const moduleURL = "data:text/javascript," + encodeURIComponent('export class MongoClient { constructor(url){this.url=url;} async connect(){} db(name){return {collection:()=>({}),databaseName:name};} async close(){} }');
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/scripts/upload/queue.mjs") && specifier.endsWith("/mongodb/lib/index.js")) return { url: moduleURL, shortCircuit: true };
    return next(specifier, context);
  } });
  try {
    const authoritative = await import(new URL("../../../../scripts/upload/queue.mjs", import.meta.url).href);
    for (const positive of [env, { ...env, UPLOAD_QUEUE_DB: "upload_queue_" + "a".repeat(8) }, { ...env, UPLOAD_QUEUE_DB: "upload_queue_" + "a".repeat(55), UPLOAD_TENANT_ID: "x".repeat(200), UPLOAD_ACTOR: "x".repeat(200) }]) {
      const ours = readQueueConfiguration(positive), actual = await authoritative.connectQueue(positive);
      assert.equal(ours.tenantId, actual.tenantId); assert.equal(ours.actor, actual.actor); await actual.close();
    }
    const cases = [ { UPLOAD_TENANT_ID: undefined }, { UPLOAD_TENANT_ID: " " }, { UPLOAD_TENANT_ID: "x".repeat(201) },
      { UPLOAD_ACTOR: undefined }, { UPLOAD_ACTOR: " " }, { UPLOAD_ACTOR: "x".repeat(201) }, { UPLOAD_QUEUE_DB: undefined },
      { UPLOAD_QUEUE_DB: "main" }, { UPLOAD_QUEUE_DB: "upload_queue_short" }, { UPLOAD_QUEUE_DB: "upload_queue_" + "a".repeat(56) },
      { UPLOAD_QUEUE_DB: "upload_queue_bad/name" }, { MONGODB_URL: undefined }, { MONGODB_URL: "" } ];
    for (const change of cases) { assert.throws(() => readQueueConfiguration({ ...env, ...change })); await assert.rejects(authoritative.connectQueue({ ...env, ...change })); }
    assert.equal(cases.length, 13);
  } finally { hook.deregister(); }
});
test("lazy configured factory refuses foreign/missing config before connect; verifies returned binding and closes owned resources", async () => {
  const calls: QueueConfiguration[] = []; let closes = 0;
  const connector = async (configuration: QueueConfiguration) => { calls.push(configuration); return { tenantId: configuration.tenantId, database: configuration.database, collection: collection([]), close: async () => { closes++; } }; };
  const reader = createConfiguredActivityHealthDeps(env, connector);
  assert.equal(calls.length, 0); await assert.rejects(reader.readActivityHealth("foreign", 50)); assert.equal(calls.length, 0);
  assert.deepEqual((await reader.readActivityHealth("owner", 50)).jobs, []); await reader.readActivityHealth("owner", 50); assert.equal(calls.length, 1);
  assert.equal(calls[0]?.database, env.UPLOAD_QUEUE_DB); await reader.close?.(); assert.equal(closes, 1); await assert.rejects(reader.readActivityHealth("owner", 50));
  for (const change of [{ tenantId: "foreign" }, { database: "main" }]) {
    const bad = createConfiguredActivityHealthDeps(env, async configuration => ({ ...await connector(configuration), ...change }));
    await assert.rejects(bad.readActivityHealth("owner", 50));
  }
  assert.equal(closes, 3);
  const before = calls.length; await assert.rejects(createConfiguredActivityHealthDeps({}, connector).readActivityHealth("owner", 50)); assert.equal(calls.length, before);
});
test("strict tenant/kind bounded projection gives safe retry/errors and accurate truncation", async () => {
  const calls: unknown[] = [];
  const reader = createQueueActivityHealthReader(config, collection([{ ...row, request: "SECRET", response: "SECRET", claimToken: "SECRET", leaseUntilMs: 42 }, { ...row, _id: "b".repeat(64) }], calls), () => new Date("2026-10-09T12:02:00Z"));
  const result = await reader.readActivityHealth("owner", 1);
  assert.equal(result.truncated, true); assert.equal(result.jobs[0]?.automaticRetryCount, 1); assert.equal(JSON.stringify(result).includes("SECRET"), false);
  const call = calls[0] as [unknown, { projection: Record<string, number>; limit: number; maxTimeMS: number }];
  assert.deepEqual(call[0], { tenantId: "owner", kind: "transcribe.rpc" }); assert.equal(call[1].limit, 2); assert.equal(call[1].maxTimeMS, 5000);
  for (const field of ["request", "response", "claimToken", "leaseUntilMs", "actor", "runId"]) assert.equal(call[1].projection[field], undefined);
  const unknown = await createQueueActivityHealthReader(config, collection([{ ...row, status: "failed", error: "SECRET https://private.invalid" }])).readActivityHealth("owner", 50);
  assert.equal(unknown.jobs[0]?.errorClass, "unknown"); assert.equal(JSON.stringify(unknown).includes("SECRET"), false);
});
test("malformed rows, counters, dates and foreign sentinels fail explicitly", async () => {
  for (const change of [{ tenantId: "foreign" }, { kind: "provider-call" }, { _id: "private/path" }, { attempts: undefined }, { attempts: NaN }, { attempts: 3 },
    { maxAttempts: 0 }, { maxAttempts: "2" }, { createdAt: "2026-02-30T12:00:00Z" }, { updatedAt: "no" }, { deadlineMs: Infinity }, { deadlineMs: -1 }, { status: "ready" }]) {
    await assert.rejects(createQueueActivityHealthReader(config, collection([{ ...row, ...change }])).readActivityHealth("owner", 50));
  }
  await assert.rejects(createQueueActivityHealthReader(config, collection([row])).readActivityHealth("foreign", 1));
  await assert.rejects(createQueueActivityHealthReader(config, collection([row, row])).readActivityHealth("owner", 50));
});
