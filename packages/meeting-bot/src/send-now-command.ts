/**
 * packages/meeting-bot/src/send-now-command.ts - T-039: the first caller of the `planSendNow` planner.
 * `lkb send-now <url> [--until HH:MM]` plans, then delegates to the EXISTING `runRecord` with the
 * planner's normalised URL. Dependencies are injected so the command is testable without a browser.
 *
 * Exit convention (cli.ts `main().catch` sets exitCode 1 for any thrown Error; nothing else exists):
 * 0 = handed to runRecord and it returned; 1 = refused (message printed, nothing launched); usage and
 * `--until` errors THROW, exactly as `runRecord` does for its own usage error.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { planSendNow, type SendNowJob, type SendNowRefusal } from "./send-now.js";
import { assertTenantTag } from "./calendar/state-tenant-tag.js";
import { liveRecordingDir, readLiveRecordings, type LiveProbes } from "./live-recording/live-recording.js";
import { claimedRecordWithDefaults } from "./live-recording/claimed-record.js";

export interface SendNowDeps {
  /** Live jobs for the duplicate check. MUST THROW when the state cannot be read: that is "cannot tell", never "no jobs". */
  readLiveJobs: () => SendNowJob[] | Promise<SendNowJob[]>;
  runRecord: (rest: string[]) => Promise<void>;
  now: () => Date;
  write: (line: string) => void;
  /** Early `--until` check (wired to record-commands `todayAt`); runRecord re-validates regardless. */
  validateUntil?: (value: string) => unknown;
}

const USAGE = "usage: lkb send-now <meeting-url> [--until HH:MM]";

/** Reason -> one-line message. `detail` is planner-supplied and is only ever a protocol, port, hostname or meeting key. */
export const REFUSAL_MESSAGES: Record<SendNowRefusal, (detail?: string) => string> = {
  "invalid-input": () => "the meeting link is not text",
  "invalid-clock": () => "the system clock gave no valid time",
  "empty-url": () => "no meeting link was given",
  "url-too-long": () => "the meeting link is too long (limit 2048 characters)",
  "malformed-url": (d) => `the meeting link is not a valid URL${d ? ` (${d})` : ""}`,
  "not-https": (d) => `the meeting link must use https${d ? `, not ${d}` : ""}`,
  "credentials-in-url": (d) => `the meeting link contains a username or password${d ? ` (host ${d})` : ""}; remove it and use a plain meeting link`,
  "unexpected-port": (d) => `the meeting link names a port${d ? ` (${d})` : ""}; meeting links do not use one`,
  "embedded-redirect": () => "the meeting link carries a redirect to another address; use the direct meeting link",
  "unsupported-host": (d) => `${d ?? "this host"} is not a supported meeting platform`,
  "not-a-meeting-url": (d) => `${d ?? "this host"} is supported but the link does not name a single meeting`,
  "duplicate-live-job": (d) => `a bot is already queued, joining or recording for this meeting${d ? ` (${d})` : ""}; not sending a second one`,
};

