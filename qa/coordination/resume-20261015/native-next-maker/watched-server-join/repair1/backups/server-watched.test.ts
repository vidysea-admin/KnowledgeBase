/** Actual supervisor/host boundary with controlled stores; no Mongo, sockets or acquisition. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createGuardedFetcher } from "../../packages/ingest/src/index.js";
import type { VerifiedKey } from "../../apps/api/src/auth.js";
import type { ConnectorWorkflowDeps } from "../../apps/api/src/connector-workflow/types.js";
import type { NativeArchiveServerService } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";
import { startNativeServer, stopNativeServer, type NativeServerRuntime } from "./server.js";

const auth: VerifiedKey = { tenantId: "verified-tenant", keyId: "stored-service-key", scopes: ["sources", "ingest"] };
const enabled = { MONGODB_DB: "lkb_native_join_fixture", LKB_WATCHED_WORKER_ENABLED: "1",
  LKB_WATCHED_WORKER_KEY: "fixture-only", LKB_TENANT_ID: "foreign-configured-tenant" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const calls: string[] = [], logs: string[] = [];
  const server = createServer(); let listening = false, sharedDbCloses = 0;
  Object.defineProperty(server, "listening", { get: () => listening });
  server.close = callback => { calls.push("http-close"); listening = false; callback?.(); return server; };
  const db = { client: { close: async () => { sharedDbCloses++; } } } as never;
  const workflow = { sourceJobs: {}, now: () => "2026-10-16T00:00:00.000Z", store: {
    assertWritableTenant(tenant: string) { assert.equal(tenant, auth.tenantId); calls.push("tenant"); },
    async listWatched(tenant: string) { assert.equal(tenant, auth.tenantId); calls.push("inventory"); return []; },
  }, watched: { fetcher: createGuardedFetcher({ lookup: async () => { throw new Error("No acquisition expected"); },
    request: async () => { throw new Error("No acquisition expected"); } }) } } as unknown as ConnectorWorkflowDeps;
  const deps = { connectorWorkflow: workflow, keyStore: { async verify(key: string) {
    assert.equal(key, enabled.LKB_WATCHED_WORKER_KEY); calls.push("verify"); return auth;
  } } };
  const runtime: Partial<NativeServerRuntime> = {
    async connect() { calls.push("connect"); return db; }, getDb: () => db,
    async service() { calls.push("service"); return { async drain() { calls.push("drain"); return { pending: 0 }; } } as NativeArchiveServerService; },
    buildDeps() { calls.push("deps"); return deps as never; },
    startServer() { calls.push("listen"); return server; }, log: message => logs.push(message),
  };
  return { calls, logs, server, workflow, deps, runtime, sharedDbCloses: () => sharedDbCloses,
    listening() { listening = true; server.emit("listening"); } };
}

test("disabled and nonexact opt-ins start no supervisor/timers or stored-key reads", async () => {
  for (const flag of [undefined, "0", "true", "01"]) {
    const f = fixture(); let supervisors = 0;
    const server = await startNativeServer({ MONGODB_DB: enabled.MONGODB_DB, LKB_WATCHED_WORKER_ENABLED: flag }, {
      ...f.runtime, watchedSupervisor: async () => { supervisors++; },
    });
    f.listening(); await Promise.resolve();
    assert.equal(supervisors, 0); assert.equal(f.calls.includes("verify"), false);
    await stopNativeServer(server);
    assert.equal(f.sharedDbCloses(), 0);
  }
});
test("actual imported supervisor starts only after listening and stop drains initialized auth/tick before HTTP close", async () => {
  const f = fixture(), entered = deferred<void>(), release = deferred<VerifiedKey>();
  f.deps.keyStore.verify = async key => {
    assert.equal(key, enabled.LKB_WATCHED_WORKER_KEY); f.calls.push("verify"); entered.resolve();
    return await release.promise;
  };
  let disposed = 0;
  const server = await startNativeServer(enabled, { ...f.runtime, onStop: async () => { disposed++; f.calls.push("owned-dispose"); } });
  assert.deepEqual(f.calls, ["connect", "service", "drain", "deps", "listen"]);
  f.listening(); await entered.promise;
  const first = stopNativeServer(server), second = stopNativeServer(server);
  assert.equal(first, second);
  assert.equal(f.calls.includes("http-close"), false);
  release.resolve(auth); await first;
  assert.deepEqual(f.calls.slice(-3), ["inventory", "http-close", "owned-dispose"]);
  assert.equal(disposed, 1); assert.equal(f.sharedDbCloses(), 0);
  await stopNativeServer(server); assert.equal(disposed, 1);
});
test("actual stored-key failure logs only fixed supervisor outcome and shutdown still completes", async () => {
  const f = fixture(), entered = deferred<void>();
  f.deps.keyStore.verify = async () => { entered.resolve(); throw new Error("fixture-secret-never-log"); };
  const server = await startNativeServer(enabled, f.runtime);
  f.listening(); await entered.promise; await stopNativeServer(server);
  assert.deepEqual(f.logs, ["Watched worker unavailable or unauthorized; no successful cycle established."]);
  assert.equal(f.calls.includes("inventory"), false); assert.equal(f.sharedDbCloses(), 0);
});
test("task rejection and throwing logger cannot detach owned shutdown", async () => {
  const f = fixture(), entered = deferred<void>();
  const server = await startNativeServer(enabled, { ...f.runtime,
    watchedSupervisor: async () => { entered.resolve(); throw new Error("fixture-private-error"); },
    log: message => { assert.equal(message, "Watched worker stopped unexpectedly; no successful cycle established."); throw new Error("logger-private-error"); },
  });
  f.listening(); await entered.promise; await stopNativeServer(server);
  assert.equal(f.calls.filter(call => call === "http-close").length, 1);
  assert.equal(f.sharedDbCloses(), 0);
});
test("stop before listening aborts pending launch without starting a supervisor", async () => {
  const f = fixture(); let supervisors = 0;
  const server = await startNativeServer(enabled, { ...f.runtime, watchedSupervisor: async () => { supervisors++; } });
  await stopNativeServer(server); f.listening(); await Promise.resolve();
  assert.equal(supervisors, 0); assert.equal(f.calls.includes("verify"), false);
});
test("enabled missing workflow refuses before listen; foreign server and shared Mongo are never disposed", async () => {
  const f = fixture();
  await assert.rejects(startNativeServer(enabled, { ...f.runtime,
    buildDeps: () => ({ keyStore: f.deps.keyStore } as never), onStop: () => { throw new Error("Not owned"); },
  }), /dependencies unavailable/);
  assert.equal(f.calls.includes("listen"), false);
  await stopNativeServer(f.server);
  assert.equal(f.calls.includes("http-close"), false); assert.equal(f.sharedDbCloses(), 0);
});
