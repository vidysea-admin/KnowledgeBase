/** Shared fixtures for the unknown-tombstone tests (ISS-T036CAL-011). Test support only. */
import { reconcileWebinarSources } from "../calendar-client.js";
import { selectAutoRecordItems } from "../auto-join.js";

export type Row = Record<string, unknown>;
export const CHECKED = "2026-10-11T10:00:00.000Z", REV = "2026-10-01T08:00:00.000Z", NOW = "2026-10-11T10:30:00.000Z";
export const SCOPES = [true, false] as const;                  // true = "available" scope, false = legacy scope
export const MODES = [true, false] as const;                   // everyWebinar
export const meet = (i: number): string => { const a = String.fromCharCode(97 + (i % 26)), b = String.fromCharCode(97 + Math.floor(i / 26) % 26); return `https://meet.google.com/${a}${b}a-${a}${b}${a}${b}-${b}${a}a`; };
export const slot = (i: number): [string, string] => { const h = 11 + (i % 10); return [`2026-10-11T${h}:00:00.000Z`, `2026-10-11T${h}:30:00.000Z`]; };
/** A trusted (Google conference data) calendar event. */
export const cal = (i: number, extra: Row = {}): Row => ({ id: `c${i}`, title: `Webinar ${i}`, startTime: slot(i)[0], endTime: slot(i)[1], organizer: "host@example.org",
  meetingUrl: meet(i), meetingUrlSource: "conference", providerUpdated: REV, ...extra });
/** A Gmail invitation row for the same meeting as cal(i) (links by identity) or, with a different `meetingNo`, for another meeting. */
export const mail = (i: number, extra: Row = {}): Row => ({ id: `g${i}`, title: `Webinar ${i}`, startTime: slot(i)[0], endTime: slot(i)[1], meetingUrl: meet(i),
  senderEmail: "host@example.org", senderDomain: "example.org", senderAuthenticated: true, status: "approved", providerUpdated: REV, ...extra });
export const recon = (calendarEvents: Row[], candidates: Row[], available: boolean, previous?: unknown, checkedAt = CHECKED) => reconcileWebinarSources({ tenantId: "lane", checkedAt, previous,
  acquisition: { complete: true, historyComplete: true, ...(available ? { scope: "available-connected-source-state" as const } : {}) }, calendarEvents: calendarEvents as never, candidates: candidates as never });
export const pick = (r: ReturnType<typeof recon>, everyWebinar: boolean) => selectAutoRecordItems({ calendarEvents: r.calendarEvents, candidates: r.candidates, now: NOW, leadMinutes: 720,
  trustedSenders: { emails: ["host@example.org"], domains: [] }, alreadyScheduled: [], everyWebinar });
/** What the selector and the reconciliation say about the given ids only: scheduled/skipped entries, feed rows, and the transitions/inventory of the occurrences holding them. */
export function outcomeOf(r: ReturnType<typeof recon>, mode: boolean, ids: ReadonlySet<string>): string {
  const sel = pick(r, mode), keep = (x: { id?: string }) => ids.has(String(x.id)), keepSel = (x: { sourceId: string }) => ids.has(x.sourceId);
  const keys = new Set(Object.entries(r.state.occurrences).filter(([, o]) => ids.has(o.snapshot.id)).map(([k]) => k));
  return JSON.stringify({
    scheduled: sel.toSchedule.filter(keepSel), skipped: sel.skipped.filter(keepSel),
    calendar: r.calendarEvents.filter(keep), candidates: r.candidates.filter(keep),
    transitions: r.transitions.filter(t => keys.has(t.occurrenceKey)), inventory: r.inventory.filter(i => keys.has(i.occurrenceKey)),
    occurrences: [...keys].sort().map(k => r.state.occurrences[k]),
  });
}
/** The three recorded tombstone shapes of ISS-T036CAL-011 (unknown ids), built around an unrelated meeting. */
export const recordedTombstones = (id = "ghost"): Row[] => [
  { id, cancelled: true },                                                                                        // minimal: only id/cancelled
  { id, cancelled: true, title: "Outsider invite", startTime: "2026-10-11T20:00:00.000Z", endTime: "2026-10-11T21:00:00.000Z", organizer: "evil@attacker.example",
    meetingUrl: "https://zoom.us/j/99999999999", meetingUrlSource: "conference", providerUpdated: REV },             // a cancelled invite with details
  { id, cancelled: true, title: "Outsider invite", startTime: "2026-10-11T20:00:00.000Z", endTime: "2026-10-11T21:00:00.000Z", organizer: "evil@attacker.example",
    meetingUrl: "https://zoom.us/j/88888888888", meetingUrlSource: "description", providerUpdated: REV },            // one with a free-text link
];