/** Host of a URL-ish string with any userinfo removed, or undefined. Never returns a username or password. */
export function hostOnly(raw: string): string | undefined {
  const m = /^\s*[a-z][a-z0-9+.-]*:\/\/([^/?#\\]*)/i.exec(raw);
  if (!m) return undefined;
  const host = m[1]!.slice(m[1]!.lastIndexOf("@") + 1);
  return /^[a-z0-9.-]{1,253}$/i.test(host) ? host.toLowerCase() : undefined;
}

function parseRest(rest: string[]): { url: string; until?: string } {
  const [url, ...flags] = rest;
  if (!url || url.startsWith("--")) throw new Error(USAGE);
  if (flags.length === 0) return { url };
  if (flags.length === 2 && flags[0] === "--until" && flags[1] && !flags[1].startsWith("--")) return { url, until: flags[1] };
  throw new Error(USAGE);
}

/** Returns the process exit code (0 launched-and-finished, 1 refused). Throws on usage / `--until` / runRecord errors. */
export async function runSendNow(rest: string[], deps: SendNowDeps): Promise<number> {
  const { url, until } = parseRest(rest);
  if (until !== undefined) deps.validateUntil?.(until);

  let liveJobs: SendNowJob[];
  try {
    liveJobs = await deps.readLiveJobs();
  } catch (err) {
    deps.write(`send-now refused: cannot tell whether a bot is already in this meeting (${err instanceof Error ? err.message : String(err)}); nothing was launched`);
    return 1;
  }

  const plan = planSendNow(url, deps.now(), liveJobs);
  if (!plan.ok) {
    const detail = plan.reason === "credentials-in-url" ? hostOnly(url) : plan.detail;
    deps.write(`send-now refused: ${REFUSAL_MESSAGES[plan.reason](detail)}`);
    return 1;
  }
  // The normalised request URL, never the raw argument. No --until: runRecord's own rule applies (it throws its usage error).
  await deps.runRecord([plan.request.meetingUrl, ...(until !== undefined ? ["--until", until] : [])]);
  return 0;
}

/** Where live jobs can be found today (see the manifest): the poller's operations rows carry status but NO url;
 * the task-scheduler's per-job files carry url but NO status. They are joined on sessionId. Neither store is
 * written by `runRecord`; manual and poller recordings are covered by `readAllLiveJobs` (live-recording view). */
export interface LiveJobSources { operationsFile: string; scheduledDir: string; tenantId: string }

/** "No jobs": operations.json absent (readWebinarOperationState returns an empty state) and/or no scheduled dir.
 * "Cannot tell" (THROWS): operations.json unreadable, over its size cap, invalid JSON, wrong shape or tenant;
 * any scheduled/*.json that is unreadable, not JSON, or lacks string url/sessionId. Do NOT use `readScheduleState`
 * or `readScheduledJob` here: both turn a corrupt file into `{}` / `null`, i.e. into "no jobs". */
export function readLiveJobs(
  src: LiveJobSources, now: Date,
  readOperations: (file: string, tenantId: string, checkedAt: string) => { operations: Record<string, Record<string, any>> },
): SendNowJob[] {
  const ops = readOperations(src.operationsFile, src.tenantId, now.toISOString()).operations;
  if (!existsSync(src.scheduledDir)) return [];
  const jobs: SendNowJob[] = [];
  for (const name of readdirSync(src.scheduledDir).filter((n) => n.endsWith(".json"))) {
    let job: { url?: unknown; sessionId?: unknown; until?: unknown };
    try { job = JSON.parse(readFileSync(path.join(src.scheduledDir, name), "utf8")); }
    catch { throw new Error(`scheduled job file ${name} is unreadable or not JSON`); }
    if (!job || typeof job !== "object" || typeof job.url !== "string" || typeof job.sessionId !== "string") {
      throw new Error(`scheduled job file ${name} has an unexpected shape`);
    }
    assertTenantTag(job, src.tenantId, `scheduled/${name}`); // ISS-ALERTID-006: untagged / other-tenant job file = cannot tell (throws)
    const row = Object.hasOwn(ops, job.sessionId) ? ops[job.sessionId] : undefined;
    // No operations row: still queued while `until` is ahead (or unparseable: fail closed); past `until` it has ended.
    const until = typeof job.until === "string" ? Date.parse(job.until) : NaN;
    jobs.push({ meetingUrl: job.url, status: row ? row.status : Number.isFinite(until) && until <= now.getTime() ? "ready" : "queued" });
  }
  return jobs;
}

/** ISS-T039CMD-001/-002: scheduler jobs PLUS every recorder that claimed a meeting in the live-recording view (manual, poller, scheduler, send-now).
 * Either half throwing = "cannot tell" (callers refuse). */
export function readAllLiveJobs(
  src: LiveJobSources & { recordingsDir: string }, now: Date,
  readOperations: Parameters<typeof readLiveJobs>[2], probes?: LiveProbes,
): SendNowJob[] {
  return [...readLiveJobs(src, now, readOperations), ...readLiveRecordings({ dir: src.recordingsDir, tenantId: src.tenantId }, now, probes)];
}

/** Real wiring for cli.ts. Dynamic imports keep this module's tests free of the OBS/browser dependency graph. */
export async function defaultSendNowDeps(): Promise<SendNowDeps> {
  const [{ runRecord, captureTenant, todayAt }, { readWebinarOperationState }] = await Promise.all([
    import("./capture/record-commands.js"), import("./calendar/schedule-state.js"),
  ]);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const now = () => new Date();
  return {
    runRecord: (rest) => claimedRecordWithDefaults(rest, runRecord), now, write: (line) => console.error(line), validateUntil: todayAt,
    readLiveJobs: () => readAllLiveJobs(
      { operationsFile: path.join(root, "data", "webinar-release", "operations.json"), scheduledDir: path.join(root, "raw", "webinars", "scheduled"), recordingsDir: liveRecordingDir(root), tenantId: captureTenant([]) },
      now(), readWebinarOperationState),
  };
}
