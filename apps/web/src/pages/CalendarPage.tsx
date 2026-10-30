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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useCanWrite, WriteScope } from "../auth/WriteScope.js";
import { listSessions } from "../api/sessions.js";
import { listUpcomingMeetings, type CalendarWorkerHealth } from "../api/calendar.js";
import { scanGmail, listMeetingCandidates, approveMeetingCandidate, rejectMeetingCandidate } from "../api/meeting-candidates.js";
import { ApiError } from "../api/client.js";
import type { SessionSummary, UpcomingMeeting, MeetingCandidate, GmailSummary } from "../api/types.js";
import { CalendarToolbar } from "./calendar/CalendarToolbar.js";
import { MonthGrid } from "./calendar/MonthGrid.js";
import { TimeGrid } from "./calendar/TimeGrid.js";
import { EventDetail } from "./calendar/EventDetail.js";
import { AgendaView } from "./calendar/AgendaView.js";
import { OptOutControl, GmailPatternControl } from "./calendar/OptOutControl.js";
import { useOptedOutIds } from "./calendar/useOptedOutIds.js";
import {
  activeCalendarFilterCount, filterEvents, isCalendarView, localTimeZoneName, monthMatrix,
  parseLocalDate, rangeFor, shiftRange, sourceOptions, toCalendarEvents, toDateParam,
  type CalendarFilters, type CalendarView,
} from "./calendar/calendar-model.js";

