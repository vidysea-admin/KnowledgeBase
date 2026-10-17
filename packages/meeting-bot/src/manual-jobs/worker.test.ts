import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ManualJobStore } from "./store.js";
import { runManualWorker, type ManualWorkerDeps } from "./worker.js";

const now = () => new Date("2026-10-14T10:00:00.000Z");
async function fixture(fn: (store: ManualJobStore, id: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "manual-worker-")), store = new ManualJobStore(dir, now);
  const req = store.create("a", { meetingUrl: "https://meet.google.com/abc-defg-hij", meetingKey: "meet:abc-defg-hij", platform: "meet" }, "2026-10-14T11:00:00.000Z");
  try { await fn(store, req.jobId); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
test("cancel before worker start records terminal cancellation without launching", async () => fixture(async (store, id) => {
  store.cancel("a", id);
  let launches = 0;
  await runManualWorker("/root", store, "a", id, { schedule: () => () => {}, launch: async () => { launches++; } });
  assert.equal(launches, 0); assert.equal(store.summary("a", id)!.state, "cancelled");
}));
test("cancel before recorder readiness waits, then owned ACK is distinct from actual terminal exit", async () => fixture(async (store, id) => {
  let tick!: () => void, line!: (line: string) => void, finish!: () => void, stops = 0;
  const deps: ManualWorkerDeps = {
    schedule: fn => { tick = fn; return () => {}; },
    launch: async (_root, args, env, onLine, control) => {
      assert.equal(args[0], "record"); assert.equal(env.LKB_TENANT_ID, "a"); assert.ok(args.includes(id)); line = onLine;
      control({ generation: "owned-generation", stop: async reason => { assert.equal(reason, "cancelled"); stops++; return "accepted"; } });
      await new Promise<void>(resolve => { finish = resolve; });
    },
  };
  const running = runManualWorker("/root", store, "a", id, deps);
  store.cancel("a", id); tick(); await flush();
  assert.equal(stops, 0); assert.equal(store.summary("a", id)!.state, "cancel-requested");
  line("[bot] recording until 11:00"); await flush();
  assert.equal(stops, 1); assert.equal(store.summary("a", id)!.state, "cancel-acknowledged");
  assert.equal(store.summary("a", id)!.joined, "unknown");
  finish(); await running;
  assert.equal(store.summary("a", id)!.state, "cancelled");
}));
test("recorder exit before readiness stores failure without fabricating admission or cancellation", async () => fixture(async (store, id) => {
  await runManualWorker("/root", store, "a", id, { schedule: () => () => {}, launch: async () => { throw new Error("private URL passcode"); } });
  assert.equal(store.summary("a", id)!.state, "failed");
  assert.ok(!JSON.stringify(store.list("a")).includes("passcode"));
}));
test("in-flight ACK completes before final state and cannot overwrite terminal cancellation", async () => fixture(async (store, id) => {
  let acknowledge!: (value: "accepted") => void, finish!: () => void, line!: (line: string) => void;
  const running = runManualWorker("/root", store, "a", id, {
    schedule: () => () => {},
    launch: async (_root, _args, _env, onLine, control) => {
      line = onLine; control({ generation: "owned", stop: () => new Promise(resolve => { acknowledge = resolve; }) });
      await new Promise<void>(resolve => { finish = resolve; });
    },
  });
  store.cancel("a", id); line("[bot] recording until 11:00"); await flush(); finish(); await flush();
  assert.equal(store.summary("a", id)!.state, "cancel-requested");
  acknowledge("accepted"); await running;
  assert.equal(store.summary("a", id)!.state, "cancelled");
}));
test("readiness callback storage error is contained and requests owned stop rather than throwing from EventEmitter", async () => fixture(async (store, id) => {
  const original = store.writeProgress.bind(store); let writes = 0, stops = 0;
  store.writeProgress = (req, state) => { if (++writes === 2) throw new Error("storage failed"); original(req, state); };
  await runManualWorker("/root", store, "a", id, {
    schedule: () => () => {},
    launch: async (_root, _args, _env, onLine, control) => {
      control({ generation: "owned", stop: async () => { stops++; return "accepted"; } });
      assert.doesNotThrow(() => onLine("[bot] recording until 11:00")); await flush();
    },
  });
  assert.equal(stops, 1); assert.equal(store.summary("a", id)!.state, "failed");
}));
test("private publication is attempted only with ready actual handle and disposed after recorder exit", async () => fixture(async (store, id) => {
  let finish!: () => void, line!: (line: string) => void, publications = 0, revocations = 0;
  const running = runManualWorker("/root", store, "a", id, {
    schedule: () => () => {},
    publishPrivate: async (owner, control) => {
      publications++; assert.deepEqual(owner, { tenantId: "a", sessionId: id }); assert.equal(control.generation, "owned");
      return async () => { revocations++; };
    },
    launch: async (_root, _args, _env, onLine, onControl) => {
      line = onLine; onControl({ generation: "owned", stop: async () => "accepted" });
      await new Promise<void>(resolve => { finish = resolve; });
    },
  });
  assert.equal(publications, 0); line("[bot] recording until 11:00"); await flush();
  assert.equal(publications, 1); assert.equal(revocations, 0);
  line("[bot] recording until 11:00"); await flush(); assert.equal(publications, 1);
  finish(); await running; assert.equal(revocations, 1);
  assert.ok(!JSON.stringify(store.list("a")).includes("owned"));
}));
test("late private publication after recorder exit is awaited and revoked before terminal evidence", async () => fixture(async (store, id) => {
  let finish!: () => void, publish!: (dispose: () => Promise<void>) => void, revoked = false;
  const running = runManualWorker("/root", store, "a", id, {
    schedule: () => () => {},
    publishPrivate: () => new Promise(resolve => { publish = resolve; }),
    launch: async (_root, _args, _env, onLine, onControl) => {
      onControl({ generation: "owned", stop: async () => "accepted" }); onLine("[bot] recording until 11:00");
      await new Promise<void>(resolve => { finish = resolve; });
    },
  });
  finish(); await flush(); assert.equal(store.summary("a", id)!.state, "running");
  publish(async () => { revoked = true; }); await running;
  assert.equal(revoked, true); assert.equal(store.summary("a", id)!.state, "completed");
}));
test("configured private capability failure requests only owned stop and never claims descriptor readiness", async () => fixture(async (store, id) => {
  let stops = 0;
  await runManualWorker("/root", store, "a", id, {
    schedule: () => () => {}, publishPrivate: async () => { throw new Error("private capability not verified"); },
    launch: async (_root, _args, _env, onLine, onControl) => {
      onControl({ generation: "owned", stop: async () => { stops++; return "accepted"; } });
      onLine("[bot] recording until 11:00"); await flush();
    },
  });
  assert.equal(stops, 1); assert.equal(store.summary("a", id)!.state, "failed");
}));
test("acknowledged operator cancellation remains cancelled if actual exit invalidates pending private publication", async () => fixture(async (store, id) => {
  let tick!: () => void, finish!: () => void, rejectPublication!: (error: Error) => void;
  const running = runManualWorker("/root", store, "a", id, {
    schedule: fn => { tick = fn; return () => {}; },
    publishPrivate: () => new Promise((_resolve, reject) => { rejectPublication = reject; }),
    launch: async (_root, _args, _env, onLine, onControl) => {
      onControl({ generation: "owned", stop: async () => "accepted" }); onLine("[bot] recording until 11:00");
      await new Promise<void>(resolve => { finish = resolve; });
    },
  });
  await flush(); store.cancel("a", id); tick(); await flush();
  assert.equal(store.summary("a", id)!.state, "cancel-acknowledged");
  finish(); rejectPublication(new Error("recorder exited during publication")); await running;
  assert.equal(store.summary("a", id)!.state, "cancelled");
}));
