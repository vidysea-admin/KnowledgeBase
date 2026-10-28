/** Canonical noncollection webinar transport and reconciliation types; no I/O. */
import type { WatchState } from "../generated/watch_state.js";
export type GmailScanSummary = NonNullable<NonNullable<WatchState["workerSnapshot"]>["state"]["gmailSummary"]>;

export interface TrustedSenderConfig {
  emails: string[];
  domains: string[];
}

/** `location`/`description` links are free text chosen by whoever sent the invitation. */
export type MeetingUrlSource = "conference" | "location" | "description";

export interface CalendarEvent {
  id: string;
  title: string;
  /** Bounded provider metadata used by operator inventory and literal purpose rules. */
  description?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  youtubeWatch?: {url: string; videoId: string; source: "location" | "description"};
  youtubeWatchIssue?: "ambiguous";
  meetingLinkIssue?: "ambiguous" | "registration-only" | "host-start-link";
  /** ISO datetime. */
  startTime: string;
  /** ISO datetime. */
  endTime: string;
  /** Absent when the event has no video-call link (nothing to auto-join). */
  meetingUrl?: string;
  /** T-036: where `meetingUrl` came from. Absent = a row that predates the field (conference data only: free-text
   * links did not exist then) and is read as `conference`; any value other than `conference` is not auto-joinable. */
  meetingUrlSource?: MeetingUrlSource;
  organizer?: string;
  cancelled?: boolean;
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  providerUpdated?: string;
}

export interface CalendarClient {
  /** Events starting within the next `windowMinutes` (or already in progress). */
  listUpcomingEvents(windowMinutes: number): Promise<CalendarEvent[]>;
}

export type ReconciliationCalendarEvent = Pick<CalendarEvent, "id"> & Partial<CalendarEvent>;
export type WebinarSnapshot = Omit<ReconciliationCalendarEvent, "status" | "youtubeWatch"> & Omit<Partial<AutoRecordCandidateInput>, "status" | "youtubeWatch"> &
  {status?: CalendarEvent["status"] | AutoRecordCandidateInput["status"]; youtubeWatch?: CalendarEvent["youtubeWatch"] | AutoRecordCandidateInput["youtubeWatch"]};
export type WebinarAlias = { key: string; identity: string };
export type WebinarOccurrence = {
  source: "calendar" | "gmail"; snapshot: WebinarSnapshot; providerIds: string[]; aliases: WebinarAlias[]; accepted: boolean;
  revision?: string; linkedCalendar?: string; reviewReason?: "invalid-time" | "no-join-link" | "unsafe-join-link";
  unresolved?: "unknown-tombstone" | "ambiguous-provider" | "contradictory-revision" | "missing-revision" | "ambiguous-identity" | "source-discontinuity";
};
export interface WebinarReconciliationState {
  version: 1; tenantId: string; checkedAt: string; historyComplete: boolean;
  coverageScope?: "available-connected-source-state";
  occurrences: Record<string, WebinarOccurrence>;
}
export interface WebinarReconciliationResult {
  state: WebinarReconciliationState; calendarEvents: CalendarEvent[]; candidates: AutoRecordCandidateInput[];
  inventory: { occurrenceKey: string; reviewKey: string; sessionKey?: string; classification: string; snapshot: WebinarSnapshot; reason?: string }[];
  transitions: { occurrenceKey: string; reason: "cancelled" | "rescheduled" | "unresolved"; aliases: string[]; currentKey?: string; boundaryChanged?: true }[];
  newStartsBlocked: boolean;
}

/** HTTP-mapped candidate subset; preserves the meeting-bot dependency boundary. */
export interface AutoRecordCandidateInput {
  id: string;
  title: string;
  senderEmail: string;
  senderDomain: string;
  /** ISS-322: set only by the authenticated Gmail scan; absent/false never earns config or auto trust. */
  senderAuthenticated?: boolean;
  /** Canonical actual provider internalDate; never a mail Date header or scan clock. */
  receivedAt?: string;
  youtubeWatch?: { url: string; videoId: string; source: 'body' | 'snippet' };
  youtubeWatchIssue?: 'ambiguous';
  meetingLinkIssue?: 'ambiguous' | 'registration-only' | 'host-start-link';
  evidenceIssue?: 'unresolved-body' | 'unsupported-attachment';
  status: "pending" | "approved" | "rejected" | "auto_approved";
  meetingUrl?: string;
  /** Set only when a calendar-linked snapshot supplied the URL (see CalendarEvent.meetingUrlSource). */
  meetingUrlSource?: MeetingUrlSource;
  startTime?: string;
  endTime?: string;
  kind?: "past-recording" | "upcoming";
  registrationOnly?: boolean;
  registrationUrl?: string;
  messageId?: string;
  threadId?: string;
  cancelled?: boolean;
}

/** One item this tick decided to (attempt to) auto-record. `sessionKey` is the stable dedup
 * identity across ticks — `cal:<calendarEventId>` or `gmail:<candidateId>` — never the raw
 * `meetingUrl` (which can carry a rotating join token). */
export interface AutoRecordItem {
  sessionKey: string;
  source: "calendar" | "gmail";
  sourceId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  meetingUrl: string;
  sender?: string;
}

/** Runtime list of every SkipReason; the type is derived from it so hand-kept copies can be tested against it. */
export const SKIP_REASONS = [
  "no-join-link",
  "past",
  "untrusted-sender",
  "needs-registration",
  "duplicate-session",
  "overlap-lost",
  "not-webinar",
  "needs-review",
  "cancelled",
  "invalid-time",
  "unsafe-join-link",
  // T-037 join-rules veto layer (join-rules-select.ts): removals the rules engine makes after selection.
  "opted-out",
  "rule-denied",
  "rules-unevaluable",
  // T-036: the join link came from an invite's free text (chosen by the sender), not from Google's conference data.
  "unverified-link-source",
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

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
  /** Approved release policy; legacy callers retain trusted-sender behaviour when absent. */
  everyWebinar?: boolean;
  /** Autojoin: replaces the title-only webinar classifier (only consulted with everyWebinar). Absent = the built-in one. */
  classifyInvite?: (invite: { title: string; meetingUrl?: string; sender?: string }) => "webinar" | "meeting" | "uncertain";
  /** Autojoin: higher wins an overlap before the earliest-start rule. Absent = 0 for everyone (todays behaviour). */
  priorityOf?: (item: { source: "calendar" | "gmail"; sourceId: string; title: string; sender?: string }) => number;
}

export interface SelectAutoRecordItemsResult {
  toSchedule: AutoRecordItem[];
  skipped: SkippedItem[];
}

