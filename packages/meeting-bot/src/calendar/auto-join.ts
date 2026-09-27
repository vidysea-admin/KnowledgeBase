/**
 * packages/meeting-bot/src/calendar/auto-join.ts — T-025 C2 + U5 (u5-auto-record-scheduler).
 * Pure decisions: which calendar events / meeting candidates should trigger an auto-join capture
 * right now. No I/O, no scheduling itself — `schedule-tick.ts` composes this with the real
 * scheduler.
 *
 * Composition (T-025 C3, documented not built): a future scheduler calls `CalendarClient.
 * listUpcomingEvents(...)`, passes the result through `selectEventsToAutoJoin`, then for each
 * returned event calls `capture(event.meetingUrl, {tenantId, consent}, deps)` (`../capture.js`,
 * T-024). That call already runs `assertProvidedFirst` (D-008) internally before joining — this
 * function only decides *when* to trigger a capture that was always going to run the same
 * consent check; it never bypasses it.
 *
 * U5 policy (Umesh, approved 2026-09-26, qa/feedback-inbox.md): FULLY AUTOMATIC — the bot
 * auto-joins meetings from trusted senders as Umesh without per-meeting approval. Registration
 * forms stay human (`registrationOnly` -> `needs-registration`, never auto-submitted). Real
 * outward sends need their own approval (not this unit's concern — no sends happen here).
 */
import type { CalendarEvent } from "./calendar-client.js";
import { isTrustedSender, type TrustedSenderConfig } from "./auto-record-policy.js";
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

// ---------------------------------------------------------------------------------------------
// U5 — selectAutoRecordItems: the richer sibling used by `cli schedule-tick`.
// ---------------------------------------------------------------------------------------------

/**
 * The subset of `MeetingCandidates` (schema/meeting_candidates.schema.json) this selection needs.
 * Kept as a narrow local type (not an `@lkb/db`/`@lkb/core` import) — `packages/meeting-bot` may
 * depend only on `ingest, core` (ARCHITECTURE.md §5); the caller (schedule-tick.ts, which reads
 * candidates over HTTP) maps the real generated `MeetingCandidates` shape onto this before calling
 * in, so this file itself stays free of new dependency edges.
 */
export interface AutoRecordCandidateInput {
  id: string;
  title: string;
  senderEmail: string;
  senderDomain: string;
  status: "pending" | "approved" | "rejected" | "auto_approved";
  meetingUrl?: string;
  startTime?: string;
  endTime?: string;
  kind?: "past-recording" | "upcoming";
  registrationOnly?: boolean;
}

/** One item this tick decided to (attempt to) auto-record. `sessionKey` is the stable dedup
 * identity across ticks — `cal:<calendarEventId>` or `gmail:<candidateId>` — never the raw
 * `meetingUrl` (which can carry a rotating join token). */
export interface AutoRecordItem {
  sessionKey: string;
  source: "calendar" | "gmail";
  sourceId: string;
  title: string;
  startTime: string;
  endTime: string;
  meetingUrl: string;
  sender?: string;
}

export type SkipReason =
  | "no-join-link"
  | "past"
  | "untrusted-sender"
  | "needs-registration"
  | "duplicate-session"
  | "overlap-lost";

export interface SkippedItem {
  sessionKey: string;
  source: "calendar" | "gmail";
  sourceId: string;
  title: string;
  reason: SkipReason;
  /** Human-readable extra context — e.g. which session it lost to on "overlap-lost". Never
   * contains a `meetingUrl` (see `redactJoinLink`). */
  detail?: string;
}

export interface SelectAutoRecordItemsInput {
  calendarEvents: CalendarEvent[];
  candidates: AutoRecordCandidateInput[];
  now: string;
  leadMinutes: number;
  trustedSenders: TrustedSenderConfig;
  /** sessionKeys already scheduled by an earlier tick (from the persisted dedup state) —
   * anything matching here is reported as `duplicate-session`, never re-scheduled. */
  alreadyScheduled: ReadonlySet<string> | readonly string[];
}

export interface SelectAutoRecordItemsResult {
  toSchedule: AutoRecordItem[];
  skipped: SkippedItem[];
}

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
  /** Candidates already vetted by the Gmail approval flow (approved/auto_approved) are trusted
   * by construction, independent of the config allowlist — see the module doc comment. */
  preTrusted: boolean;
  /** True iff a human explicitly rejected this candidate. A rejection is final and MUST NOT be
   * overridden by the config trusted-sender allowlist — the allowlist is a bootstrap/fast-path
   * for senders nobody has judged yet, never a way to out-rank an explicit human "no". Always
   * false for a calendar event (no rejection workflow exists for those). */
  rejected: boolean;
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

/**
 * Merges calendar events + meeting candidates, applies the U5 auto-record policy, and returns
 * what to schedule now plus everything skipped (with a reason). Pure — no I/O, no clock reads
 * beyond the passed-in `now`.
 *
 * Order of checks per item (first match wins, matching the `SkipReason` union):
 * 1. `registrationOnly` -> `needs-registration` (webinar registration forms stay human, U5 policy).
 * 2. No `meetingUrl` -> `no-join-link` (nothing to join).
 * 3. No parseable `startTime`/`endTime` -> excluded silently (not enough information to schedule
 *    or report a reason against — e.g. a `past-recording` candidate with no live session at all).
 * 4. `now` after `endTime` -> `past`.
 * 5. `now` before `startTime - leadMinutes` -> excluded silently (not due yet; a later tick will
 *    see it again — reporting "skipped" every tick for hours would be noise, not a decision).
 * 6. Not pre-trusted (Gmail-approved) and sender/organizer not on the config allowlist ->
 *    `untrusted-sender`.
 * 7. `alreadyScheduled` contains this `sessionKey` -> `duplicate-session`.
 * 8. Remaining items that time-overlap each other -> OBS records one at a time, so the earliest
 *    `startTime` wins (tie-break: longest duration); every other member of that overlap cluster
 *    -> `overlap-lost`, `detail` names the winner's `sessionKey`.
 */
export function selectAutoRecordItems(input: SelectAutoRecordItemsInput): SelectAutoRecordItemsResult {
  const { calendarEvents, candidates, now, leadMinutes, trustedSenders, alreadyScheduled } = input;
  const nowMs = new Date(now).getTime();
  const leadMs = leadMinutes * 60 * 1000;
  const scheduledSet = alreadyScheduled instanceof Set ? alreadyScheduled : new Set(alreadyScheduled);

  const normalized = [
    ...calendarEvents.map(normalizeCalendarEvent),
    ...candidates.map(normalizeCandidate),
  ];

  const skipped: SkippedItem[] = [];
  const eligible: NormalizedItem[] = [];

  for (const item of normalized) {
    const base = { sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title };

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
      continue; // not enough info to schedule or to report a reason against
    }
    const startMs = new Date(item.startTime).getTime();
    const endMs = new Date(item.endTime).getTime();
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
    if (!item.preTrusted && !isTrustedSender(item.sender, item.senderDomain, trustedSenders)) {
      skipped.push({ ...base, reason: "untrusted-sender" });
      continue;
    }
    if (scheduledSet.has(item.sessionKey)) {
      skipped.push({ ...base, reason: "duplicate-session" });
      continue;
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
