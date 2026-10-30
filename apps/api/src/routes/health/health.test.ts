/**
 * apps/api/src/routes/health/health.test.ts — in-process HTTP requests against `routes/health.ts` with
 * `fakeHealthDeps`. Covers: healthy -> 200 with real shape; NO Authorization header still works
 * (the deliberate unauthenticated exception); an unhealthy db report -> 503, not 200.
 *
 * Companion file: the watcher-silence cases live in routes/health/watch-silence.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../../testUtils.js";
import { buildTestDeps, fakeHealthDeps } from "../../fixtures.js";

test("GET /health with no Authorization header returns 200 and EXACTLY {db: ok} (ISS-T057SCREEN-001)", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.deepEqual(JSON.parse(raw), { db: "ok" });
    for (const leak of ["collections", "sessions", "claims", "watchSilent", "watchUnreadable"]) {
      assert.equal(raw.includes(leak), false, `leaked ${leak}`);
    }
  } finally {
    await server.close();
  }
});

test("GET /health never serialises extra keys a checkHealth fake returns (body is whitelisted)", async () => {
  const sneaky = { db: "ok", collections: { secret_tenant_coll: 99 }, tenantId: "t1" } as unknown as { db: "ok" };
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ checkHealth: async () => sneaky }) }));
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.deepEqual(await res.json(), { db: "ok" });
  } finally {
    await server.close();
  }
});

test("GET /health reports 503 with EXACTLY {db: error} when the db is unhealthy", async () => {
  const server = await startTestServer(
    buildTestDeps({ health: fakeHealthDeps({ checkHealth: async () => ({ db: "error" }) }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { db: "error" });
  } finally {
    await server.close();
  }
});

// ---- ISS-T057SCREEN-001 (Approver ruling 2026-10-12: liveness only) ----

test("ISS-T057SCREEN-001 reproduction 1 replayed: an anonymous caller gets no counts or collection names from /health", async () => {
  // The recorded reproduction: unauthenticated GET /health used to return every collection name -> all-tenant count.
  const server = await startTestServer(buildTestDeps());
  try {
    const res = await fetch(`${server.baseUrl}/health`, { headers: {} });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body), ["db"]);
    assert.equal(JSON.stringify(body).match(/\d/), null, "no numbers at all in the public body");
  } finally {
    await server.close();
  }
});

test("ISS-T057SCREEN-001: no countDocuments anywhere on the public /health path (source pin)", async () => {
  const { readFileSync } = await import("node:fs");
  const strip = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(strip("../health.ts"), /countDocuments|estimatedDocumentCount|\.collection\(/);
  assert.doesNotMatch(strip("../../health-probe.ts"), /countDocuments|estimatedDocumentCount|\.collection\(/);
  const store = strip("../../store.ts");
  const fn = store.slice(store.indexOf("export function createMongoHealthDeps"), store.indexOf("export function createMongoHealthDeps") + 400);
  assert.doesNotMatch(fn, /countDocuments|\.collection\(|schema\/index/);
});

test("Dockerfile HEALTHCHECK command still passes against a live /health (200) and fails when the server is down", async () => {
  const { readFileSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  // ASYNC spawn: the test server lives in this process, so a blocking spawnSync would starve it.
  const run = (args: string[], port: string) => new Promise<number | null>((resolve) => {
    const c = spawn(process.execPath, args, { env: { ...process.env, PORT: port }, stdio: "ignore" });
    const t = setTimeout(() => c.kill(), 15000);
    c.on("exit", (code) => { clearTimeout(t); resolve(code); });
  });
  const df = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");
  const m = df.match(/^\s*CMD (\["node", "-e", .*\])\s*$/m);
  assert.ok(m, "HEALTHCHECK CMD found");
  const cmd = JSON.parse(m![1]!) as string[];
  assert.equal(cmd[0], "node");
  const server = await startTestServer(buildTestDeps());
  try {
    const port = new URL(server.baseUrl).port;
    assert.equal(await run(cmd.slice(1), port), 0);
  } finally {
    await server.close();
  }
  // Server closed: the probe must now exit 1 (connection refused), proving it is not vacuous.
  assert.equal(await run(cmd.slice(1), new URL(server.baseUrl).port), 1);
});

test("Dockerfile HEALTHCHECK goes red (exit 1) when the db is down (503)", async () => {
  const { readFileSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  // ASYNC spawn: the test server lives in this process, so a blocking spawnSync would starve it.
  const run = (args: string[], port: string) => new Promise<number | null>((resolve) => {
    const c = spawn(process.execPath, args, { env: { ...process.env, PORT: port }, stdio: "ignore" });
    const t = setTimeout(() => c.kill(), 15000);
    c.on("exit", (code) => { clearTimeout(t); resolve(code); });
  });
  const df = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");
  const cmd = JSON.parse(df.match(/^\s*CMD (\["node", "-e", .*\])\s*$/m)![1]!) as string[];
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ checkHealth: async () => ({ db: "error" }) }) }));
  try {
    assert.equal(await run(cmd.slice(1), new URL(server.baseUrl).port), 1);
  } finally {
    await server.close();
  }
});

