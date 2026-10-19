/** Scheduling and HTTP acquisition with explicit ownership and persistent job identity. */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CalendarEvent } from "./calendar-client.js";
import {
  selectAutoRecordItems, loadTrustedSenderConfig, redactJoinLink,
  type AutoRecordCandidateInput, type AutoRecordItem,
} from "./auto-join.js";
import { describeSkip } from "./state/skip-describe.js";
import { requireStateTenant } from "./state/state-tenant-tag.js";
import { recordSkipped } from "./state/skipped-state.js";
import { createKeyTenantLoader } from "./join-rules-wiring/key-tenant.js";
import { scheduledDispatchIdentity } from "./scheduled-dispatch.js";
import { enforceJoinRules, parseJoinRulesEnforce, type JoinRulesEnforceIo } from "./join-rules/join-rules-enforce.js";
import { projectApprovedSenderTrust, type ApprovedTrustContext } from "./join-rules/join-rules-approved-trust.js";
import { classifyWebinarInvite } from "./auto-record-policy.js";
import { loadScheduledKeysForTick, recordScheduled, writeScheduledJob, type WebinarCalendarAcquisition } from "./state/schedule-state.js";
import { createHttpCandidateLoader, createHttpCalendarLoader } from "./schedule-loaders.js";
import { createWindowsTaskScheduler, deriveJobKey, type TaskScheduler } from "./task-scheduler.js";
import { withdrawCancelledLaunches } from "./state/schedule-withdraw.js";
import { announceScheduled, buildAutojoinTickDeps, createTopicLookup, dropOwnMarkerEvents, writeCaptureTags, type AutojoinTickDeps } from "../autojoin/tick-wiring.js";
export {
  createHttpCandidateLoader, createHttpCalendarLoader, loadNoCalendarEvents, loadWebinarSourcesWithHealth, type WebinarFeedHealth,
} from "./schedule-loaders.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const DEFAULT_STATE_DIR = path.join(REPO_ROOT, "raw", "webinars");
const DEFAULT_LEAD_MINUTES = 5;
const RECORD_LAUNCHER = path.join(REPO_ROOT, "scripts", "webinar", "start-record-detached.ps1");

export interface ScheduleTickDeps {
  loadCalendarEvents: () => Promise<CalendarEvent[]>;
  loadCalendarAcquisition?: (syncToken?: string, requestStartedAt?: string) => Promise<WebinarCalendarAcquisition>;
  loadCandidates: (refresh?: boolean) => Promise<AutoRecordCandidateInput[]>;
  now: () => string;
  stateDir: string;
  /** Tenant that owns the dedup/job state files under stateDir (LKB_TENANT_ID). Absent or invalid = the tick refuses, before anything is read or scheduled (ISS-ALERTID-006). */
  stateTenantId?: string;
  scheduler: TaskScheduler;
  log: (msg: string) => void;
  everyWebinar?: boolean;
  /** RAW value of LKB_JOIN_RULES_ENFORCE (parsed only in join-rules-enforce.ts; absent/unknown = `off` = today's behaviour). */
  joinRulesEnforce?: unknown;
  /** This tick's own tenant (LKB_TENANT_ID); join rules are loaded for this tenant only. */
  joinRulesTenantId?: string;
  /** The API key's tenant when already known (test seam); `null` = could not be verified. */
  joinRulesKeyTenantId?: unknown;
  /** Production: verifies the key's tenant (one `GET /webinar-operations`, header `X-LKB-Tenant`); called ONLY when enforcement is enabled. */
  loadKeyTenant?: () => Promise<string | null>;
  joinRulesIo?: JoinRulesEnforceIo;
  /** Autojoin (decision 2026-10-14): topic priority, extended webinar detection, test-data tags and alerts. Absent = today's behaviour exactly. */
  autojoin?: AutojoinTickDeps;
}

