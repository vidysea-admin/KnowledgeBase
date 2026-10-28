/** Actual supervisor/host boundary with controlled stores; no Mongo, sockets or acquisition. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { createGuardedFetcher } from "../../packages/ingest/src/index.js";
import type { VerifiedKey } from "../../apps/api/src/auth.js";
import type { ConnectorWorkflowDeps } from "../../apps/api/src/connector-workflow/types.js";
import type { NativeArchiveServerService } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";
import { installNativeCliShutdown, startNativeServer, stopNativeServer, type NativeServerRuntime } from "./server.js";

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
  const service: NativeArchiveServerService = {
    async drain() { calls.push("drain"); return { pending: 0 }; },
    async sealCapture() { throw new Error("Unexpected capture sealing in server join fixture"); },
    async onIndexCommitted() { throw new Error("Unexpected index commit in server join fixture"); },
  };
  const runtime: Partial<NativeServerRuntime> = {
    async connect() { calls.push("connect"); return db; }, getDb: () => db,
    async service() { calls.push("service"); return service; },
    buildDeps() { calls.push("deps"); return deps as never; },
    startServer() { calls.push("listen"); return server; }, log: message => logs.push(message),
  };
  return { calls, logs, server, workflow, deps, runtime, sharedDbCloses: () => sharedDbCloses,
    listening() { listening = true; server.emit("listening"); } };
}

test("disabled and nonexact opt-ins start no supervisor/timers or stored-key reads", async () => {
  for (const flag of [undefined, "0", "true", "01"]) {
    const f = fixture(); let supervisors = 0;
    const handlers = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    const server = await startNativeServer({ MONGODB_DB: enabled.MONGODB_DB, LKB_WATCHED_WORKER_ENABLED: flag }, {
      ...f.runtime, watchedSupervisor: async () => { supervisors++; },
    });
    f.listening(); await Promise.resolve();
    assert.equal(supervisors, 0); assert.equal(f.calls.includes("verify"), false);
    assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")], handlers);
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

function cliFixture(stop: () => Promise<void>) {
  const signals = new EventEmitter(), finishes: number[] = [], logs: string[] = [];
  let scheduled = 0, cancelled = 0, fire: (() => void) | undefined;
  const handle = Symbol("fake-deadline");
  installNativeCliShutdown(createServer(), { signals, finishCLI: code => finishes.push(code), stop,
    log: message => logs.push(message), timer: {
      schedule(callback, delayMs) { assert.equal(delayMs, 30000); scheduled++; fire = callback; return handle; },
      cancel(value) { assert.equal(value, handle); cancelled++; fire = undefined; },
    } });
  return { signals, finishes, logs, scheduled: () => scheduled, cancelled: () => cancelled,
    deadline() { assert.ok(fire); fire(); } };
}
function assertCliClean(f: ReturnType<typeof cliFixture>) {
  assert.equal(f.signals.listenerCount("SIGINT"), 0);
  assert.equal(f.signals.listenerCount("SIGTERM"), 0);
  assert.equal(f.cancelled(), 1);
}
test("explicit CLI coordinator is passive until signal and finishes only after successful drain", async () => {
  const drained = deferred<void>(); let stops = 0;
  const f = cliFixture(() => { stops++; return drained.promise; });
  assert.equal(stops, 0); assert.equal(f.scheduled(), 0); assert.deepEqual(f.finishes, []);
  f.signals.emit("SIGINT");
  assert.equal(stops, 1); assert.equal(f.scheduled(), 1); assert.deepEqual(f.finishes, []);
  drained.resolve(); await Promise.resolve();
  assert.deepEqual(f.finishes, [0]); assert.deepEqual(f.logs, []); assertCliClean(f);
  f.signals.emit("SIGTERM"); assert.deepEqual(f.finishes, [0]);
});
test("CLI deadline finishes nonzero without claiming to cancel a hung tick", async () => {
  const drained = deferred<void>(), f = cliFixture(() => drained.promise);
  f.signals.emit("SIGTERM"); f.deadline();
  assert.deepEqual(f.finishes, [1]);
  assert.deepEqual(f.logs, ["Native CLI shutdown deadline reached; pending work may require recovery."]);
  assertCliClean(f);
  drained.resolve(); await Promise.resolve(); assert.deepEqual(f.finishes, [1]);
});
test("CLI drain failures finish nonzero with fixed diagnostics and clear timer/listeners", async () => {
  for (const synchronous of [false, true]) {
    const f = cliFixture(() => {
      if (synchronous) throw new Error("fixture-private-message");
      return Promise.reject(new Error("fixture-private-message"));
    });
    f.signals.emit("SIGINT"); await Promise.resolve();
    assert.deepEqual(f.finishes, [1]);
    assert.deepEqual(f.logs, ["Native CLI shutdown failed; pending work may require recovery."]);
    assertCliClean(f);
  }
});
test("second CLI signal forces its explicit nonzero code once and removes both handlers", async () => {
  for (const second of ["SIGINT", "SIGTERM"] as const) {
    const drained = deferred<void>(); let stops = 0;
    const f = cliFixture(() => { stops++; return drained.promise; });
    f.signals.emit("SIGINT"); f.signals.emit(second);
    assert.deepEqual(f.finishes, [second === "SIGINT" ? 130 : 143]); assert.equal(stops, 1);
    assertCliClean(f);
    drained.resolve(); await Promise.resolve(); assert.equal(f.finishes.length, 1);
  }
});
