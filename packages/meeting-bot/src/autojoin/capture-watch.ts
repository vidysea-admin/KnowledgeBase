/**
 * Capture lifecycle alerts without touching the capture code: each schedule tick compares the scheduled jobs it wrote with what the
 * recorder left behind (the controller state file `.record-state.json` + pid liveness, and the registered output source.json) and
 * raises capture-started / capture-stopped-early / capture-failed / capture-done once each (alerts.ts dedups across ticks).
 * Resolution is therefore one tick (5 minutes). Read-only: it never starts, stops or edits a recording.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { readScheduledJob, type ScheduledJob } from "../calendar/state/schedule-dedup-state.js";
import { isPidAlive as realIsPidAlive, readControllerState as realReadState, type RecordState } from "../capture/controller-state.js";
import type { AlertInput } from "./alerts.js";

export interface CaptureWatchDeps {
  stateDir: string; tenantId: string; now: () => string; log: (m: string) => void;
  raise: (a: AlertInput) => Promise<unknown>;
  readState?: (recordDir: string) => RecordState | undefined;
  isPidAlive?: (pid: number) => boolean;
  /** Repo-relative path of the registered output for a session, or undefined when nothing was registered. */
  outputFor: (sessionId: string) => string | undefined;
}
const GRACE_MS = 5 * 60_000, NEVER_STARTED_AFTER_MS = 10 * 60_000, LOOKBACK_MS = 2 * 24 * 3_600_000;

export async function watchCaptures(d: CaptureWatchDeps): Promise<number> {
  const dir = path.join(d.stateDir, "scheduled");
  if (!existsSync(dir)) return 0;
  const now = Date.parse(d.now()), state = (d.readState ?? realReadState)(d.stateDir), alive = d.isPidAlive ?? realIsPidAlive;
  let raised = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    let job: ScheduledJob | null;
    try { job = readScheduledJob(d.stateDir, name.slice(0, -5), d.tenantId); } catch { continue; } // another tenant's or untagged file: not ours
    if (!job || !job.startTime) continue; // jobs from before autojoin carry no start time: nothing to compare
    const start = Date.parse(job.startTime), until = Date.parse(job.until);
    if (Number.isNaN(start) || Number.isNaN(until) || now < start || now - until > LOOKBACK_MS) continue;
    const base = { sessionKey: job.sessionId, title: job.title, startTime: job.startTime, endTime: job.until, careerGuidance: job.careerGuidance, testData: job.testData, matchedKeywords: job.matchedKeywords };
    const output = d.outputFor(job.sessionId);
    const active = state?.sessionId === job.sessionId && alive(state.pid);
    const send = async (a: Pick<AlertInput, "kind"> & Partial<AlertInput>) => { await d.raise({ ...base, ...a }); raised++; };
    try {
      if (active) await send({ kind: "capture-started" });
      else if (output && now >= until - GRACE_MS) await send({ kind: "capture-done", outputPath: output });
      else if (output) await send({ kind: "capture-stopped-early", outputPath: output, detail: `The recorder is no longer running ${Math.round((until - now) / 60000)} min before the scheduled end; what was captured is kept.` });
      else if (now >= until - GRACE_MS) await send({ kind: "capture-failed", detail: "The scheduled window ended and no recording was registered." });
      else if (now - start >= NEVER_STARTED_AFTER_MS) await send({ kind: "capture-failed", detail: "The bot did not start recording (no recorder process found) after the scheduled start." });
    } catch (e) { d.log(`  capture-watch: ${job.sessionId}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return raised;
}
