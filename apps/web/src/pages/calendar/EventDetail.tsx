/**
 * apps/web/src/pages/calendar/EventDetail.tsx — the click-to-open detail panel ([C6]).
 *
 * Every row here is rendered ONLY when the API actually returned that field. There is no
 * placeholder location, no invented attendee list, no "TBD" organiser — [I1]/[C6] make inventing a
 * field a FAIL, and the honest shape of this data is that a session has a date and an org and a
 * meeting may have neither an organiser nor a join link.
 */
import { Link } from "react-router-dom";
import type { CalendarEvent } from "./calendar-model.js";
import { formatTimeRange } from "./calendar-model.js";
import { EVENT_COLOR } from "./EventChip.js";

export interface EventDetailProps {
  event: CalendarEvent;
  onClose(): void;
}

export function EventDetail(props: EventDetailProps): React.ReactElement {
  const { event } = props;
  return (
    <div data-testid="event-detail">
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: EVENT_COLOR[event.kind].border, display: "inline-block" }} />
        {event.kind}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={props.onClose} aria-label="Close event details" style={{ border: "none", background: "none", cursor: "pointer", font: "inherit" }}>&times;</button>
      </div>
      <div className="row-title">{event.title}</div>
      <div className="row-meta">
        {event.start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        {" · "}
        {formatTimeRange(event)}
      </div>

      {event.org && <div className="row-meta" data-testid="detail-org">Org: {event.org}</div>}
      {event.organizer && <div className="row-meta" data-testid="detail-organizer">Organiser: {event.organizer}</div>}
      {event.participants && (
        <div className="row-meta" data-testid="detail-participants">Participants: {event.participants.join(", ")}</div>
      )}

      {event.href && (
        <Link to={event.href} className="row-meta" data-testid="detail-session-link" style={{ color: "var(--accent)", display: "inline-block", marginTop: "0.5rem" }}>
          Open session &rarr;
        </Link>
      )}
      {event.meetingUrl && (
        <a
          href={event.meetingUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="detail-join-link"
          className="row-meta"
          style={{ color: "var(--accent)", display: "inline-block", marginTop: "0.5rem" }}
        >
          Join &rarr;
        </a>
      )}
      {!event.href && !event.meetingUrl && (
        <div className="empty-note" style={{ marginTop: "0.5rem" }}>No link on this event in the source data.</div>
      )}
    </div>
  );
}