export function CalendarPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const canWrite = useCanWrite();
  const activeKey = useRef(apiKey); activeKey.current = apiKey;
  // Never render a previous signed-in key's source inventory while another request is pending.
  const [sessionState, setSessionState] = useState<{ owner: string | null; rows: SessionSummary[] | null; error: string | null } | null>(null);
  const [meetingState, setMeetingState] = useState<{ owner: string | null; rows: UpcomingMeeting[] | null; worker?: CalendarWorkerHealth; error: string | null } | null>(null);
  const [candidateState, setCandidateState] = useState<{ owner: string | null; rows: MeetingCandidate[] | null; gmailSummary?: GmailSummary; error: string | null } | null>(null);
  const sessions = sessionState?.owner === apiKey ? sessionState.rows : null;
  const error = sessionState?.owner === apiKey ? sessionState.error : null;
  const meetings = meetingState?.owner === apiKey ? meetingState.rows : null;
  const meetingsError = meetingState?.owner === apiKey ? meetingState.error : null;
  const worker = meetingState?.owner === apiKey ? meetingState.worker : undefined;
  const candidates = candidateState?.owner === apiKey ? candidateState.rows : null;
  const candidatesError = candidateState?.owner === apiKey ? candidateState.error : null;
  const gmailSummary = candidateState?.owner === apiKey ? candidateState.gmailSummary : undefined;
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const optedOut = useOptedOutIds(apiKey);

  useEffect(() => {
    let cancelled = false;
    listSessions(apiKey)
      .then((data) => { if (!cancelled) setSessionState({ owner: apiKey, rows: data.sessions, error: null }); })
      .catch((err: unknown) => { if (!cancelled) setSessionState({ owner: apiKey, rows: null, error: err instanceof ApiError ? err.message : "failed to load sessions" }); });
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    let cancelled = false;
    // A failed real-calendar fetch (gws unauthenticated, not installed, etc.) degrades to the
    // honest "not connected" state below -- never a page-wide error, since past sessions still
    // work independently of this ([C7]).
    listUpcomingMeetings(apiKey)
      .then((data) => { if (!cancelled) setMeetingState({ owner: apiKey, rows: data.meetings, worker: data.worker, error: null }); })
      .catch((err: unknown) => { if (!cancelled) setMeetingState({ owner: apiKey, rows: null, error: err instanceof ApiError ? err.message : "failed to load upcoming meetings" }); });
    return () => { cancelled = true; };
  }, [apiKey]);

  const refreshCandidates = useCallback(() => {
    listMeetingCandidates(apiKey)
      .then((data) => { if (activeKey.current === apiKey) setCandidateState({ owner: apiKey, rows: data.candidates, gmailSummary: data.gmailSummary, error: null }); })
      .catch((err: unknown) => { if (activeKey.current === apiKey) setCandidateState({ owner: apiKey, rows: null, error: err instanceof ApiError ? err.message : "failed to load Gmail meeting candidates" }); });
  }, [apiKey]);

  useEffect(() => { setScanNote(null); setScanning(false); refreshCandidates(); }, [refreshCandidates]);

  function handleScan(): void {
    setScanning(true);
    setScanNote(null);
    scanGmail(apiKey)
      .then((result) => {
        if (activeKey.current !== apiKey) return;
        setScanNote(`Found ${result.created} new candidate(s), ${result.autoApproved} auto-approved by the current policy.`);
        refreshCandidates();
      })
      .catch((err: unknown) => setCandidateState(previous => previous?.owner === apiKey ? { ...previous, error: err instanceof ApiError ? err.message : "Gmail scan failed" } : previous))
      .finally(() => { if (activeKey.current === apiKey) setScanning(false); });
  }

  function handleDecision(id: string, decision: "approve" | "reject"): void {
    const action = decision === "approve" ? approveMeetingCandidate : rejectMeetingCandidate;
    action(apiKey, id)
      .then(() => { if (activeKey.current === apiKey) refreshCandidates(); })
      .catch((err: unknown) => setCandidateState(previous => previous?.owner === apiKey ? { ...previous, error: err instanceof ApiError ? err.message : "failed to record decision" } : previous));
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
  // Rows without a valid source date belong outside the time grid; never give tombstones today's date.
  const unplaced = useMemo(() => {
    const placedIds = new Set(allEvents.filter(e => e.kind === "meeting").map(e => e.id));
    return (meetings ?? []).filter(m => !placedIds.has(`meeting:${m.id}`));
  }, [allEvents, meetings]);
  const visibleUnplaced = unplaced.filter(m => filters.kind !== "session" && (!filters.source || m.organizer === filters.source) && (!filters.query.trim() || m.title.toLowerCase().includes(filters.query.trim().toLowerCase())));
  const visible = useMemo(() => filterEvents(allEvents, filters), [allEvents, filters.kind, filters.source, filters.query]);
  const range = useMemo(() => rangeFor(view === "list" ? "month" : view, anchor), [view, anchor]);
  const cells = useMemo(() => monthMatrix(anchor), [anchor]);
  const today = useMemo(() => new Date(), []);
  /** Sessions are the lane that must have answered before an empty grid means anything; the
   * meetings lane degrades on its own ([C7]) and its absence is reported separately. */
  const loaded = sessions !== null && meetings !== null;
  const selectedId = params.get("event");
  const selected = visible.find((e) => e.id === selectedId) ?? null;
  /** The raw API meeting behind a selected meeting: its `id` is the opt-out record id (the grid id is `meeting:`-prefixed). */
  const selectedMeeting = selected?.kind === "meeting" ? (meetings ?? []).find((m) => `meeting:${m.id}` === selected.id) : undefined;

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
        sourceOptions={[...new Set([...sourceOptions(allEvents), ...unplaced.flatMap(m => m.organizer ? [m.organizer] : [])])].sort()}
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
      {worker && worker.status !== "fresh" && (
        <div className="card error-note" role="status" data-testid="calendar-worker-health">
          Calendar worker is {worker.status}. Last-known events remain visible; new attendance is not scheduled until a complete fresh scan succeeds.
          {worker.receivedAt && <div>Last snapshot received: <time dateTime={worker.receivedAt}>{worker.receivedAt}</time></div>}
          {worker.checkedAt && <div>Provider checked: <time dateTime={worker.checkedAt}>{worker.checkedAt}</time></div>}
        </div>
      )}
      {!meetingsError && meetings !== null && meetings.length === 0 && view !== "list" && (
        <div className="card empty-note" data-testid="calendar-no-connection-note">
          {worker?.status === "fresh" ? "No upcoming events in the connected calendar for the next two weeks." : <>No upcoming meetings in the next two weeks — either your calendar is clear, or the
          calendar connection (`gws`) isn&rsquo;t reachable from this server right now.</>}
        </div>
      )}

      {view !== "list" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 32rem", minWidth: 0 }}>
            <div className="row-meta" data-testid="calendar-counts" style={{ marginBottom: "0.35rem" }}>
              {inRange.length} event(s) in this range · {visible.length} of {allEvents.length} after filters{unplaced.length > 0 ? ` · ${visibleUnplaced.length} of ${unplaced.length} unplaced source records` : ""}
            </div>
            {/* Order matters, and it is the honesty rule: a page that has not LOADED yet, or whose
                load failed, must never blame the user's filters for showing nothing. Found live by
                the checker on 2026-09-24 — with sessions still null the grid rendered "0 of 0 after
                filters" and "No events match these filters", which attributes an in-flight request
                to a filter. The no-match note now requires data to be loaded AND non-empty. */}
            {sessions === null && !error ? (
              <div className="card empty-note" data-testid="calendar-loading">Loading&hellip;</div>
            ) : loaded && allEvents.length === 0 && unplaced.length === 0 ? (
              <div className="card empty-note" data-testid="calendar-no-data">
                No sessions or meetings to show yet — this tenant has nothing indexed and no
                connected-calendar events. Nothing is being filtered out.
              </div>
            ) : loaded && inRange.length === 0 && visibleUnplaced.length === 0 && activeCalendarFilterCount(filters) > 0 ? (
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
            <div className="card" style={{ width: 300, maxWidth: "100%", flex: "0 1 300px" }}>
              <EventDetail event={selected} onClose={() => setParam("event", null)} />
              {selectedMeeting && apiKey && (
                <WriteScope><OptOutControl
                  key={selectedMeeting.id}
                  apiKey={apiKey}
                  eventId={selectedMeeting.id}
                  title={selectedMeeting.title}
                  meetingUrl={selectedMeeting.meetingUrl}
                  linkCount={optedOut.linkCount}
                  optedOut={optedOut.ids?.has(selectedMeeting.id) ?? false}
                  onOptedOut={optedOut.add}
                /></WriteScope>
              )}
            </div>
          )}
        </div>
      )}

      {visibleUnplaced.length > 0 && (
        <section className="card" data-testid="calendar-unplaced" aria-label="Unplaced source records" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <div className="section-title">Unplaced source records</div>
          {visibleUnplaced.map(m => (
            <div className="row-card" key={m.id}>
              <div className="row-title">{m.title}</div>
              <div className="row-meta">No valid start date in the source. This record is not scheduled for attendance.</div>
              {(m.cancelled || m.status === "cancelled") && <div className="row-meta">Status: cancelled. This event will not be joined.</div>}
              {m.status && m.status !== "cancelled" && <div className="row-meta">Event status: {m.status}</div>}
              {m.attendanceSkipReason && <div className="row-meta">Skipped: {m.attendanceSkipReason === "office-internal" ? "office/internal" : m.attendanceSkipReason}</div>}
              {m.responseStatus && <div className="row-meta">RSVP: {m.responseStatus}</div>}
              {m.organizer && <div className="row-meta">Organiser: {m.organizer}</div>}
              {m.description && <div className="row-meta" style={{whiteSpace: "pre-wrap"}}>{m.description}</div>}
            </div>
          ))}
        </section>
      )}

      {view === "list" && (
        <AgendaView sessions={sessions} sessionsError={error} meetings={meetings} meetingsError={meetingsError} worker={worker} />
      )}

      <div className="section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Needs review (from Gmail)</span>
        <button type="button" onClick={handleScan} disabled={!canWrite || scanning} style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", cursor: "pointer" }}>
          {scanning ? "Scanning…" : "Scan Gmail"}
        </button>
      </div>
      <p className="row-meta" style={{ marginTop: "-0.4rem", marginBottom: "0.5rem" }}>
        Scans the last 30 days in batches of 10. External meeting invitations enter review; internal office meetings are skipped.
        Sender trust never overrides an ignore rule or unresolved meeting evidence.
      </p>
      {gmailSummary ? (
        <div className="card row-meta" data-testid="gmail-summary" role="status">
          Last scan: {gmailSummary.listed} listed · {gmailSummary.fetched} fetched · {gmailSummary.candidates} meeting candidates · {gmailSummary.excludedNonMeeting} non-meeting · {gmailSummary.excludedInternal} internal · {gmailSummary.refusedSender} refused sender · {gmailSummary.incompleteMessages} incomplete.
          {gmailSummary.complete ? " Scan complete." : " Scan incomplete; this summary does not authorize attendance."}
        </div>
      ) : <p className="row-meta" data-testid="gmail-summary-unknown">Gmail scan coverage is unavailable; no complete scan is implied.</p>}
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
            {c.evidenceIssue && <div className="row-meta" role="status">Needs review: {c.evidenceIssue === "unresolved-body" ? "message body could not be resolved" : "attachment evidence is unsupported"}. This evidence cannot authorize attendance.</div>}
            {(c.meetingLinkIssue || c.youtubeWatchIssue || c.registrationOnly) && <div className="row-meta">Needs review: {c.meetingLinkIssue ?? (c.youtubeWatchIssue ? "ambiguous watch target" : "registration-only")}. Attendance is not authorized by this evidence.</div>}
            <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.5rem" }}>
              <button type="button" disabled={!canWrite || Boolean(c.evidenceIssue)} onClick={() => handleDecision(c._id, "approve")} className="badge badge-good" style={{ border: "none", cursor: "pointer" }}>
                Approve
              </button>
              {apiKey && <WriteScope><GmailPatternControl apiKey={apiKey} candidate={c} onSaved={refreshCandidates} /></WriteScope>}
              <button type="button" disabled={!canWrite} onClick={() => handleDecision(c._id, "reject")} className="badge badge-bad" style={{ border: "none", cursor: "pointer" }}>
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
