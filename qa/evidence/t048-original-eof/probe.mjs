/** Sole ordinary broker only: immutable public synthetic media, no encoding/provider/network/DB. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRecordConsent } from "../../../packages/meeting-bot/src/capture/record-consent/context.ts";
import { writeRecordConsent, readRecordConsent } from "../../../packages/meeting-bot/src/capture/record-consent/receipt-store.ts";
import { loadTrustedRecordingPrivacy } from "../../../scripts/lib/transcription/private-recording.mjs";
import { buildTranscriptQaGeneration } from "../../../scripts/lib/transcription/transcript-qa-generation.mjs";
import { immutableTranscriptTurns, writeTranscriptGeneration } from "../../../scripts/lib/transcript-provenance.mjs";
import { clampAndValidateTurns } from "../../../packages/ai/src/stt/transcript-qa.ts";
import { validateSession } from "../../../scripts/webinar/validate/validate-session.mjs";
import { loadWebinarSession } from "../../../scripts/webinar/session-rows.mjs";

const repo = process.cwd(), arg = key => process.argv[process.argv.indexOf(key) + 1];
const phase = arg("--phase"), output = arg("--out");
assert.ok(["baseline", "current"].includes(phase)); assert.ok(output);
const evidence = path.resolve(repo, "qa/evidence/t048-original-eof"), out = path.resolve(repo, output);
assert.ok(out.startsWith(`${evidence}${path.sep}`) && path.extname(out) === ".json");
const corpus = "qa/evidence/t035-lean-video-measured-encode/eof-current-m5uNoV/";
const original = path.resolve(repo, corpus, "stale-duration-source.mkv");
const cases = [
  { id: "private-eof", end: 12, file: "private-eof.private.lean.mp4", sha256: "569c392b1fa496db3d0fa37842c032422163a86926be09b67e029d73fc04b8f0" },
  { id: "closed-private-public-tail", end: 10, file: "closed-private-public-tail.private.lean.mp4", sha256: "eeb679029d1651d7f3840edabd3059376a19b195aa406d34c09f332ab674d877" },
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex"), fileHash = file => hash(readFileSync(file));
const originalSha256 = "d07c93e97ca281bf1c53c3aabf6a34d5ba56fd417256b9efdb75b9d432f42de7";
assert.equal(fileHash(original), originalSha256);
const commands = [], startedAt = new Date().toISOString();
function duration(file) {
  const args = ["-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "matroska,webm,mov", "-show_entries", "format=duration", "-of", "json", file];
  const started = performance.now();
  const bytes = execFileSync("ffprobe", args, { encoding: "utf8", timeout: 5000, maxBuffer: 65536, windowsHide: true });
  const result = Number(JSON.parse(bytes).format?.duration);
  assert.ok(Number.isFinite(result) && result > 0);
  commands.push({ program: "ffprobe", args, elapsedMs: performance.now() - started, duration: result });
  return result;
}
const originalDurationSeconds = duration(original); assert.equal(originalDurationSeconds, 12);
const results = [];
for (const row of cases) {
  const publicArtifact = path.resolve(repo, corpus, row.file); assert.equal(fileHash(publicArtifact), row.sha256);
  const decodedDurationSeconds = duration(publicArtifact); assert.equal(decodedDurationSeconds, 12.202667);
  const root = mkdtempSync(path.join(tmpdir(), "t048-original-eof-")), physicalRoot = realpathSync(root);
  try {
    const sessionId = row.id, owner = { tenantId: "fixture", sessionId, meetingUrl: "https://example.invalid/t048-original-eof" };
    const recordDir = path.join(root, "capture-slot"); mkdirSync(recordDir);
    const receipt = createRecordConsent([], owner, { LKB_CAPTURE_RECORDED_BY: "synthetic", LKB_CAPTURE_APPROVED_BY: "synthetic", LKB_CAPTURE_APPROVAL_REF: "synthetic" }, new Date(1000));
    receipt.mediaStartedAt = 1000; receipt.privateWindows = [{ tStart: 9, tEnd: row.end }]; writeRecordConsent(recordDir, receipt);
    const currentReceipt = readRecordConsent(recordDir, owner), receiptSha256 = hash(JSON.stringify(currentReceipt));
    copyFileSync(original, path.join(recordDir, "original.mkv")); copyFileSync(publicArtifact, path.join(recordDir, "public.mp4"));
    const source = { _id: `${sessionId}-source`, tenantId: owner.tenantId, kind: "recording", captureMode: "silent", title: "Public synthetic EOF composition", createdAt: "2026-10-15T00:00:00.000Z",
      path: "capture-slot/public.mp4", audioPath: "capture-slot/public.mp4", captureGeneration: currentReceipt.generation,
      captureConsent: { recordDir: "capture-slot", sessionId, meetingHash: currentReceipt.meetingHash, generation: currentReceipt.generation, receiptSha256,
        publicVideoSha256: row.sha256, sanitizedAudioSha256: row.sha256, originalAudioPath: "capture-slot/original.mkv", originalDurationSeconds, originalVideoSha256: originalSha256 } };
    const dir = path.join(root, "data/toc-migrated", sessionId); mkdirSync(dir, { recursive: true });
    const sourceBytes = Buffer.from(JSON.stringify(source)); writeFileSync(path.join(dir, "source.json"), sourceBytes);
    const sealedInput = { version: 1, tenantId: owner.tenantId, sessionId, audioPath: path.join(recordDir, "public.mp4"), sha256: row.sha256, receiptSha256, sourceSha256: hash(sourceBytes), generation: currentReceipt.generation };
    const context = await loadTrustedRecordingPrivacy({ root, sessionId, source, audioPath: sealedInput.audioPath, durationSeconds: decodedDurationSeconds, sealedInput });
    const providerTurns = [{ speakerRef: "spk:0", tStart: 0, tEnd: 8.899999, text: "synthetic public prefix" },
      { speakerRef: "spk:0", tStart: 12.15, tEnd: 12.2, text: row.id === "private-eof" ? "synthetic invented protected padding" : "synthetic legitimate public tail" }];
    const filtered = context.filterSpanTurns(providerTurns, 0, decodedDurationSeconds);
    const publicQa = clampAndValidateTurns(filtered.turns, decodedDurationSeconds), rawQa = clampAndValidateTurns(providerTurns, decodedDurationSeconds);
    const committed = writeTranscriptGeneration(dir, owner.tenantId, sessionId, publicQa.turns), turnsBytes = readFileSync(path.join(dir, "turns.json"));
    const privacy = { receiptSha256, sanitizedAudioSha256: row.sha256, publicIntervals: context.publicIntervals };
    const proof = buildTranscriptQaGeneration({ turnsBytes, durationSec: decodedDurationSeconds, merged: publicQa.report, privacy,
      spans: [{ id: "synthetic-counted", accepted: true, offsetSeconds: 0, report: publicQa.report, providerReport: rawQa.report, privacy: filtered.privacy }] });
    writeFileSync(path.join(dir, "transcript-qa.json"), JSON.stringify(proof));
    const validation = await validateSession({ root, sessionId, durationSec: decodedDurationSeconds, env: { LKB_TRANSCRIPT_QA: "1" } });
    let admitted; try { admitted = loadWebinarSession(dir, sessionId).rawTurns; } catch (error) { admitted = []; }
    results.push({ scenario: row.id, originalSha256, publicSha256: row.sha256, originalDurationSeconds, decodedDurationSeconds,
      publicIntervals: context.publicIntervals, excludedIndices: filtered.privacy.excludedIndices, committedCount: committed.length,
      validationPassed: validation.passed, gate: validation.gate, admittedCount: admitted.length, tailAdmitted: admitted.some(t => t.tStart === 12.15),
      originalCopiedSha256: fileHash(path.join(recordDir, "original.mkv")), expectedCanonicalIds: immutableTranscriptTurns(owner.tenantId, sessionId, publicQa.turns).map(t => t._id) });
  } finally {
    assert.equal(realpathSync(root), physicalRoot); assert.ok(root.startsWith(path.join(tmpdir(), "t048-original-eof-")));
    rmSync(root, { recursive: true, force: true });
  }
}
const eof = results.find(r => r.scenario === "private-eof"), healthy = results.find(r => r.scenario === "closed-private-public-tail");
const healthyPassed = healthy.tailAdmitted && healthy.admittedCount === 2 && healthy.validationPassed;
const eofPassed = !eof.tailAdmitted && eof.admittedCount === 1 && eof.validationPassed && eof.excludedIndices.includes(1);
const report = { phase, startedAt, completedAt: new Date().toISOString(), sourceHash: fileHash(import.meta.filename), originalUnchanged: fileHash(original) === originalSha256,
  healthyPassed, eofPassed, results, commands, scope: "Actual receipt/helper/QA/validator/loader over retained ordinary synthetic artifacts. No encoding, upload/provider, database or private capture." };
mkdirSync(evidence, { recursive: true }); writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
assert.equal(report.originalUnchanged, true); assert.equal(healthyPassed, true, "healthy closed-window decoded public tail must remain accepted");
assert.equal(eofPassed, true, "original-EOF-private decoded padding must be excluded before canonical turns and admission");
