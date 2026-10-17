/** Synthetic bytes, genuine current capture producer/receipt store; no encoding/provider claims. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { register } from "tsx/esm/api";
register();
const { createRecordConsent } = await import("../../../packages/meeting-bot/src/capture/record-consent/context.ts");
const { writeRecordConsent, readRecordConsent } = await import("../../../packages/meeting-bot/src/capture/record-consent/receipt-store.ts");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export function createPrivateRecordingFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "t048-private-proof-"));
  const owner = { tenantId: "owned", sessionId: "capture", meetingUrl: "https://example.invalid/fixture" };
  const recordDir = path.join(root, "capture-slot"); mkdirSync(recordDir);
  const receipt = createRecordConsent([], owner, { LKB_CAPTURE_RECORDED_BY: "fixture", LKB_CAPTURE_APPROVED_BY: "fixture",
    LKB_CAPTURE_APPROVAL_REF: "fixture", LKB_CAPTURE_CONTROL_GENERATION: randomUUID() }, new Date(1000));
  if (!receipt.generation) throw new Error("Actual capture producer omitted generation");
  receipt.mediaStartedAt = 1000; receipt.privateWindows = [{ tStart: 300, tEnd: 600 }];
  writeRecordConsent(recordDir, receipt);
  const current = readRecordConsent(recordDir, { ...owner, meetingHash: receipt.meetingHash });
  const audioPath = path.join(root, "public.m4a"), videoPath = path.join(root, "public.mp4"), original = path.join(root, "original.mp4");
  writeFileSync(audioPath, "public audio dummy"); writeFileSync(videoPath, "public video dummy"); writeFileSync(original, "raw private dummy");
  const source = { _id: "capture-source", tenantId: owner.tenantId, kind: "recording", captureMode: "silent", title: "Synthetic capture", createdAt: "2026-10-14T00:00:00.000Z",
    path: "public.mp4", audioPath: "public.m4a", captureConsent: { recordDir: "capture-slot", sessionId: owner.sessionId,
      meetingHash: current.meetingHash, generation: current.generation, receiptSha256: hash(JSON.stringify(current)),
      publicVideoSha256: hash(readFileSync(videoPath)), sanitizedAudioSha256: hash(readFileSync(audioPath)), originalAudioPath: "original.mp4" } };
  const dir = path.join(root, "data", "toc-migrated", owner.sessionId); mkdirSync(dir, { recursive: true });
  const sourcePath = path.join(dir, "source.json"); writeFileSync(sourcePath, JSON.stringify(source));
  const sealedInput = { version: 1, tenantId: owner.tenantId, sessionId: owner.sessionId, audioPath,
    sha256: source.captureConsent.sanitizedAudioSha256, receiptSha256: source.captureConsent.receiptSha256,
    sourceSha256: hash(readFileSync(sourcePath)), generation: current.generation };
  return { root, dir, owner, receipt: current, recordDir, audioPath, videoPath, original, source, sourcePath, sealedInput,
    options: { root, sessionId: owner.sessionId, source, audioPath, durationSeconds: 900, sealedInput },
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
