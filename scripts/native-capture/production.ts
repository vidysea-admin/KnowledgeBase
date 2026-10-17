/** Trusted process-root composition. No imported JSON or environment-selected module is an issuer. */
import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs, existsSync } from "node:fs";
import type { getDb } from "../../packages/db/src/client.js";
import type { Sources } from "../../packages/core/src/index.js";
import { createNativeArchiveBindingReader, type NativeArchiveOwner, type NativeCaptureBinding } from "../../apps/api/src/indexing/native-archive/binding.js";
import { createNativeSuggestionPublication } from "../../apps/api/src/indexing/native-archive/publication.js";
import { suggestTileSpeakersForSession } from "../../apps/api/src/indexing/tile-speaker-suggest.js";
import { openNativeArchiveStore } from "../../packages/meeting-bot/src/capture/native/native-capture-archive.js";
import { sameNativeArchiveBinding } from "../../packages/meeting-bot/src/capture/native/native-archive-authority.js";
import { createNativeCaptureSealer } from "../../packages/meeting-bot/src/capture/native/native-archive-capture.js";
import { createNativeArchiveRecoverer } from "../../packages/meeting-bot/src/capture/native/native-archive-recovery.js";
import type { NativeArchiveServerService, NativeCommittedIndexBinding } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";
import { fingerprintNativeFile } from "../../packages/meeting-bot/src/capture/native/native-media-probe.js";
import { requireNativeProviderAudio } from "../../packages/meeting-bot/src/capture/record-consent/native-provider-audio.js";
import { readRecordConsent } from "../../packages/meeting-bot/src/capture/record-consent/receipt-store.js";
import { verifyPrivateArtifact, verifyPrivateDirectory } from "../../packages/meeting-bot/src/capture/record-consent/private-acl.js";
import { createPrivateDirectory } from "../../packages/meeting-bot/src/capture/record-consent/private-directory.js";
import { createTileCaptureRegistry, type TileCommittedCapture } from "../../packages/meeting-bot/src/capture/tiles/registry.js";
import { createNativeCaptureClockQualifier, createNativeMeasurementAuthority, nativeMeasurementReceiptBytes,
  requireNativeCanonicalMeasurement, type NativeCaptureClockQualifierOptions, type NativeProviderClockMap } from "../../packages/meeting-bot/src/capture/tiles/native-measurement.js";
type Db = ReturnType<typeof getDb>;

export interface NativeArchiveProductionConfig {
  db: Db; workspaceRoot: string; recordDir: string; archiveRoot: string; maxArchiveBytes: number;
  decoder: { ffmpegPath: string; ffprobePath: string };
  verifyPlatformQualification?: NativeCaptureClockQualifierOptions["verifyPlatformQualification"];
  /** Actual platform qualification remains required; transaction publication is statically wired. */
  tiles?: { enabled: boolean; clockBudget: { uncertaintySec: number; driftSec: number } };
}
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function within(root: string, file: string): string {
  const relative = path.relative(root, path.resolve(file));
  if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) throw new Error("Native artifact outside workspace");
  return relative;
}

/** Config comes from the trusted launcher. Factory opens the ACL-checked admission store;
 * construction never activates a host or invokes providers/DB writes.
 */
