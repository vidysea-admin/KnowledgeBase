/**
 * apps/web/src/pages/CalendarPage.tsx — /calendar, rebuilt as a real Google-Calendar-shaped grid
 * (U-CAL, qa/contracts/calendar-grid-ui.md).
 *
 * Before this unit the page was a vertical stack of cards: `groupByMonth()` for past sessions and
 * a separate stacked list for upcoming meetings, with no grid, no hour axis, no overlap handling
 * and no filters. Now: month / week / day grids over ONE timeline carrying both kinds, filters and
 * view state in the URL, a detail panel, and the original list kept reachable as the `list` view
 * ([I5] — a working surface is not deleted to make room for a new one).
 *
 * [I1] no new data source: this renders `GET /calendar/upcoming` and `listSessions` exactly as
 * they already are. [C9] every date-only value goes through `calendar-model.ts`'s
 * `parseLocalDate`; nothing here constructs a Date from a bare `YYYY-MM-DD` string.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { listSessions } from "../api/sessions.js";
import { listUpcomingMeetings } from "../api/calendar.js";
import { scanGmail, listMeetingCandidates, approveMeetingCandidate, rejectMeetingCandidate } from "../api/meeting-candidates.js";
import { ApiError } from "../api/client.js";
import type { SessionSummary, UpcomingMeeting, MeetingCandidate } from "../api/types.js";
import { CalendarToolbar } from "./calendar/CalendarToolbar.js";
import { MonthGrid } from "./calendar/MonthGrid.js";
import { TimeGrid } from "./calendar/TimeGrid.js";
import { EventDetail } from "./calendar/EventDetail.js";
import { AgendaView } from "./calendar/AgendaView.js";
import {
  activeCalendarFilterCount, filterEvents, isCalendarView, localTimeZoneName, monthMatrix,
  parseLocalDate, rangeFor, shiftRange, sourceOptions, toCalendarEvents, toDateParam,
  type CalendarFilters, type CalendarView,
} from "./calendar/calendar-model.js";

export function CalendarPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<UpcomingMeeting[] | null>(null);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MeetingCandidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    listSessions(apiKey)
      .then((data) => { if (!cancelled) setSessions(data.sessions); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "failed to load sessions"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    let cancelled = false;
    // A failed real-calendar fetch (gws unauthenticated, not installed, etc.) degrades to the
    // honest "not connected" state below -- never a page-wide error, since past sessions still
    // work independently of this ([C7]).
    listUpcomingMeetings(apiKey)
      .then((data) => { if (!cancelled) setMeetings(data.meetings); })
      .catch((err: unknown) => { if (!cancelled) setMeetingsError(err instanceof ApiError ? err.message : "failed to load upcoming meetings"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  const refreshCandidates = useCallback(() => {
    listMeetingCandidates(apiKey)
      .then((data) => setCandidates(data.candidates))
      .catch((err: unknown) => setCandidatesError(err instanceof ApiError ? err.message : "failed to load Gmail meeting candidates"));
  }, [apiKey]);

  useEffect(() => { refreshCandidates(); }, [refreshCandidates]);

  function handleScan(): void {
    setScanning(true);
    setScanNote(null);
    scanGmail(apiKey)
      .then((result) => {
        setScanNote(`Found ${result.created} new candidate(s), ${result.autoApproved} auto-confirmed (trusted sender).`);
        refreshCandidates();
      })
      .catch((err: unknown) => setCandidatesError(err instanceof ApiError ? err.message : "Gmail scan failed"))
      .finally(() => setScanning(false));
  }

  function handleDecision(id: string, decision: "approve" | "reject"): void {
    const action = decision === "approve" ? approveMeetingCandidate : rejectMeetingCandidate;
    action(apiKey, id)
      .then(() => refreshCandidates())
      .catch((err: unknown) => setCandidatesError(err instanceof ApiError ? err.message : "failed to record decision"));
  }

  // --- URL-backed view state ([C1]/[C3]/[C5]) -------------------------------------------------
  const viewParam = params.get("view");
  const view: CalendarView = isCalendarView(viewParam) ? viewParam : "month";
  const dateParam = params.get("date");
  const anchor = useMemo(() => (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? parseLocalDate(dateParam) : new Date()), [dateParam]);
  const filters: CalendarFilters = {
    kind: (params.get("kind") as CalendarFilters["kind"]) || "",
    source: params.get("source") ?? "",
    query: params.get("q") ?? "",
  };

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value) next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setParams]);

  /** ONE atomic update — three sequential deletes would each read the same batched `prev` and the
   * last would re-add what the first two removed (the exact bug found on /brain). */
  const clearFilters = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of ["kind", "source", "q"]) next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  const allEvents = useMemo(() => toCalendarEvents(sessions ?? [], meetings ?? []), [sessions, meetings]);
  const visible = useMemo(() => filterEvents(allEvents, filters), [allEvents, filters.kind, filters.source, filters.query]);
  const range = useMemo(() => rangeFor(view === "list" ? "month" : view, anchor), [view, anchor]);
  const cells = useMemo(() => monthMatrix(anchor), [anchor]);
  const today = useMemo(() => new Date(), []);
  /** Sessions are the lane that must have answered before an empty grid means anything; the
   * meetings lane degrades on its own ([C7]) and its absence is reported separately. */
  const loaded = sessions !== null;
  const selectedId = params.get("event");
  const selected = visible.find((e) => e.id === selectedId) ?? null;

  const inRange = useMemo(() => {
    if (view === "list") return visible;
    const first = range.days[0]!;
    const last = range.days[range.days.length - 1]!;
    const lo = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
    const hi = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999).getTime();
    return visible.filter((e) => e.start.getTime() >= lo && e.start.getTime() <= hi);
  }, [visible, range, view]);

  return (
    <>
      <div className="page-header">
        <h1>Calendar</h1>
        <p>
          Past LKB sessions and real upcoming meetings from your connected calendar, on one
          timeline. Green is a recorded session, blue is an upcoming meeting.
        </p>
      </div>

      <CalendarToolbar
        view={view}
        rangeLabel={view === "list" ? "All sessions and meetings" : range.label}
        timeZone={localTimeZoneName()}
        filters={filters}
        sourceOptions={sourceOptions(allEvents)}
        onView={(v) => setParam("view", v)}
        onShift={(d) => setParam("date", toDateParam(shiftRange(view === "list" ? "month" : view, anchor, d)))}
        onToday={() => setParam("date", toDateParam(new Date()))}
        onFilter={(key, value) => setParam(key === "query" ? "q" : key, value)}
        onClearFilters={clearFilters}
      />

      {error && <div className="card error-note">{error}</div>}
      {meetingsError && view !== "list" && (
        <div className="card empty-note" data-testid="calendar-degraded-note">
          Upcoming meetings are unavailable right now ({meetingsError}). Past sessions below are
          unaffected — this lane is empty because the calendar connection is down, not because your
          calendar is clear.
        </div>
      )}
      {!meetingsError && meetings !== null && meetings.length === 0 && view !== "list" && (
        <div className="card empty-note" data-testid="calendar-no-connection-note">
          No upcoming meetings in the next two weeks — either your calendar is clear, or the
          calendar connection (`gws`) isn&rsquo;t reachable from this server right now.
        </div>
      )}

      {view !== "list" && (
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row-meta" data-testid="calendar-counts" style={{ marginBottom: "0.35rem" }}>
              {inRange.length} event(s) in this range · {visible.length} of {allEvents.length} after filters
            </div>
            {/* Order matters, and it is the honesty rule: a page that has not LOADED yet, or whose
                load failed, must never blame the user's filters for showing nothing. Found live by
                the checker on 2026-09-24 — with sessions still null the grid rendered "0 of 0 after
                filters" and "No events match these filters", which attributes an in-flight request
                to a filter. The no-match note now requires data to be loaded AND non-empty. */}
            {sessions === null && !error ? (
              <div className="card empty-note" data-testid="calendar-loading">Loading&hellip;</div>
            ) : loaded && allEvents.length === 0 ? (
              <div className="card empty-note" data-testid="calendar-no-data">
                No sessions or meetings to show yet — this tenant has nothing indexed and no
                connected-calendar events. Nothing is being filtered out.
              </div>
            ) : loaded && inRange.length === 0 && activeCalendarFilterCount(filters) > 0 ? (
              <div className="card empty-note" data-testid="calendar-no-match">
                No events match these filters.
              </div>
            ) : view === "month" ? (
              <MonthGrid
                cells={cells}
                events={visible}
                today={today}
                selectedId={selectedId}
                onSelect={(id) => setParam("event", id)}
                onOpenDay={(d) => { setParam("date", toDateParam(d)); setParam("view", "day"); }}
              />
            ) : (
              <TimeGrid
                days={range.days}
                events={visible}
                today={today}
                selectedId={selectedId}
                onSelect={(id) => setParam("event", id)}
              />
            )}
          </div>
          {selected && (
            <div className="card" style={{ width: 300, flexShrink: 0 }}>
              <EventDetail event={selected} onClose={() => setParam("event", null)} />
            </div>
          )}
        </div>
      )}

      {view === "list" && (
        <AgendaView sessions={sessions} sessionsError={error} meetings={meetings} meetingsError={meetingsError} />
      )}

      <div className="section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Needs review (from Gmail)</span>
        <button type="button" onClick={handleScan} disabled={scanning} style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", cursor: "pointer" }}>
          {scanning ? "Scanning…" : "Scan Gmail"}
        </button>
      </div>
      <p className="row-meta" style={{ marginTop: "-0.4rem", marginBottom: "0.5rem" }}>
        Meeting-shaped mail is held for your approval; once a sender has been approved 3 times, its future
        meetings auto-confirm.
      </p>
      {scanNote && <div className="card empty-note">{scanNote}</div>}
      {candidatesError && <div className="card error-note">{candidatesError}</div>}
      {!candidatesError && candidates === null && <div className="card empty-note">Loading&hellip;</div>}
      {candidates && candidates.filter((c) => c.status === "pending").length === 0 && !scanNote && (
        <div className="card empty-note">No meeting candidates awaiting review. Click "Scan Gmail" to check.</div>
      )}
      {(candidates ?? []).filter((c) => c.status === "pending").map((c) => (
        <div key={c._id} className="card">
          <div className="row-card">
            <div className="row-title">{c.subject}</div>
            <div className="row-meta">
              {c.senderEmail}
              {c.meetingUrl ? ` · ${c.meetingUrl}` : ""}
            </div>
            <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={() => handleDecision(c._id, "approve")} className="badge badge-good" style={{ border: "none", cursor: "pointer" }}>
                Approve
              </button>
              <button type="button" onClick={() => handleDecision(c._id, "reject")} className="badge badge-bad" style={{ border: "none", cursor: "pointer" }}>
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