export function buildRealScheduleTickDeps(): ScheduleTickDeps {
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiUrl = (process.env.LKB_API_URL ?? "http://localhost:3300").replace(/\/$/, "");
  const log = (msg: string) => console.log(`[bot] ${msg}`);
  const autojoin = buildAutojoinTickDeps(REPO_ROOT, DEFAULT_STATE_DIR, process.env, log);
  const discoveryOff = autojoin !== undefined && !autojoin.cfg.discovery; // config says discovery is off: the tick sees no events and schedules nothing
  return {
    autojoin,
    loadCalendarEvents: discoveryOff ? async () => [] : createHttpCalendarLoader(apiUrl, process.env.LKB_API_KEY),
    loadCandidates: discoveryOff ? async () => [] : createHttpCandidateLoader(apiUrl, process.env.LKB_API_KEY, log, true),
    everyWebinar: true,
    joinRulesEnforce: process.env.LKB_JOIN_RULES_ENFORCE,
    joinRulesTenantId: process.env.LKB_TENANT_ID,
    stateTenantId: process.env.LKB_TENANT_ID,
    loadKeyTenant: createKeyTenantLoader(apiUrl, process.env.LKB_API_KEY, log),
    now: () => new Date().toISOString(),
    stateDir: DEFAULT_STATE_DIR,
    scheduler: createWindowsTaskScheduler(),
    log,
  };
}

// taskNameFor was removed in fix cycle 2 (ISS-317): the Scheduled Task name is now derived
// inside task-scheduler.ts's scheduleOnce, from the already-validated jobKey (buildTaskName),
// never built here from an unvalidated sessionKey.

const seriesOf = (events: CalendarEvent[], id: string) => {
  const series = events.find(e => e.id === id)?.recurringEventId;
  return series ? {recurringEventId: series} : {};
};

function describeToSchedule(item: AutoRecordItem): string {
  return `  schedule — ${item.source}:${item.sourceId} "${item.title}" ${item.startTime} -> ${item.endTime} ` +
    `join: ${redactJoinLink(item.meetingUrl)}`;
}

/**
 * Runs one tick: load -> select -> (dry-run: print) or (real: schedule a one-off Windows task
 * per item + record it in the dedup state). Returns the selection result so tests/CLI callers
 * can assert on it without re-parsing log lines.
 */
