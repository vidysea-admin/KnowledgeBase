/** Canonical noncollection webinar transport and reconciliation types; no I/O. */
export interface TrustedSenderConfig {
  emails: string[];
  domains: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO datetime. */
  startTime: string;
  /** ISO datetime. */
  endTime: string;
  /** Absent when the event has no video-call link (nothing to auto-join). */
  meetingUrl?: string;
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
export type WebinarSnapshot = ReconciliationCalendarEvent & Partial<AutoRecordCandidateInput>;
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
  status: "pending" | "approved" | "rejected" | "auto_approved";
  meetingUrl?: string;
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
  | "overlap-lost"
  | "not-webinar"
  | "needs-review"
  | "cancelled"
  | "invalid-time"
  | "unsafe-join-link";

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
}

export interface SelectAutoRecordItemsResult {
  toSchedule: AutoRecordItem[];
  skipped: SkippedItem[];
}

