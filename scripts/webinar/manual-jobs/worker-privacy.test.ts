/** Cross-process owned worker -> real private helper -> restarted API connector -> durable child receipt. No browser/provider. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ManualJobStore } from "../../../packages/meeting-bot/src/manual-jobs/store.js";
import { runManualWorker } from "../../../packages/meeting-bot/src/manual-jobs/worker.js";
import { createRecordingPrivacyControl } from "../../../packages/meeting-bot/src/capture/record-consent/controller-client.js";
import { publishCapturePrivacyController } from "../../../packages/meeting-bot/src/capture/record-consent/controller-bridge.js";
import { readRecordConsent } from "../../../packages/meeting-bot/src/capture/record-consent/receipt-store.js";
import { createHostBotPrivacyDeps } from "../../../apps/api/src/bot-privacy/host-connector.js";

test("detached-owner worker publishes actual sealed privacy capability, restarted API ACKs receipt, actual exit revokes descriptor", { timeout: 60_000 }, async () => {
  const protectedRoot = process.env.LKB_PRIVATE_ACL_PROBE_DIR;
  if (protectedRoot) assert.ok(path.isAbsolute(protectedRoot) && !/^[/\\]{2}/.test(protectedRoot), "Fixture protected root must be an explicit local absolute directory");
  const root = mkdtempSync(path.join(protectedRoot ?? os.tmpdir(), "t039-private-worker-")), directory = path.join(root, "private"), recordDir = path.join(root, "receipt");
  // Broker may supply a newly protected test-only parent; ordinary temp ACLs still face the real native gate.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const now = () => new Date("2026-10-14T10:00:00.000Z"), store = new ManualJobStore(path.join(root, "jobs"), now);
  const req = store.create("a", { meetingUrl: "https://meet.google.com/abc-defg-hij", meetingKey: "meet:abc-defg-hij", platform: "meet" }, "2026-10-14T11:00:00.000Z");
  const generation = randomUUID(), token = randomBytes(32).toString("hex");
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../../packages/meeting-bot/src/capture/record-consent/controller-worker.fixture.ts", import.meta.url))], {
    windowsHide: true, shell: false, stdio: ["ignore", "ignore", "pipe", "ipc"], env: { ...process.env, T011_FIXTURE_DIR: recordDir,
      T011_FIXTURE_TENANT: "a", T011_FIXTURE_SESSION: req.jobId, T011_FIXTURE_FAIL_WRITE: "0", T011_FIXTURE_NO_MEDIA_CLOCK: "0",
      LKB_CAPTURE_CONTROL_TOKEN: token, LKB_CAPTURE_CONTROL_GENERATION: generation },
  });
  let stderr = ""; child.stderr?.on("data", value => { stderr += value.toString(); });
  const closed = once(child, "close"), privateControl = createRecordingPrivacyControl(child, { tenantId: "a", sessionId: req.jobId, generation, token });
  let ready!: () => void, failReady!: (error: unknown) => void;
  const published = new Promise<void>((resolve, reject) => { ready = resolve; failReady = reject; });
  const worker = runManualWorker(root, store, "a", req.jobId, {
    schedule: () => () => {},
    publishPrivate: async (owner, control) => {
      try {
        assert.deepEqual(owner, { tenantId: "a", sessionId: req.jobId }); assert.equal(control.generation, generation);
        const dispose = await publishCapturePrivacyController({ directory, ...owner, control: { generation, ...privateControl } });
        ready(); return dispose;
      } catch (error) { failReady(error); throw error; }
    },
    launch: async (_root, _args, _env, onLine, onControl) => {
      onControl({ generation, ...privateControl, stop: async () => { if (child.connected) child.disconnect(); return "accepted"; } });
      onLine("[bot] recording until fixture"); await closed;
    },
  });
  try {
    await published;
    const restarted = createHostBotPrivacyDeps(directory);
    assert.equal((await restarted.list("a"))[0]!.generation, generation);
    assert.deepEqual(await restarted.list("foreign"), []);
    assert.equal(await restarted.set("a", req.jobId, randomUUID(), "private-start"), "unavailable");
    assert.equal(await restarted.set("a", req.jobId, generation, "private-start"), "accepted");
    const receipt = readRecordConsent(recordDir, { tenantId: "a", sessionId: req.jobId });
    assert.equal(receipt.privateWindows[0]!.tEnd, Number.MAX_SAFE_INTEGER);
    assert.equal(await createHostBotPrivacyDeps(directory).set("a", req.jobId, generation, "private-end"), "accepted");
    assert.ok(readRecordConsent(recordDir, { tenantId: "a", sessionId: req.jobId }).privateWindows[0]!.tEnd < Number.MAX_SAFE_INTEGER);
    const summary = JSON.stringify(store.list("a"));
    for (const secret of [token, generation, directory, "origin", "secret"]) assert.ok(!summary.includes(secret));
    child.disconnect(); await worker;
    assert.equal(store.summary("a", req.jobId)!.state, "completed");
    assert.deepEqual(await restarted.list("a"), []);
  } finally {
    if (child.connected) child.disconnect(); await worker; privateControl.dispose(); await closed;
    rmSync(root, { recursive: true, force: true }); assert.equal(child.exitCode, 0, stderr);
  }
});
