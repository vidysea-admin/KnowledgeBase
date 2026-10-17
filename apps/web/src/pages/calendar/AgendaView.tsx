/**
 * apps/web/src/pages/calendar/AgendaView.tsx — the ORIGINAL list surface, preserved ([I5]).
 *
 * The contract is explicit: "the list view is not deleted until the grid passes. Regression of a
 * working surface into a half-built one is worse than the list." So the pre-U-CAL rendering —
 * upcoming meetings as rows with a working Join link, past sessions grouped by month and linked
 * to their session pages — is moved here verbatim in behaviour and kept reachable as the `list`
 * view rather than being thrown away when the grid landed.
 */
import { Link } from "react-router-dom";
import type { SessionSummary, UpcomingMeeting } from "../../api/types.js";
import { ExternalLinkIcon } from "../../components/icons.js";
import { safeHttpUrl } from "../../safe-url.js";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function groupByMonth(sessions: readonly SessionSummary[]): Map<string, SessionSummary[]> {
  const groups = new Map<string, SessionSummary[]>();
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = s.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return groups;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const idx = Number(month) - 1;
  return `${MONTH_NAMES[idx] ?? month} ${year}`;
}

function formatMeetingTime(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const dateStr = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const startStr = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endStr = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateStr} · ${startStr}–${endStr}`;
}

export interface AgendaViewProps {
  sessions: SessionSummary[] | null;
  sessionsError: string | null;
  meetings: UpcomingMeeting[] | null;
  meetingsError: string | null;
}

export function AgendaView(props: AgendaViewProps): React.ReactElement {
  const grouped = groupByMonth(props.sessions ?? []);
  return (
    <div data-testid="agenda-view">
      <div className="section-title">Upcoming</div>
      {props.meetingsError && <div className="card error-note">{props.meetingsError}</div>}
      {!props.meetingsError && props.meetings === null && <div className="card empty-note">Loading&hellip;</div>}
      {!props.meetingsError && props.meetings && props.meetings.length === 0 && (
        <div className="card empty-note">
          No upcoming meetings found in the next two weeks &mdash; either your calendar is clear, or
          the calendar connection (`gws`) isn&rsquo;t reachable from this server right now.
        </div>
      )}
      {props.meetings && props.meetings.length > 0 && (
        <div className="card">
          {props.meetings.map((m) => (
            <div key={m.id} className="row-card">
              <div className="row-title">{m.title}</div>
              <div className="row-meta">
                {formatMeetingTime(m.startTime, m.endTime)}
                {m.organizer ? ` · ${m.organizer}` : ""}
                {m.meetingUrl && (
                  <>
                    {" · "}
                    {safeHttpUrl(m.meetingUrl) ? (
                      <a href={m.meetingUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        Join <ExternalLinkIcon className="row-meta" />
                      </a>
                    ) : (
                      <span data-testid="agenda-join-text">{m.meetingUrl}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">Past</div>
      {props.sessionsError && <div className="card error-note">{props.sessionsError}</div>}
      {!props.sessionsError && props.sessions === null && <div className="card empty-note">Loading&hellip;</div>}
      {props.sessions && props.sessions.length === 0 && <div className="card empty-note">No past sessions recorded.</div>}
      {[...grouped.entries()].reverse().map(([monthKey, monthSessions]) => (
        <div key={monthKey} className="card">
          <div className="row-title" style={{ marginBottom: "0.5rem" }}>{monthLabel(monthKey)}</div>
          {monthSessions.map((s) => (
            <Link key={s._id} to={`/sessions/${encodeURIComponent(s._id)}`} className="row-card">
              <div className="row-title">{s.title}</div>
              <div className="row-meta">{s.date}{s.org ? ` · ${s.org}` : ""}</div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
