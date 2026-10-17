import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Turn } from "@lkb/ingest";
import { validatePrivateCaptureWindows, type RecordConsentReceipt } from "./context.js";
import { privateCaptureTurns } from "./privacy.js";
import { recordGuardedPrivacyMaskIntervals } from "./coverage.js";

/** Mute private audio BEFORE the STT provider sees it; retain the original for controlled recovery. */
export function preparePrivateCaptureAudio(audio: string, receipt: RecordConsentReceipt, duration: number,
  run: typeof spawnSync = spawnSync): string {
  const windows = validatePrivateCaptureWindows(receipt.privateWindows);
  if (!windows.length) return audio;
  if (!receipt.generation) throw new Error("Private capture lacks actual attempt generation; transcription refused");
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Private capture requires verified media duration");
  if (receipt.mediaStartedAt === undefined) throw new Error("Entire capture has untrusted private timing; transcription refused");
  const relevant = recordGuardedPrivacyMaskIntervals(receipt,receipt,duration,"audio").map(window=>({tStart:window.start,tEnd:window.end}));
  let covered = 0;
  for (const window of relevant) {
    if (window.tStart > covered) break;
    covered = Math.max(covered, window.tEnd);
  }
  if (covered >= duration) throw new Error("Entire capture is private; transcription and indexing refused");
  if (!relevant.length) return audio;
  const parsed = path.parse(audio), output = path.join(parsed.dir, `${parsed.name}.privacy-${randomUUID()}${parsed.ext}`);
  // aeval evaluates each sample; frame-level volume masking can leak a boundary frame.
  const filter = relevant.map(window => `aeval='if(between(t,${window.tStart},${Math.min(window.tEnd, duration)}),0,val(0))'`).join(",");
  const result = run("ffmpeg", ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", audio,
    "-af", filter, "-c:a", "aac", "-b:a", "96k", output], {encoding: "utf8", timeout: 600000});
  if (result.error || result.status !== 0) throw new Error("Private audio redaction failed; transcription refused");
  return output;
}

/** Publish only the privacy-filtered transcript before process-video, extraction or index. */
export function publishPrivateCaptureTurns(turnsFile: string, receipt: RecordConsentReceipt) {
  const windows = validatePrivateCaptureWindows(receipt.privateWindows);
  if (!windows.length) return undefined;
  if (!receipt.generation) throw new Error("Private capture lacks actual attempt generation; publication refused");
  const stat = lstatSync(turnsFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 32 * 1024 * 1024) throw new Error("Unsafe private transcript file");
  let turns: unknown;
  try {turns = JSON.parse(readFileSync(turnsFile, "utf8"));} catch {throw new Error("Private transcript is unreadable");}
  if (!Array.isArray(turns) || turns.some(turn => !turn || !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd) ||
    turn.tStart < 0 || turn.tEnd <= turn.tStart || typeof turn.text !== "string" || !turn.text.trim())) throw new Error("Invalid private transcript turns");
  const publicTurns = privateCaptureTurns(turns as Turn[], receipt, "audio");
  const temporary = path.join(path.dirname(turnsFile), `.privacy-turns-${randomUUID()}`);
  try {
    writeFileSync(temporary, JSON.stringify(publicTurns, null, 2) + "\n", {flag: "wx", mode: 0o600});
    renameSync(temporary, turnsFile);
  } finally {rmSync(temporary, {force: true});}
  if (!publicTurns.length) throw new Error("No public transcript turns remain; downstream processing refused");
  return {inputTurns: turns.length, publicTurns: publicTurns.length, excludedTurns: turns.length - publicTurns.length};
}
