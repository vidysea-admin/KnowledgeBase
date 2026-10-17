/** Synthetic private filesystem fixture. No native calibration, provider or actual recording. */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import type { Turns } from "../../../packages/core/src/generated/turns.js";
import { writeRecordConsent } from "../../../packages/meeting-bot/src/capture/record-consent/receipt-store.js";
import { validateRecordConsent } from "../../../packages/meeting-bot/src/capture/record-consent/context.js";
import { recordGuardedPrivacyMaskIntervals } from "../../../packages/meeting-bot/src/capture/record-consent/coverage.js";
import { createTileCaptureRegistryForTest, type TileCommittedCapture, type TileDecodedClockMeasurement, type TileRegistryOptions } from "../../../packages/meeting-bot/src/capture/tiles/registry.js";

export const syntheticRegistryHash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export const SYNTHETIC_PANEL = ["Priya Nair", "Rahul Verma", "Asha Rao", "Kiran Shah"];
export function makeTileRegistryFixture(privateWindows: { tStart: number; tEnd: number }[] = [], trimStart = 0) {
  const tempBase = path.resolve(tmpdir());
  const root = mkdtempSync(path.join(tempBase, "t042-registry-"));
  const tenant = "tenant-A", session = "synthetic-panel", captureGeneration = "11111111-1111-4111-8111-111111111111";
  const indexGeneration = "22222222-2222-4222-8222-222222222222", duration = 340;
  const recordDir = path.join(root, "captures"), leaf = path.join(root, "artifacts");
  mkdirSync(recordDir, { mode: 0o700 }); mkdirSync(leaf, { mode: 0o700 });
  const receipt = validateRecordConsent({ version: 1, tenantId: tenant, sessionId: session, generation: captureGeneration,
    meetingHash: "a".repeat(64), captureMode: "silent", organizerConsent: "unknown",
    operationalApproval: { approvedBy: "SYNTHETIC_ONLY", reference: "synthetic-test", appliedAt: "1970-01-01T00:00:00.000Z" },
    consent: { given: false, recordedBy: "SYNTHETIC_ONLY", confirmedNoAlternative: true }, privateWindows, mediaStartedAt: 1000_000 },
    { tenantId: tenant, sessionId: session });
  writeRecordConsent(recordDir, receipt);
  const audio = Buffer.from("SYNTHETIC_AUDIO_BYTES"), video = Buffer.from("SYNTHETIC_MASKED_VIDEO_BYTES");
  const samplerWitness = (t: number) => ({ epochBeforeSec: 1020 + trimStart + t,
    epochAfterSec: 1020 + trimStart + t, monotonicSec: 100 + t });
  const rows: unknown[] = [{ kind: "meta", startedAtEpoch: 1020 + trimStart, source: "meet-dom",
    samplerClock: { version: 1, captureGeneration, hostId: "synthetic-host", samplerInstance: "synthetic-sampler", ...samplerWitness(0) } }];
  for (let t = 0; t < 320; t += 2) {
    const name = privateWindows.some(w => t + 20 + trimStart >= w.tStart && t + 20 + trimStart < w.tEnd)
      ? "Private Voice" : SYNTHETIC_PANEL[Math.floor(t / 40) % 4]!;
    rows.push({ tSec: t, displayName: name, source: "meet-dom", samplerClock: samplerWitness(t) });
  }
  let sidecar = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
  const source = { _id: "source-A", tenantId: tenant, kind: "recording", platform: "meet", hash: syntheticRegistryHash(audio),
    captureConsent: { sessionId: session, generation: captureGeneration, meetingHash: receipt.meetingHash,
      receiptSha256: syntheticRegistryHash(JSON.stringify(receipt)), publicVideoSha256: syntheticRegistryHash(video), sanitizedAudioSha256: syntheticRegistryHash(audio) },
    guardedPrivateWindows: { audio: recordGuardedPrivacyMaskIntervals(receipt, receipt, duration + trimStart, "audio"),
      video: recordGuardedPrivacyMaskIntervals(receipt, receipt, duration + trimStart, "video") } };
  const sourceText = JSON.stringify(source);
  const binding: TileCommittedCapture = { evidenceKind: "synthetic", tenantId: tenant, sessionId: session,
    indexBinding: { version: 1, generation: indexGeneration, sessionId: session, sourceId: source._id, turnDigest: "d".repeat(64) },
    captureGeneration, hostId: "synthetic-host", samplerInstance: "synthetic-sampler", platform: "meet", durationSec: duration,
    audioPath: "artifacts/audio.bin", publicVideoPath: "artifacts/video.bin", sourcePath: "artifacts/source.json",
    sidecarPath: "artifacts/tiles.jsonl", clockPath: "artifacts/clock.json",
    audioSha256: syntheticRegistryHash(audio), publicVideoSha256: syntheticRegistryHash(video), sourceSha256: syntheticRegistryHash(sourceText),
    sidecarSha256: syntheticRegistryHash(sidecar), receiptSha256: source.captureConsent.receiptSha256, clockSha256: "" };
  let clockFacts: Omit<TileDecodedClockMeasurement, "measurementSha256"> = { evidenceKind: "synthetic", method: "decoded-first-sample",
    captureGeneration, hostId: binding.hostId, samplerInstance: binding.samplerInstance,
    audioSha256: binding.audioSha256, publicVideoSha256: binding.publicVideoSha256, sourceSha256: binding.sourceSha256,
    sidecarSha256: binding.sidecarSha256, receiptSha256: binding.receiptSha256,
    mediaZeroEpochSec: { earliest: 1000 + trimStart, latest: 1000 + trimStart },
    samplerZeroEpochSec: { earliest: 1020 + trimStart, latest: 1020 + trimStart },
    driftBoundSec: 0, highlightLagBoundSec: 0, originalDurationSec: duration + trimStart, trimStartSec: trimStart,
    durationSec: duration, monotonicMappingSha256: "e".repeat(64) };
  const put = (relative: string, data: string | Buffer) => writeFileSync(path.join(root, relative), data, { mode: 0o600 });
  const saveClock = () => { const text = JSON.stringify(clockFacts); put(binding.clockPath, text); binding.clockSha256 = syntheticRegistryHash(text); };
  put(binding.audioPath, audio); put(binding.publicVideoPath, video); put(binding.sourcePath, sourceText); put(binding.sidecarPath, sidecar); saveClock();
  let committed = true, measured = true;
  const options: TileRegistryOptions = { workspaceRoot: root, recordDir, clockBudget: { uncertaintySec: 0.25, driftSec: 0.25 },
    readCommitted: async () => committed ? structuredClone(binding) : null,
    measureDecodedClock: async a => {
      if (!measured) return null;
      const bytes = readFileSync(a.physical.clock);
      const syntheticFacts = JSON.parse(bytes.toString("utf8")) as Omit<TileDecodedClockMeasurement, "measurementSha256">;
      return { ...syntheticFacts, measurementSha256: syntheticRegistryHash(bytes) };
    } };
  const turns: Turns[] = Array.from({ length: 8 }, (_, i) => ({ _id: `t${i}`, tenantId: tenant, sessionId: session, speakerRef: `spk:${i % 4}`,
    tStart: 20 + i * 40, tEnd: 60 + i * 40, text: "The application process takes several weeks." }));
  return { root, recordDir, tenant, session, receipt, binding, options, turns,
    registry: () => createTileCaptureRegistryForTest(options), setCommitted: (v: boolean) => { committed = v; },
    setMeasured: (v: boolean) => { measured = v; },
    clock: (change: Partial<typeof clockFacts>) => { clockFacts = { ...clockFacts, ...change }; saveClock(); },
    sidecar: (text: string) => { sidecar = text; put(binding.sidecarPath, text); binding.sidecarSha256 = syntheticRegistryHash(text); clockFacts.sidecarSha256 = binding.sidecarSha256; saveClock(); },
    cleanup: () => {
      const target = path.resolve(root), relative = path.relative(tempBase, target);
      assert.ok(!path.isAbsolute(relative) && /^t042-registry-[A-Za-z0-9]+$/u.test(relative));
      rmSync(target, { recursive: true, force: true });
    } };
}
