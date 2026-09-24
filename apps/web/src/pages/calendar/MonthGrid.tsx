/**
 * apps/web/src/pages/calendar/MonthGrid.tsx — the month view ([C1]/[C3]). A real 7-column grid of
 * whole weeks with today marked, not a stack of cards. Timed and all-day events both appear as
 * chips here; the hour axis is the week/day view's job ([C2]).
 */
import type { CalendarEvent, MonthCell } from "./calendar-model.js";
import { eventsOnDay, isSameLocalDay } from "./calendar-model.js";
import { EventChip } from "./EventChip.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

export interface MonthGridProps {
  cells: readonly MonthCell[];
  events: readonly CalendarEvent[];
  today: Date;
  selectedId: string | null;
  onSelect(id: string): void;
  onOpenDay(date: Date): void;
}

export function MonthGrid(props: MonthGridProps): React.ReactElement {
  return (
    <div className="card" data-testid="month-grid" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--line)" }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="row-meta" style={{ padding: "0.4rem", textAlign: "center", fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {props.cells.map((cell) => {
          const dayEvents = eventsOnDay(props.events, cell.date);
          const isToday = isSameLocalDay(cell.date, props.today);
          return (
            <div
              key={cell.date.toISOString()}
              data-testid="month-cell"
              data-in-month={cell.inMonth ? "true" : "false"}
              data-today={isToday ? "true" : "false"}
              style={{
                minHeight: 96, borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)",
                padding: "0.25rem", background: cell.inMonth ? "var(--card)" : "var(--bg)",
                display: "flex", flexDirection: "column", gap: "0.15rem",
              }}
            >
              <button
                type="button"
                onClick={() => props.onOpenDay(cell.date)}
                aria-label={`Open ${cell.date.toDateString()}`}
                style={{
                  alignSelf: "flex-start", border: "none", cursor: "pointer", font: "inherit",
                  fontSize: "0.75rem", borderRadius: 999, padding: "0.05rem 0.4rem",
                  background: isToday ? "var(--accent)" : "transparent",
                  color: isToday ? "var(--accent-ink)" : cell.inMonth ? "var(--ink)" : "var(--muted)",
                  fontWeight: isToday ? 700 : 400,
                }}
              >
                {cell.date.getDate()}
              </button>
              {dayEvents.slice(0, MAX_CHIPS).map((e) => (
                <EventChip key={e.id} event={e} selected={e.id === props.selectedId} onSelect={props.onSelect} compact />
              ))}
              {dayEvents.length > MAX_CHIPS && (
                <button
                  type="button"
                  onClick={() => props.onOpenDay(cell.date)}
                  className="row-meta"
                  style={{ border: "none", background: "none", cursor: "pointer", font: "inherit", fontSize: "0.68rem", textAlign: "left", padding: 0 }}
                >
                  +{dayEvents.length - MAX_CHIPS} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
