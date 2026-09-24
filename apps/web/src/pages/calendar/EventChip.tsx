/**
 * apps/web/src/pages/calendar/EventChip.tsx — one event, as a real focusable control ([C8]).
 *
 * A `<button>`, not a styled `<div>`: the keyboard probe in the contract ("tab to an event and
 * open it without a mouse") is only satisfiable if the element is genuinely focusable and
 * activatable, and an accessible name is what tells a screen-reader user which event it landed on.
 * Shared by the month grid and the time grid so both kinds look and behave the same.
 */
import type { CalendarEvent } from "./calendar-model.js";
import { formatTimeRange } from "./calendar-model.js";

export const EVENT_COLOR: Record<CalendarEvent["kind"], { bg: string; border: string; ink: string }> = {
  session: { bg: "#e8f7f0", border: "#0b8a5c", ink: "#07553a" },
  meeting: { bg: "#e8edff", border: "#2554ff", ink: "#12307f" },
};

export interface EventChipProps {
  event: CalendarEvent;
  selected: boolean;
  onSelect(id: string): void;
  compact?: boolean;
  style?: React.CSSProperties;
}

export function EventChip(props: EventChipProps): React.ReactElement {
  const { event, selected } = props;
  const colors = EVENT_COLOR[event.kind];
  return (
    <button
      type="button"
      data-event-id={event.id}
      data-event-kind={event.kind}
      aria-label={`${event.kind}: ${event.title}, ${formatTimeRange(event)}`}
      aria-pressed={selected}
      onClick={() => props.onSelect(event.id)}
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        background: colors.bg, color: colors.ink,
        border: `1px solid ${colors.border}`,
        borderLeft: `3px solid ${colors.border}`,
        outline: selected ? "2px solid var(--ink)" : undefined,
        borderRadius: 4, padding: props.compact ? "0.1rem 0.25rem" : "0.2rem 0.35rem",
        font: "inherit", fontSize: props.compact ? "0.68rem" : "0.74rem",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: props.compact ? "nowrap" : "normal",
        ...props.style,
      }}
    >
      {!event.allDay && <span style={{ fontWeight: 700, marginRight: "0.25rem" }}>{event.start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>}
      {event.title}
    </button>
  );
}
