/** Genuine live finalizer -> retained archive. Paths and sampler JSON grant no authority. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NativeCaptureSealer, NativeSealCaptureInput } from "./native-archive-join-types.js";
import type { openNativeArchiveStore } from "./native-capture-archive.js";
import { requireNativeFinalizedMedia, type NativeFinalizedMedia } from "./native-media-finalize.js";
import { fingerprintNativeFile } from "./native-media-probe.js";
import { requireNativeProviderAudio, type NativeProviderAudio } from "../record-consent/native-provider-audio.js";
import { readRecordConsent } from "../record-consent/receipt-store.js";
import { validateRecordConsent, type RecordConsentReceipt } from "../record-consent/context.js";
import type { NativeArchiveBinding } from "./native-archive-authority.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX = 8 * 1024 ** 3;
function confined(file: string, directory: string): void {
  const relative = path.relative(directory, file);
  if (!path.isAbsolute(file) || !relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error("Native capture artifact outside trusted directory");
  }
}
/** Only supports the actual instrumented producer format; unavailable sampling is not capture failure. */
export function hasNativeSampler(file: string | undefined): file is string {
  if (!file || !existsSync(file)) return false;
  fingerprintNativeFile(file, 16 * 1024 ** 2);
  const lines = readFileSync(file, "utf8").trim().split(/\r?\n/);
  if (lines.length < 2 || lines.length > 200000 || lines.some(line => line.length > 2000)) return false;
  try {
    const rows = lines.map(line => JSON.parse(line));
    return rows[0].kind === "meta" && rows[0].source === "meet-dom" && rows[0].samplerClock?.version === 1 &&
      rows.slice(1).every(row => row.kind === undefined && row.source === "meet-dom" && row.samplerClock);
  } catch { return false; }
}
export interface NativeCaptureSealerOptions {
  store: Pick<Awaited<ReturnType<typeof openNativeArchiveStore>>, "seal">;
  readCurrentReceipt: (recordDir: string, owner: { tenantId: string; sessionId: string }) => Promise<RecordConsentReceipt> | RecordConsentReceipt;
}
export function createNativeCaptureSealer(options: NativeCaptureSealerOptions): NativeCaptureSealer {
  return { async sealCapture(input: NativeSealCaptureInput) {
    const media = await requireNativeFinalizedMedia(input.media);
    const provider = await requireNativeProviderAudio(input.providerAudio);
    const identity = media.spool.identity, owner = { tenantId: identity.tenantId, sessionId: identity.sessionId };
    if (provider.media !== media) throw new Error("Native capture provider/media mismatch");
    for (const file of [input.sidecarPath, input.consentPath, input.publicVideoPath]) confined(file, path.resolve(input.recordDir));
    const receipt = readRecordConsent(input.recordDir, owner);
    const current = validateRecordConsent(await options.readCurrentReceipt(input.recordDir, owner), owner);
    if (digest(current) !== digest(receipt) || receipt.generation !== identity.captureGeneration ||
      digest(receipt) !== input.providerAudio.receiptSha256) throw new Error("Native capture current receipt mismatch");
    const retainedReceipt = validateRecordConsent(JSON.parse(readFileSync(input.consentPath, "utf8")), owner);
    if (digest(retainedReceipt) !== digest(receipt)) throw new Error("Native capture retained receipt mismatch");
    if (!hasNativeSampler(input.sidecarPath)) throw new Error("Native sampler unavailable");
    const sampler = JSON.parse(readFileSync(input.sidecarPath, "utf8").split(/\r?\n/)[0]!);
    if (sampler.samplerClock.captureGeneration !== identity.captureGeneration || sampler.samplerClock.samplerInstance !== identity.samplerInstanceId) {
      throw new Error("Native sampler invocation mismatch");
    }
    const sourceFile = fingerprintNativeFile(input.sourcePath, 5 * 1024 ** 2);
    const source = JSON.parse(readFileSync(input.sourcePath, "utf8"));
    const video = fingerprintNativeFile(input.publicVideoPath, MAX);
    if (source._id !== input.sourceId || source.tenantId !== owner.tenantId || input.sourceId !== `${owner.sessionId}-src` ||
      source.hash !== input.providerAudio.sha256 || source.captureConsent?.generation !== identity.captureGeneration ||
      source.captureConsent?.receiptSha256 !== digest(receipt) || source.captureConsent?.publicVideoSha256 !== video.sha256 ||
      source.captureConsent?.sanitizedAudioSha256 !== input.providerAudio.sha256) throw new Error("Native source provenance mismatch");
    const binding: NativeArchiveBinding = { ...owner, sourceId: input.sourceId, captureGeneration: identity.captureGeneration,
      receiptSha256: digest(receipt), sourceSha256: sourceFile.sha256,
      sidecarSha256: fingerprintNativeFile(input.sidecarPath, 16 * 1024 ** 2).sha256 };
    if (!Number.isSafeInteger(input.remainingReservationBytes) || input.remainingReservationBytes <= 0 || input.remainingReservationBytes > MAX) {
      throw new Error("Native archive spare reservation required");
    }
    // Count every physical copy, including duplicated canonical/provider WAV, before store allocation.
    const files = [media.spool.video.path, media.spool.audio.path, media.spool.ledger.path,
      path.join(path.dirname(media.spool.video.path), "complete.json"), media.canonicalAudio.path,
      media.video.media.file.path, input.providerAudio.audioPath, input.sourcePath, input.sidecarPath, input.consentPath,
      ...(input.providerAudio.maskReceiptPath ? [input.providerAudio.maskReceiptPath] : [])];
    const required = files.reduce((total, file) => total + fingerprintNativeFile(file, MAX).byteLength, 65536);
    if (required > input.remainingReservationBytes) throw new Error("Native archive copy exceeds spare reservation");
    const archiveId = await options.store.seal({ ...input, binding });
    return { archiveId, binding };
  } };
}
/** Called only after real source/consent/privacy output exists and before index subprocess. */
export async function sealFinalizedNativeCapture(input: {
  sealer?: NativeCaptureSealer; media?: NativeFinalizedMedia; providerAudio?: NativeProviderAudio;
  maxTotalBytes?: number; sidecarPath?: string; sourcePath: string; publicVideoPath: string; recordDir: string;
}): Promise<void> {
  if (!input.sealer || !input.media || !input.providerAudio || !hasNativeSampler(input.sidecarPath)) return;
  const media = await requireNativeFinalizedMedia(input.media), owner = media.spool.identity;
  const consentPath = path.join(input.recordDir, "record-consent", owner.tenantId, `${owner.sessionId}.json`);
  const retained = new Set([media.spool.video.path, media.spool.audio.path, media.spool.ledger.path,
    path.join(path.dirname(media.spool.video.path), "complete.json"), media.canonicalAudio.path,
    media.video.media.file.path, media.selectedAudio.media.file.path, input.publicVideoPath, input.providerAudio.audioPath,
    input.sourcePath, input.sidecarPath, consentPath, ...(input.providerAudio.maskReceiptPath ? [input.providerAudio.maskReceiptPath] : [])]);
  const used = [...retained].reduce((total, file) => total + fingerprintNativeFile(file, MAX).byteLength, 0);
  await input.sealer.sealCapture({ media, providerAudio: input.providerAudio, sourcePath: input.sourcePath,
    sidecarPath: input.sidecarPath, consentPath, publicVideoPath: input.publicVideoPath, recordDir: input.recordDir,
    sourceId: `${owner.sessionId}-src`, remainingReservationBytes: (input.maxTotalBytes ?? 0) - used });
}
