/** Broker executes these fixtures; maker never provisions directories or invokes decoders. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { getDb } from "../../packages/db/src/client.js";
import { createPrivateDirectory } from "../../packages/meeting-bot/src/capture/record-consent/private-directory.js";
import { createNativeArchiveProductionService, type NativeArchiveProductionConfig } from "./production.js";
import { sealArchiveFixture } from "../../packages/meeting-bot/src/capture/native/native-archive-restart.testsupport.js";
import { openNativeArchiveStore } from "../../packages/meeting-bot/src/capture/native/native-capture-archive.js";
import { createNativeArchiveRecoverer } from "../../packages/meeting-bot/src/capture/native/native-archive-recovery.js";
import { readRecordConsent } from "../../packages/meeting-bot/src/capture/record-consent/receipt-store.js";
import { createHash } from "node:crypto";
import type { Turns } from "../../packages/core/src/index.js";
import { publicPreservedReviewFixture } from "../../apps/api/src/indexing/public-preserved-review.fixture.js";
import { transactionalFixture } from "../../apps/api/src/transcript-review/refresh-testkit.js";
import { indexSession } from "../../apps/api/src/indexing/session.js";
import { createNativeSuggestionPublication } from "../../apps/api/src/indexing/native-archive/publication.js";
import { suggestTileSpeakersForSession } from "../../apps/api/src/indexing/tile-speaker-suggest.js";
import { listSessionSuggestions } from "../../packages/db/src/collections/speaker-suggestions.js";
type Db = ReturnType<typeof getDb>;

function config(root: string): NativeArchiveProductionConfig {
  return { db: { collection() { throw new Error("Unexpected DB lookup"); } } as unknown as Db,
    workspaceRoot: root, recordDir: path.join(root, "record"), archiveRoot: path.join(root, "archive"),
    maxArchiveBytes: 3000000, decoder: { ffmpegPath: "unused", ffprobePath: "unused" } };
}
test("production refuses network/outside roots and enabled native writes without platform authority before I/O", async () => {
  const root = path.resolve(os.tmpdir(), "native-config-not-created");
  await assert.rejects(createNativeArchiveProductionService({ ...config(root), archiveRoot: "\\\\server\\share" }), /local absolute/);
  await assert.rejects(createNativeArchiveProductionService({ ...config(root), archiveRoot: path.resolve(root, "..", "outside") }), /outside workspace/);
  await assert.rejects(createNativeArchiveProductionService({ ...config(root), tiles: {
    enabled: true, clockBudget: { uncertaintySec: 0.1, driftSec: 0.01 },
  } }), /platform authority/);
});
test("real private empty store drains boundedly without DB/providers/host qualification", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "native-production-"));
  try {
    const options = config(root);
    createPrivateDirectory(options.recordDir); createPrivateDirectory(options.archiveRoot);
    const service = await createNativeArchiveProductionService(options);
    assert.deepEqual(await service.drain({ limit: 1 }), { pending: 0 });
    await assert.rejects(service.drain({ limit: 0 }));
    await service.onIndexCommitted({ tenantId: "missing", sessionId: "missing", sourceId: "missing-src",
      generation: "missing", turnDigest: "a".repeat(64), reviewRevision: null });
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("genuine live seal precedes source ingestion; retained public recovery does not invent a clock", async t => {
  const ffmpegPath = process.env.LKB_NATIVE_TEST_FFMPEG, ffprobePath = process.env.LKB_NATIVE_TEST_FFPROBE;
  if (!ffmpegPath || !ffprobePath) { t.skip("Required native decoder environment unavailable; native evidence incomplete"); return; }
  const root = await mkdtemp(path.join(os.tmpdir(), "native-production-live-"));
  try {
    const options = config(root);
    options.decoder = { ffmpegPath, ffprobePath };
    // No DB source exists yet. The production sealer relies on live current receipt/bytes.
    options.db = { collection() { return { findOne: async () => null }; } } as unknown as Db;
    createPrivateDirectory(options.recordDir); createPrivateDirectory(options.archiveRoot);
    const f = await sealArchiveFixture(options.recordDir, options.archiveRoot, ffmpegPath, ffprobePath, 0);
    const { media, providerAudio } = f.sealInput;
    const receipt = readRecordConsent(options.recordDir, { tenantId: "synthetic", sessionId: "synthetic" });
    const data = path.join(root, "data", "toc-migrated", "synthetic");
    await mkdir(data, { recursive: true });
    const sourcePath = path.join(data, "source.json"), sidecarPath = path.join(options.recordDir, "synthetic.tiles.jsonl");
    await writeFile(sourcePath, JSON.stringify({ _id: "synthetic-src", tenantId: "synthetic", kind: "recording",
      hash: providerAudio.sha256, captureConsent: { sessionId: "synthetic", generation: receipt.generation,
        receiptSha256: providerAudio.receiptSha256, meetingHash: receipt.meetingHash,
        sanitizedAudioSha256: providerAudio.sha256, publicVideoSha256: media.video.media.file.sha256 } }), { mode: 0o600 });
    const samplerClock = { version: 1, captureGeneration: receipt.generation, samplerInstance: media.spool.identity.samplerInstanceId };
    await writeFile(sidecarPath, [JSON.stringify({ kind: "meta", source: "meet-dom", samplerClock }),
      JSON.stringify({ source: "meet-dom", samplerClock })].join("\n") + "\n", { mode: 0o600 });
    const service = await createNativeArchiveProductionService(options);
    const sealed = await service.sealCapture({ media, providerAudio, sourcePath, sidecarPath,
      consentPath: f.sealInput.consentPath, recordDir: options.recordDir, sourceId: "synthetic-src",
      publicVideoPath: media.video.media.file.path, remainingReservationBytes: 3000000 });
    assert.equal((await service.drain({ limit: 1 })).pending, 1);
    const reopened = await openNativeArchiveStore({ root: options.archiveRoot, maxArchiveBytes: 3000000,
      readCurrentBinding: async () => sealed.binding });
    const recovered = await createNativeArchiveRecoverer({ store: reopened, decoder: options.decoder }).recoverCapture({
      archiveId: sealed.archiveId, expected: sealed.binding });
    assert.equal(recovered.status, "ready");
    if (recovered.status === "ready") assert.equal(recovered.canonicalClock, undefined);
    assert.equal((await service.drain({ limit: 1 })).pending, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("synthetic alignment unit joins actual index generation and concrete transaction factory to existing consumer", async () => {
  const f = publicPreservedReviewFixture({ preserveReview: false });
  const tenantId = "tenant-a", sessionId = "session-a", sourceId = "source-a";
  const names = ["Priya Nair", "Rahul Verma", "Asha Rao", "Kiran Shah"];
  const turns: Turns[] = Array.from({ length: 8 }, (_, i) => ({ _id: `tile-turn-${i}`, tenantId, sessionId,
    speakerRef: `spk:${i % 4}`, tStart: 20 + i * 40, tEnd: 60 + i * 40, text: "The application process takes several weeks." }));
  f.rows("turns").splice(0, 1, ...turns as unknown as Record<string, unknown>[]);
  f.rows("sources")[0]!.captureConsent = { sessionId, generation: "synthetic-capture", receiptSha256: "a".repeat(64),
    sanitizedAudioSha256: f.rows("sources")[0]!.hash };
  await indexSession(tenantId, sessionId, f.deps);
  const h = transactionalFixture();
  for (const name of ["sources", "sessions", "turns", "claims", "chunks", "session_pages", "tree_index", "graph_edges", "topics", "orgs", "gaps", "decisions"]) {
    for (const row of f.rows(name)) h.seed(name, row);
  }
  const attempt = h.rows("sessions")[0]!.indexAttempt;
  const publication = createNativeSuggestionPublication(h.db, { tenantId, sessionId, sourceId,
    generation: attempt.generation, turnDigest: attempt.turnDigest, reviewRevision: null,
    captureGeneration: "synthetic-capture", receiptSha256: "a".repeat(64), sourceSha256: "b".repeat(64), sidecarSha256: "c".repeat(64) }, async () => {});
  const jsonl = [JSON.stringify({ kind: "meta", startedAtEpoch: 1020, source: "meet-dom" }),
    ...Array.from({ length: 160 }, (_, i) => JSON.stringify({ tSec: i * 2, displayName: names[Math.floor(i / 20) % 4], source: "meet-dom" }))].join("\n") + "\n";
  const context = { recordingSha256: "e".repeat(64), captureSha256: createHash("sha256").update(jsonl).digest("hex"),
    captureId: "synthetic-alignment", clockBasis: "shared-host-epoch" as const, recordingStartedAtEpoch: 1000,
    captureStartedAtEpoch: 1020, recordingDurationSec: 340 };
  const outcome = await suggestTileSpeakersForSession(tenantId, sessionId, turns, context,
    async () => ({ tenantId, sessionId, recordingSha256: context.recordingSha256, captureId: context.captureId, jsonl }),
    h.db, { enabled: true, publication });
  assert.equal(outcome.inserted, 4);
  assert.equal(h.rows("sessions")[0]!.nativePublicationRevision, 1);
  assert.equal((await listSessionSuggestions(tenantId, sessionId, h.db)).length, 4);
  assert.ok(h.rows("speaker_suggestions").every(row => row.nativePublication.generation === attempt.generation));
  assert.equal(h.rows("speakers").length, 0);
  assert.ok(h.calls.filter(call => call.collection === "speaker_suggestions" && call.method === "updateOne").every(call => call.transaction));
  const standalone = { collection: h.db.collection.bind(h.db) } as unknown as Db;
  const unsupported = createNativeSuggestionPublication(standalone, { tenantId, sessionId, sourceId,
    generation: attempt.generation, turnDigest: attempt.turnDigest, reviewRevision: null,
    captureGeneration: "synthetic-capture", receiptSha256: "a".repeat(64), sourceSha256: "b".repeat(64), sidecarSha256: "c".repeat(64) }, async () => {});
  await assert.rejects(unsupported.write(async () => 1), /transaction_required/);
});
