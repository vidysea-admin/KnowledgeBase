/**
 * packages/ai/src/stt/transcript-qa-report.ts -- T-044 QA report over a turns file. Reuses
 * `clampAndValidateTurns` (no clamp logic here) and fails closed: unknown/non-positive duration,
 * unreadable or malformed input, or any turn still ending past the duration after clamping => `FAIL`.
 * `buildTranscriptQaReport` is pure; `writeTranscriptQaReport` is the only I/O: it reads the input,
 * never modifies it, and refuses to overwrite an existing report unless `overwrite` is set.
 * NOT wired into the transcription driver (reserved by D-119).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { clampAndValidateTurns, type TranscriptQaReport } from "./transcript-qa.js";
import type { Turn } from "./transcribe.js";

export interface ClampedTurnChange {
  index: number;
  tStartBefore: number;
  tStartAfter: number;
  tEndBefore: number;
  tEndAfter: number;
}

export interface TranscriptQaFullReport {
  verdict: "PASS" | "FAIL";
  /** Human-readable reasons for FAIL; empty on PASS. */
  failReasons: string[];
  durationSec: number | null;
  turnsIn: number;
  turnsOut: number;
  turnsClamped: ClampedTurnChange[];
  turnsDropped: Array<{ index: number; reason: string; suspectedHallucination: boolean }>;
  /** Output-turn indices that still violate "no turn ends past the audio duration" (must be empty). */
  remainingViolations: number[];
  hallucination: TranscriptQaReport["hallucination"] | null;
  qa: TranscriptQaReport | null;
}

function failReport(reason: string, durationSec: number | null, turnsIn = 0): TranscriptQaFullReport {
  return {
    verdict: "FAIL", failReasons: [reason], durationSec, turnsIn, turnsOut: 0,
    turnsClamped: [], turnsDropped: [], remainingViolations: [], hallucination: null, qa: null,
  };
}

/** Accepts a parsed JSON value: an array of turns, or `{ turns: [...] }`. */
export function buildTranscriptQaReport(parsed: unknown, durationSec: unknown): TranscriptQaFullReport {
  const dur = typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null;
  const list = Array.isArray(parsed) ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { turns?: unknown }).turns) ? (parsed as { turns: unknown[] }).turns
    : null;
  if (list === null) return failReport("malformed input: expected an array of turns or { turns: [...] }", dur);
  if (dur === null) return failReport("audio duration unknown or not a positive finite number", null, list.length);
  const notObject = list.findIndex((t) => t === null || typeof t !== "object" || Array.isArray(t));
  if (notObject !== -1) return failReport(`malformed input: turn ${notObject} is not an object`, dur, list.length);

  const input = list as Turn[];
  const { turns, report } = clampAndValidateTurns(input, dur);
  const turnsClamped: ClampedTurnChange[] = report.clampedIndices.map((index) => {
    const before = input[index]!;
    // Output keeps input order minus dropped indices.
    const droppedBefore = report.dropped.filter((d) => d.index < index).length;
    const after = turns[index - droppedBefore]!;
    return { index, tStartBefore: before.tStart, tStartAfter: after.tStart, tEndBefore: before.tEnd, tEndAfter: after.tEnd };
  });
  const remainingViolations: number[] = [];
  turns.forEach((t, i) => {
    if (!(Number.isFinite(t.tEnd) && t.tEnd <= dur && t.tEnd >= t.tStart && t.tStart >= 0)) remainingViolations.push(i);
  });
  const failReasons: string[] = [];
  if (!report.durationValid) failReasons.push("duration invalid");
  if (remainingViolations.length > 0) failReasons.push(`${remainingViolations.length} turn(s) still violate the duration criterion after clamping`);
  const invalidTiming = report.dropped.filter((d) => d.reason === "invalid-timing").length;
  if (invalidTiming > 0) failReasons.push(`${invalidTiming} turn(s) dropped for invalid timing (malformed turns)`);
  return {
    verdict: failReasons.length === 0 ? "PASS" : "FAIL", failReasons, durationSec: dur,
    turnsIn: report.inputCount, turnsOut: report.outputCount, turnsClamped,
    turnsDropped: report.dropped.map((d) => ({ index: d.index, reason: d.reason, suspectedHallucination: d.suspectedHallucination })),
    remainingViolations, hallucination: report.hallucination, qa: report,
  };
}

export interface WriteReportOptions {
  inputPath: string;
  durationSec: unknown;
  /** Defaults to `<inputPath without .json>.qa-report.json`. */
  outPath?: string;
  overwrite?: boolean;
}

export function defaultReportPath(inputPath: string): string {
  return inputPath.replace(/\.json$/i, "") + ".qa-report.json";
}

/** Reads the turns file (read-only), writes the report. Throws if the report exists and !overwrite. */
export function writeTranscriptQaReport(opts: WriteReportOptions): { outPath: string; report: TranscriptQaFullReport } {
  const outPath = opts.outPath ?? defaultReportPath(opts.inputPath);
  if (outPath === opts.inputPath) throw new Error("refusing to write the report over the input file");
  if (existsSync(outPath) && !opts.overwrite) throw new Error(`report exists, not overwriting without overwrite flag: ${outPath}`);
  const knownDur = typeof opts.durationSec === "number" ? opts.durationSec : null;
  let report: TranscriptQaFullReport;
  try {
    const parsed: unknown = JSON.parse(readFileSync(opts.inputPath, "utf8"));
    report = buildTranscriptQaReport(parsed, opts.durationSec);
  } catch (e) {
    report = failReport(`unreadable or malformed input: ${(e as Error).message}`, knownDur);
  }
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", { flag: opts.overwrite ? "w" : "wx" });
  return { outPath, report };
}
