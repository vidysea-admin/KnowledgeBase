/**
 * Withdraws scheduled launches whose Calendar meeting was cancelled (ISS-WEBINARRELEASE-013; D-178 ruling 3: a real cancellation stops the launch).
 * The saved job file is the launch gate: `record-scheduled` refuses when it is gone, so it is deleted FIRST; the one-off task and the dedup entry follow.
 * Matching is by the job's own Calendar event id. An occurrence cancellation withdraws that occurrence only; a series cancellation (a cancelled event that is not itself an instance)
 * withdraws the saved occurrences that carry its id as `recurringEventId`. Neither direction widens to the other.
 */
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { readScheduledJob, removeScheduled, scheduledJobFilePath, type ScheduledJob } from "./schedule-dedup-state.js";
import type { TaskScheduler } from "../task-scheduler.js";

export interface WithdrawInput {
  stateDir: string; tenantId: string; scheduler: Pick<TaskScheduler, "cancelOnce">; log: (message: string) => void;
  /** Ids of Calendar events on OUR calendar that are themselves cancelled (read from the raw feed, never from the selector's identity barrier). */
  cancelledEventIds: readonly string[];
  /** Ids of cancelled Calendar events that are not instances: series masters (or plain events, which then match no saved occurrence). */
  cancelledSeriesIds: readonly string[];
}

/**
 * Exact own-event match only (ISS-TOMBSTONE-005). The selector's identity barrier rewrites session keys when ANY cancelled row copies a
 * meeting's link and start, so an outsider's tombstone would reach our job through the key. The job's own calendar event id cannot be copied that way.
 * A Gmail-sourced job has no Calendar event of its own and is never withdrawn here.
 */
function matches(job: ScheduledJob, input: WithdrawInput): boolean {
  const own = job.dispatchPolicyV1;
  if (own?.source === "calendar" && input.cancelledEventIds.includes(own.sourceId)) return true;
  return typeof job.recurringEventId === "string" && input.cancelledSeriesIds.includes(job.recurringEventId);
}

/** Returns the job keys withdrawn. Never throws for one bad job: that job is logged and left for the dispatch-time recheck. */
export async function withdrawCancelledLaunches(input: WithdrawInput): Promise<string[]> {
  if (input.cancelledEventIds.length === 0 && input.cancelledSeriesIds.length === 0) return [];
  const dir = path.dirname(scheduledJobFilePath(input.stateDir, "x"));
  if (!existsSync(dir)) return [];
  const withdrawn: string[] = [];
  for (const name of readdirSync(dir)) {
    const m = /^([a-z0-9-]{1,64})\.json$/.exec(name);
    if (!m) continue;
    const jobKey = m[1]!;
    try {
      const job = readScheduledJob(input.stateDir, jobKey, input.tenantId); // another tenant's or untagged file throws: not ours
      if (!job || !matches(job, input)) continue;
      try { unlinkSync(scheduledJobFilePath(input.stateDir, jobKey)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      withdrawn.push(jobKey);
      try { await input.scheduler.cancelOnce?.(jobKey); }
      catch (e) { input.log(`  withdrew ${job.sessionId} (job ${jobKey}) but the one-off task could not be removed; it will refuse at launch: ${e instanceof Error ? e.message : String(e)}`); }
      removeScheduled(input.stateDir, job.sessionId, input.tenantId);
      input.log(`  withdrawn: ${job.sessionId} (job ${jobKey}) - its Calendar meeting was cancelled`);
    } catch (e) { input.log(`  could not withdraw job ${jobKey}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return withdrawn;
}
