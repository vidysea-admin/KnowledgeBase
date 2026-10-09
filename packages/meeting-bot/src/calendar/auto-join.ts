/**
 * packages/meeting-bot/src/calendar/auto-join.ts — T-025 C2 + U5 (u5-auto-record-scheduler).
 * Pure decisions: which calendar events / meeting candidates should trigger an auto-join capture
 * right now. No I/O, no scheduling itself — `schedule-tick.ts` composes this with the real
 * scheduler.
 *
 * Webinar-release mode follows D-056: classify first, preserve rejection/registration.
 */
import type { CalendarEvent, TrustedSenderConfig, AutoRecordCandidateInput, AutoRecordItem, SkipReason, SkippedItem, SelectAutoRecordItemsInput, SelectAutoRecordItemsResult } from "@lkb/core";
import { isTrustedSender, classifyWebinarInvite, webinarIdentity, webinarSessionKey } from "./auto-record-policy.js";
// Re-exported so existing callers/tests that imported these from auto-join.js before the U5
// LOC-budget split (see auto-record-policy.ts's header) keep working without an import-path change.
export { redactJoinLink, loadTrustedSenderConfig } from "./auto-record-policy.js";
export { isTrustedSender, type TrustedSenderConfig };

/**
 * Includes an event iff it has a `meetingUrl` AND `now` falls within
 * `[startTime - leadMinutes, endTime]` — never more than `leadMinutes` early, never after the
 * event's own end. Returns matches sorted by `startTime` ascending (soonest first).
 */
