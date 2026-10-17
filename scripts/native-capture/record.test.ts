import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { nativeRecordInvocation, runNativeCapture } from "./record.js";
import type { NativeArchiveServerService } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";

const args = ["https://meet.google.com/test", "--session-id", "s1", "--native-tab-clock"];
test("explicit capture binds actual sampler and refuses mismatch before effects", () => {
  const root = path.resolve("test-workspace"), recordDir = path.join(root, "raw/webinars");
  assert.deepEqual(nativeRecordInvocation(args, {}, root), { recordDir, nativeSamplerPath: path.join(recordDir, "s1.tiles.jsonl") });
  assert.throws(() => nativeRecordInvocation(["--native-tab-clock"], {}, root), /session ID/);
  assert.throws(() => nativeRecordInvocation(args, { LKB_TILE_CAPTURE_FILE: "foreign.jsonl" }, root), /mismatch/);
});

test("real runRecord injection surface receives trusted service and matching producer sampler", async () => {
  const service = {} as NativeArchiveServerService;
  const previous = process.env.LKB_TILE_CAPTURE_FILE;
  let calls = 0;
  await runNativeCapture(args, {}, service, async (rest, inject) => {
    calls++;
    assert.deepEqual(rest, args);
    assert.equal(inject?.nativeArchive, service);
    assert.equal(inject?.nativeSamplerPath, process.env.LKB_TILE_CAPTURE_FILE);
  });
  assert.equal(calls, 1);
  assert.equal(process.env.LKB_TILE_CAPTURE_FILE, previous);
});
