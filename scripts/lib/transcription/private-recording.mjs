/** Durable capture proof shared by the actual recording provider and QA admission gates. */
import { createHash } from "node:crypto";
import { lstatSync, realpathSync, readFileSync, readSync, openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { assertQaGenerationShape, qaReportFailureReasons } from "./transcript-qa-generation.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
let privateDeps;
function receiptApis() {
  if (!privateDeps) {
    const { require: tsRequire } = createRequire(import.meta.url)("tsx/cjs/api");
    const read = name => tsRequire(`../../../packages/meeting-bot/src/capture/record-consent/${name}.ts`, import.meta.url);
    privateDeps = { ...read("receipt-store"), ...read("coverage"), ...read("provider-input") };
  }
  return privateDeps;
}
export function parseSealedCaptureInput(bytes, { tenantId, sessionId }) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 8192) throw new Error("Invalid sealed capture input");
  let row; try { row = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Invalid sealed capture input"); }
  const keys = ["version", "tenantId", "sessionId", "audioPath", "sha256", "receiptSha256", "sourceSha256", "generation"];
  if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== keys.length || Object.keys(row).some(k => !keys.includes(k)) ||
      row.version !== 1 || row.tenantId !== tenantId || row.sessionId !== sessionId || !uuid(row.generation) ||
      !digest(row.sha256) || !digest(row.receiptSha256) || !digest(row.sourceSha256) || typeof row.audioPath !== "string" ||
      !path.isAbsolute(row.audioPath) || /^[/\\]{2}/.test(row.audioPath)) throw new Error("Invalid sealed capture input");
  return Object.freeze(row);
}
export function readSealedCaptureInput({ fd = 0, tenantId, sessionId }) {
  if (fd !== 0) throw new Error("Capture input must use stdin");
  const bytes = Buffer.alloc(8193); let length = 0;
  while (length < bytes.length) { const read = readSync(fd, bytes, length, bytes.length - length, null); if (!read) break; length += read; }
  return parseSealedCaptureInput(bytes.subarray(0, length), { tenantId, sessionId });
}
export function resolveSealedCaptureAudio(root, sealedInput) { return confined(path.resolve(root), sealedInput.audioPath); }
function confined(root, value, directory = false) {
  if (typeof value !== "string" || !value || /^[/\\]{2}/.test(value) || value.includes("\0") ||
      /^[a-z]+:\/\//i.test(value) || value.replace(/^[A-Za-z]:/, "").includes(":") || value.split(/[/\\]/).some(part => part === "..")) throw new Error("Invalid capture artifact locator");
  const target = path.resolve(root, value), rel = path.relative(root, target);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error("Capture artifact outside repository");
  for (let current = target; ; current = path.dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || canonical(realpathSync(current)) !== canonical(current)) throw new Error("Redirected capture artifact refused");
    if (current === path.dirname(current)) break;
  }
  const stat = lstatSync(target);
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1 || stat.size <= 0) throw new Error("Invalid physical capture artifact");
  return target;
}
function fileHash(file) {
  const before = lstatSync(file), physical = realpathSync(file), hash = createHash("sha256");
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size <= 0 || before.size > 8 * 1024 ** 3) throw new Error("Invalid capture hash artifact");
  const fd = openSync(file, "r"), buffer = Buffer.alloc(65536);
  try { let size; while ((size = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, size)); }
  finally { closeSync(fd); }
  const after = lstatSync(file);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
      after.isSymbolicLink() || realpathSync(file) !== physical) throw new Error("Capture artifact changed during verification");
  return hash.digest("hex");
}

