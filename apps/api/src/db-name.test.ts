/** ISS-LEGACYSEED-009 / -010: the API has no database default, and lkb_staging needs its opt-in on every path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeMeetingCandidatesDeps } from "./fixtures.js";
import { startFromEnv, type BootstrapDeps } from "./bootstrap.js";
import { requireDatabaseName, isRefusedWorkDb } from "./db-name.js";
import { createMeetingCandidatesDeps } from "./store.js";

function fake() {
  const calls: { connect: Array<[string, string]>; started: number; built: number } = { connect: [], started: 0, built: 0 };
  const server = { fake: true } as never;
  const d: BootstrapDeps<{ x: number }> = {
    connect: async (url, db) => { calls.connect.push([url, db]); },
    buildDeps: () => { calls.built++; return { x: 1 }; },
    startServer: () => { calls.started++; return server; },
  };
  return { calls, d, server };
}

test("ISS-LEGACYSEED-009: server refuses to start without a DB name, before connect/build/listen", async () => {
  for (const env of [{}, { MONGODB_DB: "" }, { MONGODB_DB: "   " }, { MONGODB_URL: "mongodb://x:1" }] as NodeJS.ProcessEnv[]) {
    const { calls, d } = fake();
    await assert.rejects(() => startFromEnv(env, d), /MONGODB_DB is required/);
    assert.deepEqual([calls.connect.length, calls.built, calls.started], [0, 0, 0]);
  }
});

test("ISS-LEGACYSEED-009: explicit name starts with the fake client and connects to that exact db", async () => {
  const { calls, d, server } = fake();
  assert.equal(await startFromEnv({ MONGODB_URL: "mongodb://x:1", MONGODB_DB: "lkb" }, d), server);
  assert.deepEqual(calls.connect, [["mongodb://x:1", "lkb"]]);
  assert.equal(calls.started, 1);
  const b = fake();
  await startFromEnv({ MONGODB_DB: " lkb_work_a " }, b.d);
  assert.deepEqual(b.calls.connect, [["mongodb://localhost:27017", "lkb_work_a"]]);
});

test("ISS-LEGACYSEED-010: server refuses lkb_staging without the exact opt-in; accepts it with", async () => {
  for (const extra of [{}, { LKB_ALLOW_STAGING: "" }, { LKB_ALLOW_STAGING: "lkb" }, { LKB_ALLOW_STAGING: "LKB_STAGING" }]) {
    const { calls, d } = fake();
    await assert.rejects(() => startFromEnv({ MONGODB_DB: "lkb_staging", ...extra }, d), /LKB_ALLOW_STAGING/);
    assert.equal(calls.connect.length, 0);
  }
  assert.throws(() => requireDatabaseName({ MONGODB_DB: "LKB_STAGING", LKB_ALLOW_STAGING: "lkb_staging" }), /refused/);
  assert.equal(requireDatabaseName({ MONGODB_DB: "lkb_staging", LKB_ALLOW_STAGING: "lkb_staging" }), "lkb_staging");
});

test("ISS-LEGACYSEED-010: work-database guard (isRefusedWorkDb) refuses lkb_staging without opt-in", () => {
  for (const n of ["lkb", "LKB", "global_university_db", "", undefined, "lkb_staging", "Lkb_Staging"]) assert.equal(isRefusedWorkDb(n, {}), true, String(n));
  assert.equal(isRefusedWorkDb("lkb_staging", { LKB_ALLOW_STAGING: "lkb_staging" }), false);
  assert.equal(isRefusedWorkDb("Lkb_Staging", { LKB_ALLOW_STAGING: "lkb_staging" }), true);
  assert.equal(isRefusedWorkDb("lkb_work_x", {}), false);
});

test("ISS-LEGACYSEED-010: store.getWorkDatabase and the /gmail/scan + /meeting-candidates routes refuse staging", async () => {
  const prev = { w: process.env.MONGO_WORK_DB, a: process.env.LKB_ALLOW_STAGING };
  try {
    process.env.MONGO_WORK_DB = "lkb_staging"; delete process.env.LKB_ALLOW_STAGING;
    const deps = createMeetingCandidatesDeps("t1", undefined, () => "lkb_staging", undefined);
    assert.equal(deps.getWorkDatabase!("t1"), undefined);
    process.env.LKB_ALLOW_STAGING = "lkb_staging";
    assert.equal(deps.getWorkDatabase!("t1"), "lkb_staging");
    // Route layer, independent of the store: a dep that reports lkb_staging is still refused with no opt-in.
    delete process.env.LKB_ALLOW_STAGING;
    let scans = 0;
    const meetingCandidates = { ...fakeMeetingCandidatesDeps(), getWorkDatabase: () => "lkb_staging", scanGmail: async () => { scans++; return {} as never; } };
    const server = await startTestServer(buildTestDeps({ meetingCandidates, keyStore: fakeKeyStore({ k: { tenantId: "t1", scopes: ["gmail"] } }) }));
    try {
      const h = { authorization: "Bearer k", "X-LKB-Work-DB": "lkb_staging" };
      const scan = await fetch(`${server.baseUrl}/gmail/scan`, { method: "POST", headers: h, signal: AbortSignal.timeout(3_000) });
      assert.equal(scan.status, 503); assert.equal(scans, 0);
      const list = await fetch(`${server.baseUrl}/meeting-candidates`, { headers: h, signal: AbortSignal.timeout(3_000) });
      assert.equal(list.status, 200); assert.equal(list.headers.get("x-lkb-work-db"), null);
      process.env.LKB_ALLOW_STAGING = "lkb_staging";
      const ok = await fetch(`${server.baseUrl}/gmail/scan`, { method: "POST", headers: h, signal: AbortSignal.timeout(3_000) });
      assert.equal(ok.status, 200); assert.equal(scans, 1);
    } finally { await server.close(); }
  } finally {
    for (const [k, v] of [["MONGO_WORK_DB", prev.w], ["LKB_ALLOW_STAGING", prev.a]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
});

test("ISS-LEGACYSEED-009: index.ts has no lkb default and goes through startFromEnv", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /MONGODB_DB\s*(\?\?|\|\|)/);
  assert.match(src, /startFromEnv\(process\.env/);
});