export async function createNativeArchiveProductionService(raw: NativeArchiveProductionConfig): Promise<NativeArchiveServerService> {
  const config = { ...raw, decoder: { ...raw.decoder },
    tiles: raw.tiles ? { ...raw.tiles, clockBudget: { ...raw.tiles.clockBudget } } : undefined };
  for (const directory of [config.workspaceRoot, config.recordDir, config.archiveRoot]) {
    if (!path.isAbsolute(directory) || /^[/\\]{2}/.test(directory)) throw new Error("Native local absolute root required");
  }
  const root = path.resolve(config.workspaceRoot), recordDir = path.resolve(config.recordDir);
  within(root, recordDir); within(root, config.archiveRoot);
  if (config.tiles?.enabled && typeof config.verifyPlatformQualification !== "function") throw new Error("Native platform authority required");
  for (const directory of [recordDir, config.archiveRoot]) {
    if (existsSync(directory)) verifyPrivateDirectory(directory);
    else createPrivateDirectory(directory);
  }
  async function capture(owner: NativeArchiveOwner) {
    if (!ID.test(owner.tenantId) || !ID.test(owner.sessionId) || owner.sourceId !== `${owner.sessionId}-src`) return null;
    try {
      const sourcePath = path.join(root, "data", "toc-migrated", owner.sessionId, "source.json");
      const sidecarPath = path.join(recordDir, `${owner.sessionId}.tiles.jsonl`);
      // Public ingestion source is outside the private spool. Archive copies are ACL-guarded
      // independently; its raw bytes remain bound to the live consent and exact source hash.
      verifyPrivateArtifact(sidecarPath);
      const sourceFile = fingerprintNativeFile(sourcePath, 256 * 1024);
      const sidecarFile = fingerprintNativeFile(sidecarPath, 16 * 1024 ** 2);
      const source = JSON.parse(await fs.readFile(sourcePath, "utf8")) as Sources;
      const receipt = readRecordConsent(recordDir, owner), consent = source.captureConsent;
      if (!receipt.generation || source._id !== owner.sourceId || source.tenantId !== owner.tenantId ||
        source.kind !== "recording" || !record(consent) || consent.sessionId !== owner.sessionId ||
        consent.generation !== receipt.generation || consent.receiptSha256 !== digest(JSON.stringify(receipt)) ||
        consent.meetingHash !== receipt.meetingHash || consent.sanitizedAudioSha256 !== source.hash ||
        fingerprintNativeFile(sourcePath, 256 * 1024).sha256 !== sourceFile.sha256 ||
        fingerprintNativeFile(sidecarPath, 16 * 1024 ** 2).sha256 !== sidecarFile.sha256) return null;
      const binding: NativeCaptureBinding = { ...owner, captureGeneration: receipt.generation,
        receiptSha256: digest(JSON.stringify(receipt)), sourceSha256: sourceFile.sha256, sidecarSha256: sidecarFile.sha256 };
      return { binding, source };
    } catch { return null; }
  }
  const current = createNativeArchiveBindingReader(config.db, capture);
  const store = await openNativeArchiveStore({ root: config.archiveRoot, maxArchiveBytes: config.maxArchiveBytes,
    readCurrentBinding: async owner => (await capture(owner))?.binding ?? null });
  const sealer = createNativeCaptureSealer({ store, readCurrentReceipt: readRecordConsent });
  const recovery = createNativeArchiveRecoverer({ store, decoder: config.decoder });
  const qualify = createNativeCaptureClockQualifier({ verifyPlatformQualification: config.verifyPlatformQualification ?? (async () => null) });

  async function publish(archiveId: string, expected: NativeCaptureBinding, committed?: Readonly<NativeCommittedIndexBinding>) {
    const snapshot = await current.read(expected);
    if (!snapshot || !sameNativeArchiveBinding(snapshot.binding, expected)) return;
    if (committed && !equal({ tenantId: snapshot.binding.tenantId, sessionId: snapshot.binding.sessionId,
      sourceId: snapshot.binding.sourceId, generation: snapshot.binding.generation, turnDigest: snapshot.binding.turnDigest,
      reviewRevision: snapshot.binding.reviewRevision }, committed)) return;
    const recovered = await recovery.recoverCapture({ archiveId, expected });
    if (recovered.status !== "ready") return;
    // A retained public WAV proves provider identity only. It supplies no host-clock bounds.
    const canonicalClock = recovered.canonicalClock ?? await qualify(recovered.media);
    if (!canonicalClock || !config.tiles?.enabled) return;
    const canonical = await requireNativeCanonicalMeasurement(canonicalClock, recovered.media);
    const provider = await requireNativeProviderAudio(recovered.providerAudio);
    const map: NativeProviderClockMap = { ...provider, canonicalClock };
    const measurementBytes = await nativeMeasurementReceiptBytes(map);
    const clockFile = path.join(recordDir, `${archiveId}.native-measurement.json`);
    try { await fs.writeFile(clockFile, measurementBytes, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    verifyPrivateArtifact(clockFile);
    if (!(await fs.readFile(clockFile)).equals(measurementBytes)) return;
    const archived = path.join(config.archiveRoot, archiveId);
    const binding: TileCommittedCapture = { evidenceKind: "native", tenantId: expected.tenantId, sessionId: expected.sessionId,
      indexBinding: { version: 1, generation: snapshot.binding.generation, sessionId: expected.sessionId,
        sourceId: expected.sourceId, turnDigest: snapshot.binding.turnDigest },
      captureGeneration: expected.captureGeneration, hostId: canonical.hostId,
      samplerInstance: canonical.identity.samplerInstanceId, platform: "meet", durationSec: recovered.providerAudio.durationSec,
      audioPath: within(root, recovered.providerAudio.audioPath), publicVideoPath: within(root, recovered.media.video.media.file.path),
      sourcePath: within(root, path.join(archived, "source.json")), sidecarPath: within(root, path.join(archived, "sampler.json")),
      clockPath: within(root, clockFile), audioSha256: recovered.providerAudio.sha256,
      publicVideoSha256: recovered.media.video.media.file.sha256, sourceSha256: expected.sourceSha256,
      sidecarSha256: expected.sidecarSha256, receiptSha256: expected.receiptSha256, clockSha256: digest(measurementBytes) };
    const readCommitted = async (tenant: string, session: string) => {
      if (tenant !== expected.tenantId || session !== expected.sessionId) return null;
      const latest = await current.read(expected);
      return latest && equal(latest.binding, snapshot.binding) ? structuredClone(binding) : null;
    };
    const measureDecodedClock = createNativeMeasurementAuthority({ readCurrentCommitted: readCommitted,
      readProviderMap: async () => {
        await requireNativeProviderAudio(recovered.providerAudio);
        await requireNativeCanonicalMeasurement(canonicalClock, recovered.media);
        return map;
      } });
    const registry = createTileCaptureRegistry({ workspaceRoot: root, recordDir, readCommitted,
      measureDecodedClock, clockBudget: config.tiles.clockBudget });
    const ready = await registry.resolve(expected.tenantId, expected.sessionId, { enabled: true });
    if (ready.status !== "ready") return;
    const publication = createNativeSuggestionPublication(config.db, snapshot.binding, ready.assertCurrent);
    const outcome = await suggestTileSpeakersForSession(expected.tenantId, expected.sessionId, snapshot.turns,
      ready.context, ready.readCapture, config.db, { enabled: true, publication });
    if (outcome.reason !== "suggested" && outcome.reason !== "no-evidence") return;
    await ready.assertCurrent();
    // Journal publication is an idempotency hint only. Every drain rechecks authoritative state.
    await store.markPublished(archiveId, expected, digest(JSON.stringify(snapshot.binding)));
  }
  return {
    sealCapture: input => sealer.sealCapture(input),
    async onIndexCommitted(binding) {
      for (const entry of await store.findByOwner(binding)) await publish(entry.archiveId, entry.binding, binding);
    },
    async drain(input) {
      const page = await store.pendingPage(input);
      for (const entry of page.entries) {
        try { await publish(entry.archiveId, entry.binding); } catch { /* Still durable and pending. */ }
      }
      return { ...(page.cursor ? { cursor: page.cursor } : {}), pending: page.pending };
    },
  };
}