/** null is allowed only for a provided/public source with no known private capture fields. */
function buildTrustedRecordingPrivacy({ root, sessionId, source, audioPath, durationSeconds, sealedInput }) {
  source = structuredClone(source);
  const binding = source?.captureConsent;
  if (!binding) {
    if (source?.captureMode === "silent" || source?.privateWindows !== undefined || source?.guardedPrivateWindows !== undefined) {
      throw new Error("Known capture lacks durable consent/media proof; provider refused");
    }
    return null;
  }
  if (!binding || typeof binding !== "object" || Array.isArray(binding) || binding.sessionId !== sessionId ||
      typeof source.tenantId !== "string" || !digest(binding.meetingHash) || !digest(binding.receiptSha256) ||
      !digest(binding.publicVideoSha256) || !digest(binding.sanitizedAudioSha256) ||
      !uuid(binding.generation) ||
      typeof binding.recordDir !== "string" || path.isAbsolute(binding.recordDir) || path.win32.isAbsolute(binding.recordDir) ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Invalid capture consent/media binding");
  root = path.resolve(root);
  const recordDir = confined(root, binding.recordDir, true);
  const videoPath = confined(root, source.path), boundAudio = confined(root, source.audioPath);
  if (audioPath && canonical(confined(root, audioPath)) !== canonical(boundAudio)) throw new Error("Provider audio differs from capture binding");
  const owner = { tenantId: source.tenantId, sessionId, meetingHash: binding.meetingHash };
  const sourcePath = confined(root, path.join("data", "toc-migrated", sessionId, "source.json"));
  const sourceHash = sha(JSON.stringify(source));
  const sourceSha256 = sha(readFileSync(sourcePath));
  const { readRecordConsent, publicRecordCaptureIntervals, runPrivateCaptureProvider } = receiptApis();
  const readCurrent = () => {
    const receipt = readRecordConsent(recordDir, owner);
    if (!uuid(receipt.generation)) throw new Error("Capture receipt lacks a genuine generation");
    if (sha(JSON.stringify(receipt)) !== binding.receiptSha256) throw new Error("Capture consent receipt changed; processing refused");
    return receipt;
  };
  const receipt = readCurrent();
  if (binding.generation !== receipt.generation || source.captureGeneration !== undefined && source.captureGeneration !== receipt.generation) throw new Error("Capture generation binding differs from current receipt");
  if (sealedInput && (sealedInput.tenantId !== owner.tenantId || sealedInput.sessionId !== sessionId ||
      canonical(confined(root, sealedInput.audioPath)) !== canonical(boundAudio) || sealedInput.sha256 !== binding.sanitizedAudioSha256 ||
      sealedInput.receiptSha256 !== binding.receiptSha256 || sealedInput.sourceSha256 !== sourceSha256 || sealedInput.generation !== receipt.generation)) {
    throw new Error("Sealed capture input differs from current receipt/source/media");
  }
  if (receipt.privateWindows.length && !binding.originalAudioPath) throw new Error("Original private artifact binding missing");
  const originalAudioPath = confined(root, binding.originalAudioPath ?? source.path);
  if (receipt.privateWindows.length && (canonical(originalAudioPath) === canonical(videoPath) || canonical(originalAudioPath) === canonical(boundAudio))) {
    throw new Error("Private original cannot be a public provider artifact");
  }
  const publicIntervals = publicRecordCaptureIntervals(receipt, owner, { tStart: 0, tEnd: durationSeconds }, "audio");
  if (!publicIntervals.length) throw new Error("Entire capture private; provider refused");
  function verifyCurrent() {
    const currentSource = readFileSync(sourcePath);
    if (sha(currentSource) !== sourceSha256 || sha(JSON.stringify(JSON.parse(currentSource))) !== sourceHash) throw new Error("Capture source binding changed; processing refused");
    readCurrent();
    confined(root, binding.recordDir, true); confined(root, source.path); confined(root, source.audioPath); confined(root, binding.originalAudioPath ?? source.path);
    if (fileHash(videoPath) !== binding.publicVideoSha256 || fileHash(boundAudio) !== binding.sanitizedAudioSha256) {
      throw new Error("Public capture media changed; processing refused");
    }
  }
  verifyCurrent();
  return {
    audioPath: boundAudio, sourceSha256, receiptSha256: binding.receiptSha256, sanitizedAudioSha256: binding.sanitizedAudioSha256, publicIntervals, verifyCurrent,
    runProvider: async callback => {
      if (!sealedInput) throw new Error("Captured provider dispatch requires sealed parent input");
      verifyCurrent();
      return runPrivateCaptureProvider({ receipt: readCurrent(), owner, duration: durationSeconds, audioPath: boundAudio,
        originalAudioPath, sanitizedSha256: binding.sanitizedAudioSha256 }, callback);
    },
    filterSpanTurns: (turns, offsetSeconds, mediaDurationSeconds) => {
      if (!Array.isArray(turns)) return { turns, privacy: null };
      const excludedIndices = [], retained = [];
      for (const [index, turn] of turns.entries()) {
        const valid = turn && Number.isFinite(turn.tStart) && Number.isFinite(turn.tEnd) &&
          turn.tStart >= 0 && turn.tEnd >= turn.tStart && turn.tEnd <= mediaDurationSeconds;
        const start = turn?.tStart + offsetSeconds, end = turn?.tEnd + offsetSeconds;
        // Invalid/past-end timings stay visible to QA. Only entirely public valid turns survive privacy overlap exclusion.
        if (valid && !publicIntervals.some(window => start >= window.tStart && end <= window.tEnd)) excludedIndices.push(index);
        else retained.push(turn);
      }
      return { turns: retained, privacy: { receiptSha256: binding.receiptSha256, inputCount: turns.length,
        outputCount: retained.length, excludedIndices, offsetSeconds } };
    },
  };
}
export async function loadTrustedRecordingPrivacy(input) { return buildTrustedRecordingPrivacy(input); }

/** Synchronous actual downstream admission; shares the same strict producer parser and artifacts. */
export function verifyTrustedRecordingPrivacyAdmission({ root, sessionId, source, durationSeconds, validation, turns }) {
  const context = buildTrustedRecordingPrivacy({ root, sessionId, source, durationSeconds });
  if (!context) { if (validation?.privacy) throw new Error("Validated privacy source binding missing"); return null; }
  const proof = { receiptSha256: context.receiptSha256, sanitizedAudioSha256: context.sanitizedAudioSha256, publicIntervals: context.publicIntervals };
  if (validation?.status !== "passed" || validation.transcriptValidated !== true || validation.sourceSha256 !== context.sourceSha256 ||
      JSON.stringify(validation.privacy) !== JSON.stringify(proof)) throw new Error("Current capture proof differs from validated generation");
  const dir = path.join("data", "toc-migrated", sessionId), qaFile = confined(path.resolve(root), path.join(dir, "transcript-qa.json")), qaBytes = readFileSync(qaFile);
  if (!digest(validation.qaSha256) || sha(qaBytes) !== validation.qaSha256) throw new Error("Captured admission requires current generation-bound QA");
  const qa = JSON.parse(qaBytes); assertQaGenerationShape(qa);
  if (qa.durationSec !== durationSeconds || !Array.isArray(turns) || qa.merged.outputCount !== turns.length ||
      JSON.stringify(qa.privacy) !== JSON.stringify(proof) || !digest(validation.turnsSha256) || qa.turnsSha256 !== validation.turnsSha256 ||
      fileHash(confined(path.resolve(root), path.join(dir, "turns.json"))) !== validation.turnsSha256 ||
      JSON.stringify(JSON.parse(readFileSync(path.resolve(root, dir, "turns.json")))) !== JSON.stringify(turns)) throw new Error("Captured QA/turn generation mismatch");
  for (const report of [qa.merged, ...qa.spans.filter(s => s.accepted).flatMap(s => [s.report, s.providerReport])]) {
    if (!report || qaReportFailureReasons(report, "capture admission").length) throw new Error("Accepted captured provider anomalies refuse admission");
  }
  if (!Array.isArray(turns) || turns.some(t => !t || !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart || t.tEnd > durationSeconds) ||
      context.filterSpanTurns(turns, 0, durationSeconds).privacy.excludedIndices.length) throw new Error("Protected or invalid committed capture turns");
  if (!evaluateRecordingCoverage({ privacy: context, turns, durationSeconds }).complete && validation.partialAccepted !== true) throw new Error("Genuine public speech missing from validated capture");
  context.verifyCurrent();
  if (fileHash(qaFile) !== validation.qaSha256 || fileHash(confined(path.resolve(root), path.join(dir, "turns.json"))) !== validation.turnsSha256) throw new Error("Capture QA/turns changed during admission");
  return context;
}

/** Compute genuine missing public time; trusted private silence never creates synthetic turns. */
export function recordingSpanCoverage({ privacy, turns, offsetSeconds, durationSeconds, findTimeGaps, gapThresholdSeconds, tailThresholdSeconds }) {
  if (privacy) return evaluateRecordingCoverage({ privacy, turns, offsetSeconds, durationSeconds, gapThresholdSeconds, tailThresholdSeconds });
  const gaps = findTimeGaps(turns, gapThresholdSeconds), tailShortfall = durationSeconds - (turns.at(-1)?.tEnd ?? 0);
  return { gaps, leadingShortfall: turns[0]?.tStart ?? durationSeconds, tailShortfall,
    complete: turns.length > 0 && gaps.length === 0 && tailShortfall <= tailThresholdSeconds };
}
export function evaluateRecordingCoverage({ privacy, turns, offsetSeconds = 0, durationSeconds, gapThresholdSeconds = 30, tailThresholdSeconds = 45 }) {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds < 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
      !Array.isArray(turns) || !Array.isArray(privacy?.publicIntervals)) throw new Error("Invalid public coverage input");
  let previousEnd = 0;
  for (const w of privacy.publicIntervals) {
    if (!Number.isFinite(w.tStart) || !Number.isFinite(w.tEnd) || w.tStart < previousEnd || w.tEnd <= w.tStart) throw new Error("Invalid trusted public intervals");
    previousEnd = w.tEnd;
  }
  const start = offsetSeconds, end = start + durationSeconds;
  const expected = privacy.publicIntervals.map(w => ({ tStart: Math.max(start, w.tStart), tEnd: Math.min(end, w.tEnd) })).filter(w => w.tEnd > w.tStart);
  const covered = turns.filter(t => Number.isFinite(t?.tStart) && Number.isFinite(t?.tEnd) && t.tStart >= 0 && t.tEnd >= t.tStart)
    .map(t => ({ tStart: t.tStart + start, tEnd: t.tEnd + start })).sort((a, b) => a.tStart - b.tStart);
  const projected = []; let expectedPublicSeconds = 0;
  for (const window of expected) {
    for (const turn of covered) {
      const a = Math.max(window.tStart, turn.tStart), b = Math.min(window.tEnd, turn.tEnd);
      if (b > a) projected.push({ start: expectedPublicSeconds + a - window.tStart, end: expectedPublicSeconds + b - window.tStart });
    }
    expectedPublicSeconds += window.tEnd - window.tStart;
  }
  projected.sort((a, b) => a.start - b.start);
  const missing = []; let cursor = 0, coveredPublicSeconds = 0;
  for (const turn of projected) {
    if (turn.start > cursor) missing.push({ start: cursor, end: turn.start });
    coveredPublicSeconds += Math.max(0, turn.end - Math.max(cursor, turn.start)); cursor = Math.max(cursor, turn.end);
  }
  const leadingShortfall = projected.length ? projected[0].start : expectedPublicSeconds;
  const tailShortfall = expectedPublicSeconds - cursor;
  const atAudio = point => { let sum = 0; for (const w of expected) { const length = w.tEnd - w.tStart; if (point <= sum + length) return w.tStart + point - sum; sum += length; } return end; };
  const gaps = missing.filter(g => g.end - g.start > gapThresholdSeconds).map(g => ({ gapStart: atAudio(g.start), gapEnd: atAudio(g.end), gapSeconds: g.end - g.start }));
  return { complete: expected.length === 0 || projected.length > 0 && gaps.length === 0 && leadingShortfall <= gapThresholdSeconds && tailShortfall <= tailThresholdSeconds,
    gaps, leadingShortfall, tailShortfall, expectedPublicSeconds, coveredPublicSeconds };
}
