import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { configuredNativeArchiveService, prepareNativeStartup, startNativeServer } from "./server.js";
import type { NativeArchiveServerService } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";

test("unconfigured ordinary sync path does not open archive or require database", async () => {
  assert.equal(await configuredNativeArchiveService({}, null as never), undefined);
});

test("native configuration refuses unbounded quota and missing configured decoder", async () => {
  await assert.rejects(configuredNativeArchiveService({ LKB_NATIVE_ARCHIVE_ROOT: "C:/private" }, null as never), /quota/);
  await assert.rejects(configuredNativeArchiveService({ LKB_NATIVE_ARCHIVE_ROOT: "C:/private", LKB_NATIVE_ARCHIVE_MAX_BYTES: "1024" }, null as never), /decoder/);
});

test("startup performs exactly one bounded drain and preserves explicit resume cursor", async () => {
  const calls: unknown[] = [];
  const service = { async drain(input: unknown) { calls.push(input); return { cursor: "next", pending: 5 }; } } as NativeArchiveServerService;
  assert.deepEqual(await prepareNativeStartup(service, { limit: 2, cursor: "previous" }), { cursor: "next", pending: 5 });
  assert.deepEqual(calls, [{ limit: 2, cursor: "previous" }]);
});

test("actual bootstrap connects then drains before constructing listening server", async () => {
  const calls: string[] = [], db = {} as never;
  const service = { async drain() { calls.push("drain"); return { pending: 0 }; },
    async onIndexCommitted() { calls.push("committed"); } } as unknown as NativeArchiveServerService;
  const server = createServer();
  const result = await startNativeServer({ MONGODB_DB: "lkb_native_launcher" }, {
    async connect() { calls.push("connect"); return db; }, getDb: () => db,
    async service() { calls.push("service"); return service; },
    buildDeps(options) { calls.push("build"); assert.equal(typeof options?.onIndexCommitted, "function"); return {} as never; },
    startServer() { calls.push("listen"); return server; },
  });
  assert.equal(result, server);
  assert.deepEqual(calls, ["connect", "service", "drain", "build", "listen"]);
});

test("failed bounded drain never reaches server readiness", async () => {
  let listens = 0;
  await assert.rejects(startNativeServer({ MONGODB_DB: "lkb_native_launcher" }, {
    async connect() { return {} as never; }, getDb: () => ({} as never),
    async service() { return { async drain() { throw new Error("archive unavailable"); } } as unknown as NativeArchiveServerService; },
    startServer() { listens++; return createServer(); },
  }), /archive unavailable/);
  assert.equal(listens, 0);
});
