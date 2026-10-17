/** Broker-only genuine fixture. Child arguments choose trusted test paths, never capability JSON. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNativeSpoolReceiver } from "./native-spool.js";
import { finalizeNativeMedia } from "./native-media-finalize.js";
import { openNativeArchiveStore } from "./native-capture-archive.js";
import { createNativeArchiveRecoverer } from "./native-archive-recovery.js";
import { prepareNativeProviderAudio, requireNativeProviderAudio } from "../record-consent/native-provider-audio.js";
import { createRecordConsent } from "../record-consent/context.js";
import { writeRecordConsent, readRecordConsent } from "../record-consent/receipt-store.js";
import type { NativeArchiveBinding } from "./native-archive-authority.js";
import type { NativeCaptureIdentity, ClosedNativeSpool } from "./native-media-types.js";
import { createPrivateDirectory } from "../record-consent/private-directory.js";
import { createNativeCaptureSealer } from "./native-archive-capture.js";
import { runRecord } from "../record-commands.js";
import { createTelegramNotifier } from "../notify/telegram-alerts.js";
import type { createTabBrowserDeps } from "../tab-browser.js";
import { fingerprintNativeFile } from "./native-media-probe.js";

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export async function sealArchiveFixture(directory: string, root: string, ffmpegPath: string, ffprobePath: string, copies = 1) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const receipt = createRecordConsent([], { tenantId: "synthetic", sessionId: "synthetic", meetingUrl: "https://meet.google.com/abc-defg-hij" }, {
    LKB_CAPTURE_APPROVED_BY: "fixture", LKB_CAPTURE_APPROVAL_REF: "software-only", LKB_CAPTURE_RECORDED_BY: "fixture",
    LKB_CAPTURE_ORGANIZER_CONSENT: "given", LKB_CAPTURE_CONTROL_GENERATION: randomUUID(),
  });
  writeRecordConsent(directory, receipt);
  const identity: NativeCaptureIdentity = { schema: "native-tab-clock/1", tenantId: receipt.tenantId, sessionId: receipt.sessionId,
    captureGeneration: receipt.generation!, captureInstanceId: "fixture-capture", samplerInstanceId: "fixture-sampler",
    platform: "synthetic", browserBuild: "synthetic", extensionAssetSha256: "a".repeat(64), clockInstanceId: "fixture-clock" };
  const ivf = path.join(directory, "fixture.ivf");
  const encoded = spawnSync(ffmpegPath, ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "testsrc2=size=32x32:rate=5:duration=0.4", "-frames:v", "2", "-c:v", "libvpx", "-threads", "1", "-f", "ivf", ivf],
  { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (encoded.error || encoded.status !== 0) throw new Error(`Fixture encode failed: ${encoded.stderr}`);
  const bytes = readFileSync(ivf), chunks: Buffer[] = [];
  for (let offset = 32; offset < bytes.length;) {
    const size = bytes.readUInt32LE(offset); chunks.push(bytes.subarray(offset + 12, offset + 12 + size)); offset += size + 12;
  }
  const receiver = await createNativeSpoolReceiver({ directory: path.join(directory, "spool"), identity, width: 32, height: 32,
    sampleRate: 48000, maxBytes: 1000000, maxChunkBytes: 100000, maxPendingBytes: 200000 });
  for (const [sequence, chunk] of chunks.entries()) {
    const timestampUs = 7000000 + sequence * 200000;
    const observation = { frameId: `frame-${sequence}`, sourceTimestampUs: null, timestampUs, copyBeforeUs: timestampUs - 1, copyAfterUs: timestampUs + 1 };
    await receiver.observeVideo(observation);
    await receiver.appendVideo({ sequence, identity, observation: { ...observation, encodedType: chunk[0]! & 1 ? "delta" : "key", encodedByteLength: chunk.length }, bytes: chunk });
  }
  const pcm = Buffer.alloc(19200 * 2); pcm.writeInt16LE(20000, 731 * 2); pcm.writeInt16LE(-18000, 10000 * 2);
  await receiver.appendAudio({ sequence: chunks.length, identity, observation: { blockId: "a0", startFrame: 3552, frameCount: 19200,
    sampleRate: 48000, channels: 1, format: "s16le", byteLength: pcm.length }, bytes: pcm });
  const media = await finalizeNativeMedia(await receiver.close(), { ffmpegPath, ffprobePath, maxTotalBytes: 2000000, maxMuxBytes: 1000000, playbackAudioOffsetUs: 73000 });
  const providerAudio = await prepareNativeProviderAudio({ media, recordDir: directory, owner: receipt, maxTotalBytes: 3000000 });
  const sourcePath = path.join(directory, "source.json"), sidecarPath = path.join(directory, "sampler.json");
  writeFileSync(sourcePath, JSON.stringify({ fixture: "software-only", sessionId: receipt.sessionId }), { mode: 0o600 });
  writeFileSync(sidecarPath, JSON.stringify({ identity, fixture: "software-only" }), { mode: 0o600 });
  const binding: NativeArchiveBinding = { tenantId: receipt.tenantId, sessionId: receipt.sessionId, sourceId: "fixture-source",
    captureGeneration: receipt.generation!, receiptSha256: hash(JSON.stringify(receipt)), sourceSha256: hash(readFileSync(sourcePath)), sidecarSha256: hash(readFileSync(sidecarPath)) };
  const store = await openNativeArchiveStore({ root, maxArchiveBytes: 3000000, readCurrentBinding: async () => binding });
  const sealInput = { media, providerAudio, binding, sourcePath, sidecarPath,
    consentPath: path.join(directory, "record-consent", receipt.tenantId, `${receipt.sessionId}.json`), remainingReservationBytes: 3000000 };
  const ids: string[] = [];
  for (let i = 0; i < copies; i++) ids.push(await store.seal(sealInput));
  return { ids, binding, sha256: providerAudio.sha256, sampleCount: providerAudio.sampleCount,
    firstSourceSampleIndex: providerAudio.firstSourceSampleIndex, pid: process.pid, sealInput, store };
}

async function sealRunRecordFixture(directory: string, root: string, ffmpegPath: string, ffprobePath: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const recordDir = createPrivateDirectory(path.join(directory, "recordings"));
  const sidecarPath = path.join(recordDir, "synthetic-entry.tiles.jsonl");
  const sourcePath = path.join(directory, "data", "toc-migrated", "synthetic-entry", "source.json");
  Object.assign(process.env, { LKB_NATIVE_MAX_TOTAL_BYTES: "10000000", LKB_NATIVE_MAX_SPOOL_BYTES: "1000000",
    LKB_NATIVE_MAX_MUX_BYTES: "2000000", LKB_NATIVE_FINALIZE_TIMEOUT_MS: "120000",
    LKB_NATIVE_FFMPEG: ffmpegPath, LKB_NATIVE_FFPROBE: ffprobePath, LKB_BROWSER_EXECUTABLE: process.env.LKB_NATIVE_TEST_BROWSER,
    LKB_CAPTURE_APPROVED_BY: "fixture", LKB_CAPTURE_APPROVAL_REF: "software-only", LKB_CAPTURE_RECORDED_BY: "fixture",
    LKB_CAPTURE_ORGANIZER_CONSENT: "given" });
  delete process.env.LKB_CAPTURE_CONTROL_TOKEN; delete process.env.LKB_CAPTURE_CONTROL_GENERATION;
  const store = await openNativeArchiveStore({ root, maxArchiveBytes: 3000000, readCurrentBinding: async owner => {
    const receipt = readRecordConsent(recordDir, owner);
    return { ...owner, captureGeneration: receipt.generation!, receiptSha256: hash(JSON.stringify(receipt)),
      sourceSha256: fingerprintNativeFile(sourcePath).sha256, sidecarSha256: fingerprintNativeFile(sidecarPath).sha256 };
  } });
  const sealer = createNativeCaptureSealer({ store, readCurrentReceipt: (_dir, owner) => readRecordConsent(recordDir, owner) });
  const ivf = path.join(recordDir, "fixture.ivf");
  const encoded = spawnSync(ffmpegPath, ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "testsrc2=size=32x32:rate=5:duration=0.4", "-frames:v", "2", "-c:v", "libvpx", "-threads", "1", "-f", "ivf", ivf],
  { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (encoded.error || encoded.status !== 0) throw new Error(`RunRecord fixture encode failed: ${encoded.stderr}`);
  const bytes = readFileSync(ivf), chunks: Buffer[] = [];
  for (let offset = 32; offset < bytes.length;) { const size = bytes.readUInt32LE(offset); chunks.push(bytes.subarray(offset + 12, offset + 12 + size)); offset += size + 12; }
  let finishBrowser!: () => void;
  const browserExited = new Promise<void>(resolve => { finishBrowser = resolve; });
  const state: { sealed?: { ids: string[]; binding: NativeArchiveBinding; sha256: string; sampleCount: number; firstSourceSampleIndex: number; pid: number } } = {};
  await runRecord(["https://meet.google.com/abc-defg-hij", "--until", new Date(Date.now() + 60000).toISOString(),
    "--session-id", "synthetic-entry", "--tenant", "synthetic-owner", "--native-tab-clock", "--transcribe"], {
    recordDir, profileDir: path.join(directory, "profile"), telegram: createTelegramNotifier({ token: "", chatId: "" }),
    wait: async () => { finishBrowser(); await Promise.resolve(); }, nativeSamplerPath: sidecarPath,
    nativeFinalizerOverrides: { repoRoot: directory, measureVolume: () => ({ maxDb: -10, meanDb: -20 }),
      runTranscription: (_id, input) => {
        if (!input.audioPath.endsWith("selected-provider.wav")) throw new Error("RunRecord used wrong WAV");
        writeFileSync(path.join(path.dirname(sourcePath), "turns.json"), JSON.stringify([{ speakerRef: "fixture", tStart: 0, tEnd: 0.2, text: "synthetic" }]));
      }, validateTranscription: () => {} },
    nativeArchive: { sealCapture: async input => {
      const result = await sealer.sealCapture(input);
      state.sealed = { ids: [result.archiveId], binding: result.binding, sha256: input.providerAudio.sha256,
        sampleCount: input.providerAudio.sampleCount, firstSourceSampleIndex: input.providerAudio.firstSourceSampleIndex, pid: process.pid };
      return result;
    } }, normalize: () => { throw new Error("RunRecord used legacy remux"); },
    tab: (onEvent, config) => {
      if (!config.native) throw new Error("Native runRecord config missing");
      const native = config.native, identity = native.identity, output = path.join(recordDir, "owned.webm");
      writeFileSync(sidecarPath, [{ kind: "meta", source: "meet-dom", samplerClock: { version: 1, captureGeneration: identity.captureGeneration, samplerInstance: identity.samplerInstanceId } },
        { source: "meet-dom", tSec: 0, displayName: null, samplerClock: { monotonicSec: 1 } }].map(row => JSON.stringify(row)).join("\n") + "\n");
      let spool: ClosedNativeSpool;
      return { deps: { launch: async () => {
        const receiver = await createNativeSpoolReceiver({ directory: `${output}.native`, identity, width: 32, height: 32,
          sampleRate: 48000, maxBytes: 1000000, maxChunkBytes: 100000, maxPendingBytes: 200000 });
        for (const [sequence, chunk] of chunks.entries()) {
          const timestampUs = 7000000 + sequence * 200000;
          const observation = { frameId: `frame-${sequence}`, sourceTimestampUs: null, timestampUs, copyBeforeUs: timestampUs - 1, copyAfterUs: timestampUs + 1 };
          await receiver.observeVideo(observation);
          await receiver.appendVideo({ sequence, identity, observation: { ...observation, encodedType: chunk[0]! & 1 ? "delta" : "key", encodedByteLength: chunk.length }, bytes: chunk });
        }
        const pcm = Buffer.alloc(38400); pcm.writeInt16LE(20000, 1462);
        await receiver.appendAudio({ sequence: 2, identity, observation: { blockId: "a0", startFrame: 3552, frameCount: 19200,
          sampleRate: 48000, channels: 1, format: "s16le", byteLength: pcm.length }, bytes: pcm });
        await receiver.appendClockPair({ sequence: 3, identity, kind: "audio", pair: { clockInstanceId: identity.clockInstanceId,
          beforePerformanceUs: 7072000, contextTime: 0.074, performanceTime: 7073, afterPerformanceUs: 7074000, state: "running", sampleRate: 48000 } });
        spool = await receiver.close();
        onEvent("fixture", { event: "capture-started", t: Date.now() / 1000 }); onEvent("fixture", { event: "admitted", t: Date.now() / 1000 });
        return { sessionHandle: "fixture", mediaStream: null };
      }, stop: async () => { await native.onClosed(spool, output); } }, browserExited: () => browserExited, outputPath: () => output,
      subscribeLevel: () => () => {}, triggerReload: () => {}, disconnect: async () => {}, persistControlGap: () => {} } as unknown as ReturnType<typeof createTabBrowserDeps>;
    },
  });
  if (!state.sealed) throw new Error("Actual runRecord failed to seal");
  return state.sealed;
}

async function main() {
  const [mode, directory, root, ffmpegPath, ffprobePath, archiveId, tenantId, sessionId, sourceId] = process.argv.slice(2);
  if (!mode || !directory || !root || !ffmpegPath || !ffprobePath) throw new Error("Fixture child arguments required");
  if (mode === "seal") {
    const fixture = await sealRunRecordFixture(directory, root, ffmpegPath, ffprobePath);
    const { ids, binding, sha256, sampleCount, firstSourceSampleIndex, pid } = fixture;
    console.log(JSON.stringify({ ids, binding, sha256, sampleCount, firstSourceSampleIndex, pid }));
    return;
  }
  if (mode !== "reopen" || !archiveId || !tenantId || !sessionId || !sourceId ||
    ![tenantId, sessionId, sourceId].every(value => /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(value)) || sourceId !== `${sessionId}-src`) {
    throw new Error("Fixture reopen owner arguments required");
  }
  // Live original receipt/source/sampler readback, independent of archive JSON and parent output.
  const recordDir = path.join(directory, "recordings"), owner = { tenantId, sessionId, sourceId };
  const readCurrentBinding = async (requested: typeof owner): Promise<NativeArchiveBinding | null> => {
    if (requested.tenantId !== tenantId || requested.sessionId !== sessionId || requested.sourceId !== sourceId) return null;
    const receipt = readRecordConsent(recordDir, owner);
    const sourcePath = path.join(directory, "data", "toc-migrated", sessionId, "source.json");
    const sidecarPath = path.join(recordDir, `${sessionId}.tiles.jsonl`);
    const source = JSON.parse(readFileSync(sourcePath, "utf8"));
    const sampler = JSON.parse(readFileSync(sidecarPath, "utf8").split(/\r?\n/)[0]!);
    const receiptSha256 = hash(JSON.stringify(receipt));
    if (source._id !== sourceId || source.tenantId !== tenantId || source.captureConsent?.generation !== receipt.generation ||
      source.captureConsent?.receiptSha256 !== receiptSha256 || sampler.samplerClock?.captureGeneration !== receipt.generation) return null;
    return { ...owner, captureGeneration: receipt.generation!, receiptSha256,
      sourceSha256: fingerprintNativeFile(sourcePath).sha256, sidecarSha256: fingerprintNativeFile(sidecarPath).sha256 };
  };
  const binding = await readCurrentBinding(owner);
  if (!binding) throw new Error("Fixture current binding unavailable");
  const store = await openNativeArchiveStore({ root, maxArchiveBytes: 3000000, readCurrentBinding });
  const result = await createNativeArchiveRecoverer({ store, decoder: { ffmpegPath, ffprobePath } }).recoverCapture({ archiveId, expected: binding });
  if (result.status !== "ready") throw new Error(`Fixture recovery refused: ${result.reason}`);
  const receipt = readRecordConsent(recordDir, owner);
  const accepted = await requireNativeProviderAudio(result.providerAudio, { receipt,
    owner: { tenantId: binding.tenantId, sessionId: binding.sessionId }, duration: result.providerAudio.durationSec,
    audioPath: result.providerAudio.audioPath, originalAudioPath: result.providerAudio.originalAudioPath });
  // Fake provider boundary consumes the verified retained WAV without invoking a paid service.
  if (hash(readFileSync(accepted.audioPath)) !== accepted.audioSha256) throw new Error("Fixture provider consumed wrong WAV");
  console.log(JSON.stringify({ pid: process.pid, sha256: accepted.audioSha256, sampleCount: accepted.sampleCount,
    firstSourceSampleIndex: result.providerAudio.firstSourceSampleIndex, canonicalClock: accepted.canonicalClock ?? null }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
