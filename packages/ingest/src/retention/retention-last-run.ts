/**
 * packages/ingest/src/retention/retention-last-run.ts - T-046. The compact "last retention run" summary that the
 * /meeting-bot page will read (endpoint and UI are follow-ups). Written to `data/retention/last-run.json` by the purge
 * job when `lastRunFile` is set (the job CLI defaults it to <cwd>/data/retention/last-run.json, or $LKB_RETENTION_LAST_RUN).
 *
 * SHAPE (version 1), all fields always present, numbers are integers, no transcript/title/path text:
 *   {
 *     "version": 1,
 *     "mode": "dry-run" | "execute",
 *     "dryRun": boolean,            // true unless --execute was passed (deletion stays dry-run by default)
 *     "startedAt": ISO-8601, "finishedAt": ISO-8601,
 *     "exitCode": number,           // executor codes: 0 done, 2 usage, 3 unreadable state, 4 item failed, 5 report not writable
 *     "ok": boolean,                // exitCode === 0 and a SUMMARY line was produced
 *     "candidates": number | null,  // recordings eligible to purge (would-purge in a dry run)
 *     "deleted": number | null, "bytes": number | null, "vetoed": number | null, "failed": number | null,
 *     "clipsRetained": number | null, // D-008 evidence clips present after the run (execute mode with extraction), else null
 *     "reportFile": string          // the full line-by-line JobReport this was derived from
 *   }
 * `null` counts mean the run died before the executor produced its SUMMARY line (e.g. unreadable state).
 */
/** Structural subset of the job's report (kept local: importing JobReport would make a module cycle). */
export interface LastRunInput {
  mode: "dry-run" | "execute";
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  summary: { candidates: number; deleted: number; bytes: number; vetoed: number; failed: number } | null;
  lines: readonly string[];
}

export const LAST_RUN_VERSION = 1;

export interface LastRun {
  version: typeof LAST_RUN_VERSION;
  mode: LastRunInput["mode"];
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  ok: boolean;
  candidates: number | null;
  deleted: number | null;
  bytes: number | null;
  vetoed: number | null;
  failed: number | null;
  clipsRetained: number | null;
  reportFile: string;
}

const CLIPS_RE = /^CLIPS retained=(\d+)$/;

export function buildLastRun(report: LastRunInput, reportFile: string): LastRun {
  let clips: number | null = null;
  for (let i = report.lines.length - 1; i >= 0; i--) {
    const m = CLIPS_RE.exec(report.lines[i] ?? "");
    if (m) { clips = Number(m[1]); break; }
  }
  const s = report.summary;
  return {
    version: LAST_RUN_VERSION, mode: report.mode, dryRun: report.mode === "dry-run",
    startedAt: report.startedAt, finishedAt: report.finishedAt, exitCode: report.exitCode,
    ok: report.exitCode === 0 && s !== null,
    candidates: s?.candidates ?? null, deleted: s?.deleted ?? null, bytes: s?.bytes ?? null,
    vetoed: s?.vetoed ?? null, failed: s?.failed ?? null, clipsRetained: clips, reportFile,
  };
}