export async function runScheduleTickOnce(deps: ScheduleTickDeps, dryRun: boolean) {
  const [loadedEvents, candidates] = await Promise.all([deps.loadCalendarEvents(), deps.loadCandidates()]);
  const aj = deps.autojoin, ownEvents = aj ? dropOwnMarkerEvents(loadedEvents) : loadedEvents;
  // A cancelled series cancels its still-listed occurrences; a cancelled occurrence (it carries recurringEventId) never cancels the series.
  const cancelledSeries = new Set(ownEvents.filter(e => e.cancelled && !e.recurringEventId).map(e => e.id));
  const calendarEvents = ownEvents.map(e => e.recurringEventId && cancelledSeries.has(e.recurringEventId) && !e.cancelled ? {...e, cancelled: true} : e);
  const lookup = aj ? createTopicLookup(aj, calendarEvents, candidates) : undefined;
  const now = deps.now();
  const trustedSenders = loadTrustedSenderConfig();
  // Fail closed (ISS-ALERTID-006): no valid tenant, or an untagged / other-tenant state file, stops the tick before anything is scheduled.
  const stateTenant = requireStateTenant(deps.stateTenantId);
  // ISS-ALERTWHOFIX-001: a corrupt dedup file must not stop joining. Quarantine it (kept), warn loudly, proceed with an empty set.
  const alreadyScheduled = loadScheduledKeysForTick(deps.stateDir, stateTenant, {
    readOnly: dryRun,
    onQuarantine: (name) => deps.log(`  WARNING: schedule-state.json was corrupt; moved aside as ${name} (dedup history in it is NOT merged back; sessions still in the join window may be re-scheduled, which is idempotent; inspect it)`),
    onCorruptUnmoved: (why) => deps.log(`  WARNING: schedule-state.json is corrupt and could not be moved aside (${why}); proceeding with EMPTY dedup state so meetings are still joined`),
  });

  const select = (authority?: ApprovedTrustContext) => selectAutoRecordItems({
    calendarEvents, candidates, now, leadMinutes: DEFAULT_LEAD_MINUTES, trustedSenders, alreadyScheduled,
    everyWebinar: deps.everyWebinar, ...lookup?.hooks,
  }, { trustedSendersForCandidate: authority?.configuredTenantId === stateTenant ? candidate => projectApprovedSenderTrust({context: authority,
    candidate, base: trustedSenders, classification: lookup?.hooks.classifyInvite?.({title: candidate.title,
      meetingUrl: candidate.meetingUrl, sender: candidate.senderEmail}) ?? classifyWebinarInvite(candidate.title),
    leadMinutes: DEFAULT_LEAD_MINUTES}) : undefined });
  const selected = select();
  // Veto-only join rules (T-037); `off` (the default) returns `selected` itself without opening the store.
  // Key tenant (ISS-T037WIRE-001): fetched per tick, only when enforcing; a throwing loader means "unverified" (null).
  const keyTenantId = deps.joinRulesKeyTenantId === undefined && deps.loadKeyTenant && parseJoinRulesEnforce(deps.joinRulesEnforce) !== "off"
    ? await deps.loadKeyTenant().catch(() => null) : deps.joinRulesKeyTenantId;
  const result = await enforceJoinRules(selected, {
    mode: deps.joinRulesEnforce, tenantId: deps.joinRulesTenantId, keyTenantId, stateDir: deps.stateDir, log: deps.log, io: deps.joinRulesIo,
    now: () => Date.parse(now), readOnly: dryRun, onDegraded: aj?.rulesDegraded, onHealthy: aj?.rulesHealthy,
    selectWithRules: deps.everyWebinar ? undefined : select,
  });

  deps.log(`schedule-tick: ${result.toSchedule.length} to schedule, ${result.skipped.length} skipped ` +
    `(${calendarEvents.length} calendar event(s), ${candidates.length} candidate(s), now=${now})`);
  for (const item of result.toSchedule) deps.log(describeToSchedule(item));
  for (const s of result.skipped) deps.log(describeSkip(s));

  if (!dryRun) { // A cancellation stops launches already scheduled, not only new ones (ISS-WEBINARRELEASE-013).
    try {
      await withdrawCancelledLaunches({stateDir: deps.stateDir, tenantId: stateTenant, scheduler: deps.scheduler, log: deps.log,
        cancelledEventIds: ownEvents.filter(e => e.cancelled).map(e => e.id), // raw feed rows: an outsider's look-alike tombstone has a different id
        cancelledSeriesIds: [...cancelledSeries]});
    } catch (err) { deps.log(`  could not withdraw cancelled launches: ${err instanceof Error ? err.message : String(err)}`); }
  }

  if (dryRun) {
    deps.log("schedule-tick: --dry-run — nothing scheduled, nothing written to state");
    return result;
  }

  // ISS-ALERTID-001/-007 (D-134): remember skipped sessions (key + start + source only) so `lkb alert-who` can resolve their alert ids.
  try {
    recordSkipped(deps.stateDir, stateTenant, result.skipped, now, (s) =>
      s.source === "calendar" ? calendarEvents.find((e) => e.id === s.sourceId)?.startTime : candidates.find((c) => c.id === s.sourceId)?.startTime,
      { onQuarantine: (name) => deps.log(`  WARNING: skipped-sessions.json was corrupt; moved aside as ${name} (history in it is NOT merged back; inspect it)`) });
  } catch (err) { deps.log(`  could not record skipped sessions: ${err instanceof Error ? err.message : String(err)}`); }

  for (const item of result.toSchedule) {
    // ISS-317 fix: no title/url/sessionId ever reaches the Task Scheduler command line. The
    // sensitive fields are persisted to a per-job JSON file instead, keyed by a validated
    // `jobKey` derived from the sessionKey; the launcher reads that file via `-Job <jobKey>`.
    const jobKey = deriveJobKey(item.sessionKey);
    if (!jobKey) {
      // sessionKey ids come from our own Mongo _id / calendar event id, so this should be
      // unreachable in practice — but a caller MUST refuse rather than fall back to something
      // unvalidated (ISS-317's own fix direction), so this is a hard skip, not a crash.
      deps.log(`  refused to schedule ${item.sessionKey}: sessionKey does not derive a safe job key — skipped`);
      continue;
    }
    const tags = lookup?.tagsFor(item) ?? {};
    try {
      writeScheduledJob(deps.stateDir, jobKey, {
        ...(aj ? { startTime: item.startTime, ...tags } : {}),
        url: item.meetingUrl,
        // ISS-319 fix: the FULL ISO end datetime, not a bare local HH:mm — so a session that
        // crosses midnight doesn't resolve to a stop time ~24h in the past (record-commands.ts's
        // `todayAt` now accepts either form).
        until: item.endTime,
        title: item.title,
        sessionId: item.sessionKey,
        dispatchPolicyV1: scheduledDispatchIdentity(item),
        ...(item.source === "calendar" ? seriesOf(calendarEvents, item.sourceId) : {}),
      }, stateTenant);
    } catch (err) {
      // ISS-321: writeScheduledJob refuses (throws) when jobKey already belongs to a different
      // session — never silently overwrite another session's scheduled recording. Skip only this
      // item, loudly, rather than let one collision crash the whole tick's remaining items (same
      // "never crash a poller tick" contract as the other refusal path above and the HTTP loader).
      deps.log(`  refused to schedule ${item.sessionKey} (job ${jobKey}): ` +
        `${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (aj) writeCaptureTags(aj.tagsDir, item.sessionKey, tags, deps.log);
    await deps.scheduler.scheduleOnce({
      jobKey,
      launcherPath: RECORD_LAUNCHER,
      runAtIso: item.startTime,
    });
    try {
      recordScheduled(deps.stateDir, { sessionKey: item.sessionKey, title: item.title, scheduledAt: now }, stateTenant,
        { onQuarantine: (name) => deps.log(`  WARNING: schedule-state.json was corrupt; moved aside as ${name} (dedup history in it is NOT merged back; inspect it)`) });
    } catch (err) {
      // The one-off task is already created; a failed dedup write must not abort the remaining items' scheduling.
      deps.log(`  WARNING: scheduled ${item.sessionKey} but could not record it in schedule-state.json: ${err instanceof Error ? err.message : String(err)}`);
    }
    deps.log(`  scheduled: ${item.sessionKey} via one-off Windows task (job ${jobKey})`);
    await announceScheduled(aj, item, tags, deps.log);
  }
  if (aj?.watchCaptures) await aj.watchCaptures().catch((e: unknown) => deps.log(`  autojoin: capture watch failed: ${e instanceof Error ? e.message : String(e)}`));

  return result;
}

export function parseScheduleTickArgs(rest: string[]): { dryRun: boolean } {
  return { dryRun: rest.includes("--dry-run") };
}

export async function runScheduleTick(rest: string[]): Promise<void> {
  const { dryRun } = parseScheduleTickArgs(rest);
  const deps = buildRealScheduleTickDeps();
  const autojoinOff = deps.autojoin !== undefined && !deps.autojoin.cfg.webinarAutoJoin;
  if (autojoinOff && !dryRun) deps.log("schedule-tick: autojoin config has webinarAutoJoin off - running as --dry-run (nothing scheduled)");
  await runScheduleTickOnce(deps, dryRun || autojoinOff);
}
