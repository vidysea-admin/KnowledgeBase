/**
 * packages/ingest/src/retention/retention-purge-job.ts - T-046 / D-145. The SCHEDULABLE wrapper around the raw-media
 * purge executor: runs one purge pass, captures its log lines, and atomically writes a last-run report file that an
 * operator (or a later API/page unit) can read. DRY RUN unless `--execute` is passed; the wrapper adds no other way to
 * delete. Report lines come from the executor, which logs media path, age and size only (never transcript text).
 *
 * Extra option: `--report-file <path>` (required). Every other option is forwarded to `runRetentionPurge` unchanged,
 * so the executor's strict parser still rejects anything unknown and the thresholds still have no default (ARCHITECTURE Q6).
 * Exit codes are the executor's (0 done, 2 usage, 3 unreadable state, 4 item failed) plus 5 = report file not writable.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runRetentionPurge, type PurgeDeps } from "./retention-purge.js";

export const REPORT_VERSION = 1;
export const MAX_REPORT_LINES = 2000;

export interface JobReport {
  version: typeof REPORT_VERSION;
  mode: "dry-run" | "execute";
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  summary: { candidates: number; deleted: number; bytes: number; vetoed: number; failed: number } | null;
  truncated: boolean;
  lines: string[];
}

export interface JobIo { writeReport: (absPath: string, json: string) => void }
export const REAL_JOB_IO: JobIo = {
  writeReport: (p, json) => {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, json, "utf8");
    renameSync(tmp, p);
  },
};

export interface JobDeps extends PurgeDeps { jobIo?: JobIo; /** test seam: line cap, default MAX_REPORT_LINES */ maxLines?: number }

const SUMMARY_RE = /^SUMMARY mode=\S+ candidates=(\d+) deleted=(\d+) bytes=(\d+) vetoed=(\d+) failed=(\d+)$/;

export function parseSummary(lines: readonly string[]): JobReport["summary"] {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = SUMMARY_RE.exec(lines[i] ?? "");
    if (m) return { candidates: Number(m[1]), deleted: Number(m[2]), bytes: Number(m[3]), vetoed: Number(m[4]), failed: Number(m[5]) };
  }
  return null;
}

/** Splits `--report-file` out of argv; `--execute` is left in place for the executor. */
export function splitJobArgs(argv: readonly string[]): { ok: true; reportFile: string; rest: string[] } | { ok: false; message: string } {
  const rest: string[] = [];
  let reportFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--report-file" || a.startsWith("--report-file=")) {
      if (reportFile !== undefined) return { ok: false, message: "--report-file given more than once" };
      const v = a === "--report-file" ? argv[++i] : a.slice("--report-file=".length);
      if (v === undefined || v === "" || v.startsWith("--") || /\p{Cc}/u.test(v)) return { ok: false, message: "--report-file needs a path" };
      reportFile = v;
    } else rest.push(a);
  }
  if (reportFile === undefined) return { ok: false, message: "--report-file is required: a scheduled run must leave its report somewhere" };
  return { ok: true, reportFile: resolve(reportFile), rest };
}

export function runPurgeJob(argv: readonly string[], deps: JobDeps): number {
  const split = splitJobArgs(argv);
  if (!split.ok) { deps.error(`retention-purge-job: ${split.message}`); return 2; }
  const lines: string[] = [];
  const startedAt = new Date(deps.now()).toISOString();
  const capture = (line: string): void => { lines.push(line); };
  const code = runRetentionPurge(split.rest, {
    ...deps,
    write: (l) => { capture(l); deps.write(l); },
    error: (l) => { capture(`ERROR ${l}`); deps.error(l); },
  });
  const cap = deps.maxLines ?? MAX_REPORT_LINES;
  const report: JobReport = {
    version: REPORT_VERSION,
    mode: split.rest.includes("--execute") ? "execute" : "dry-run",
    startedAt, finishedAt: new Date(deps.now()).toISOString(), exitCode: code,
    summary: parseSummary(lines), truncated: lines.length > cap,
    lines: lines.length > cap ? [...lines.slice(0, cap - 1), lines[lines.length - 1] as string] : lines,
  };
  try {
    (deps.jobIo ?? REAL_JOB_IO).writeReport(split.reportFile, `${JSON.stringify(report, null, 2)}\n`);
  } catch (e) {
    deps.error(`retention-purge-job: could not write the report file (${(e as NodeJS.ErrnoException).code ?? "error"})`);
    return code === 0 ? 5 : code;
  }
  return code;
}