export function selectEventsToAutoJoin(events: CalendarEvent[], now: string,
  leadMinutes: number): CalendarEvent[] {
  const nowMs = new Date(now).getTime();
  const leadMs = leadMinutes * 60 * 1000;

  return events
    .filter((e) => {
      if (!e.meetingUrl) return false;
      const startMs = new Date(e.startTime).getTime();
      const endMs = new Date(e.endTime).getTime();
      return nowMs >= startMs - leadMs && nowMs <= endMs;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}


// U5 — selectAutoRecordItems: the richer sibling used by `cli schedule-tick`.


export type { AutoRecordCandidateInput, AutoRecordItem, SkipReason, SkippedItem, SelectAutoRecordItemsInput, SelectAutoRecordItemsResult } from "@lkb/core";

interface NormalizedItem {
  sessionKey: string;
  source: "calendar" | "gmail";
  sourceId: string;
  title: string;
  startTime?: string;
  endTime?: string;
  meetingUrl?: string;
  sender?: string;
  senderDomain?: string;
  registrationOnly?: boolean;
  /** Approved Gmail candidates bypass the legacy sender allowlist. */
  preTrusted: boolean;
  /** Explicit Gmail rejection is final; calendar has no independent approval workflow. */
  rejected: boolean;
  cancelled?: boolean;
}

function normalizeCalendarEvent(e: CalendarEvent): NormalizedItem {
  return {
    sessionKey: `cal:${e.id}`,
    source: "calendar",
    sourceId: e.id,
    title: e.title,
    startTime: e.startTime,
    endTime: e.endTime,
    meetingUrl: e.meetingUrl,
    sender: e.organizer,
    preTrusted: false,
    rejected: false,
    cancelled: e.cancelled,
  };
}

function normalizeCandidate(c: AutoRecordCandidateInput): NormalizedItem {
  return {
    sessionKey: `gmail:${c.id}`,
    source: "gmail",
    sourceId: c.id,
    title: c.title,
    startTime: c.startTime,
    endTime: c.endTime,
    meetingUrl: c.meetingUrl,
    sender: c.senderEmail,
    senderDomain: c.senderDomain,
    registrationOnly: c.registrationOnly,
    // Candidates the Gmail approval flow already decided are trusted; "pending" is not — a
    // pending candidate falls through to the same config-allowlist check a calendar organizer
    // gets, so a known-trusted sender's mail doesn't have to wait out a human click.
    preTrusted: c.status === "approved" || c.status === "auto_approved",
    rejected: c.status === "rejected",
    cancelled: c.cancelled,
  };
}

function overlaps(a: NormalizedItem, b: NormalizedItem): boolean {
  const aStart = new Date(a.startTime as string).getTime();
  const aEnd = new Date(a.endTime as string).getTime();
  const bStart = new Date(b.startTime as string).getTime();
  const bEnd = new Date(b.endTime as string).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function durationMs(item: NormalizedItem): number {
  return new Date(item.endTime as string).getTime() - new Date(item.startTime as string).getTime();
}

/** Select due webinars, retain explicit refusals, deduplicate and report one-at-a-time overlaps. */
export function selectAutoRecordItems(input: SelectAutoRecordItemsInput): SelectAutoRecordItemsResult {
  const { calendarEvents, candidates, now, leadMinutes, trustedSenders, alreadyScheduled } = input;
  const nowMs = new Date(now).getTime();
  const leadMs = leadMinutes * 60 * 1000;
  const scheduledSet = alreadyScheduled instanceof Set ? alreadyScheduled : new Set(alreadyScheduled);

  const normalized = [
    ...calendarEvents.map(normalizeCalendarEvent),
    ...candidates.map(normalizeCandidate),
  ];
  if (input.everyWebinar) {
    const barriers = new Map<string, { rejected: boolean; registration: boolean; cancelled: boolean }>();
    for (const item of normalized) {
      const identity = item.meetingUrl && item.startTime ? webinarIdentity(item.meetingUrl, item.startTime) : undefined;
      if (!identity) continue;
      const prior = barriers.get(identity);
      barriers.set(identity, { rejected: item.rejected || Boolean(prior?.rejected),
        registration: Boolean(item.registrationOnly || prior?.registration), cancelled: Boolean(item.cancelled || prior?.cancelled) });
    }
    for (const item of normalized) {
      const identity = item.meetingUrl && item.startTime ? webinarIdentity(item.meetingUrl, item.startTime) : undefined;
      const barrier = identity ? barriers.get(identity) : undefined;
      if (barrier) { item.rejected = barrier.rejected; item.registrationOnly = barrier.registration; item.cancelled = barrier.cancelled; }
    }
  }

  const skipped: SkippedItem[] = [];
  const eligible: NormalizedItem[] = [];
  const seenWebinars = new Set<string>();

  for (const item of normalized) {
    if (input.everyWebinar && item.meetingUrl && item.startTime) {
      const identity = webinarIdentity(item.meetingUrl, item.startTime);
      if (identity) item.sessionKey = webinarSessionKey(identity);
    }
    const base = { sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title };

    if (item.cancelled) { skipped.push({ ...base, reason: "cancelled" }); continue; }
    if (input.everyWebinar) {
      const kind = classifyWebinarInvite(item.title);
      if (kind !== "webinar") {
        skipped.push({ ...base, reason: kind === "meeting" ? "not-webinar" : "needs-review" }); continue;
      }
    }

    if (item.registrationOnly) {
      skipped.push({ ...base, reason: "needs-registration" });
      continue;
    }
    if (!item.meetingUrl) {
      skipped.push({ ...base, reason: "no-join-link" });
      continue;
    }
    if (!item.startTime || !item.endTime || Number.isNaN(new Date(item.startTime).getTime()) ||
      Number.isNaN(new Date(item.endTime).getTime())) {
      if (input.everyWebinar) skipped.push({ ...base, reason: "invalid-time" });
      continue;
    }
    const startMs = new Date(item.startTime).getTime();
    const endMs = new Date(item.endTime).getTime();
    if (endMs <= startMs) { skipped.push({ ...base, reason: "invalid-time" }); continue; }
    if (nowMs > endMs) {
      skipped.push({ ...base, reason: "past" });
      continue;
    }
    if (nowMs < startMs - leadMs) {
      continue; // not due yet — a later tick will see it again
    }
    if (item.rejected) {
      // A human's explicit rejection is final — it must never be out-ranked by the config
      // allowlist, which exists only to fast-track senders nobody has judged yet.
      skipped.push({ ...base, reason: "untrusted-sender" });
      continue;
    }
    if (!input.everyWebinar && !item.preTrusted && !isTrustedSender(item.sender, item.senderDomain, trustedSenders)) {
      skipped.push({ ...base, reason: "untrusted-sender" });
      continue;
    }
    if (scheduledSet.has(item.sessionKey)) {
      skipped.push({ ...base, reason: "duplicate-session" });
      continue;
    }
    if (input.everyWebinar) {
      const identity = webinarIdentity(item.meetingUrl, item.startTime);
      if (!identity) { skipped.push({ ...base, reason: "unsafe-join-link" }); continue; }
      if (seenWebinars.has(identity)) { skipped.push({ ...base, reason: "duplicate-session" }); continue; }
      seenWebinars.add(identity);
    }
    eligible.push(item);
  }

  // Overlap resolution: OBS records one session at a time. Sort by start, then greedily cluster
  // transitively-overlapping items; within a cluster the earliest start wins (tie-break: longest
  // duration); everyone else in the cluster loses.
  eligible.sort((a, b) => new Date(a.startTime as string).getTime() - new Date(b.startTime as string).getTime());

  const winners: NormalizedItem[] = [];
  let cluster: NormalizedItem[] = [];

  const resolveCluster = () => {
    if (cluster.length === 0) return;
    if (cluster.length === 1) {
      winners.push(cluster[0]!);
      cluster = [];
      return;
    }
    const [winner, ...losers] = [...cluster].sort((a, b) => {
      const startDiff = new Date(a.startTime as string).getTime() - new Date(b.startTime as string).getTime();
      if (startDiff !== 0) return startDiff;
      return durationMs(b) - durationMs(a); // longest duration wins the tie
    });
    winners.push(winner!);
    for (const loser of losers) {
      skipped.push({
        sessionKey: loser.sessionKey, source: loser.source, sourceId: loser.sourceId, title: loser.title,
        reason: "overlap-lost", detail: `lost to ${winner!.sessionKey} (earlier start, or longer on a tie)`,
      });
    }
    cluster = [];
  };

  for (const item of eligible) {
    if (cluster.length === 0 || cluster.some((c) => overlaps(c, item))) {
      cluster.push(item);
    } else {
      resolveCluster();
      cluster.push(item);
    }
  }
  resolveCluster();

  const toSchedule: AutoRecordItem[] = winners
    .sort((a, b) => new Date(a.startTime as string).getTime() - new Date(b.startTime as string).getTime())
    .map((item) => ({
      sessionKey: item.sessionKey,
      source: item.source,
      sourceId: item.sourceId,
      title: item.title,
      startTime: item.startTime as string,
      endTime: item.endTime as string,
      meetingUrl: item.meetingUrl as string,
      sender: item.sender,
    }));

  return { toSchedule, skipped };
}
