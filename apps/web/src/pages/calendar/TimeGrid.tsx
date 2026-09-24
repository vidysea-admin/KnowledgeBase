/**
 * apps/web/src/pages/calendar/TimeGrid.tsx — the week and day views ([C2]/[C9]).
 *
 * A real hour axis: 24 labelled rows, every timed event positioned by its own start/end as a
 * percentage of the day and given a column within its overlap cluster, so two 11:00-ish meetings
 * sit SIDE BY SIDE instead of one hiding the other. All-day sessions get their own lane above the
 * axis rather than being pinned at midnight, which is what a date-with-no-time actually means.
 */
import type { CalendarEvent } from "./calendar-model.js";
import { eventsOnDay, isSameLocalDay, layoutDayColumn } from "./calendar-model.js";
import { EventChip } from "./EventChip.js";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const HOUR_HEIGHT = 44;

function hourLabel(h: number): string {
  return new Date(2020, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
}

export interface TimeGridProps {
  days: readonly Date[];
  events: readonly CalendarEvent[];
  today: Date;
  selectedId: string | null;
  onSelect(id: string): void;
}

export function TimeGrid(props: TimeGridProps): React.ReactElement {
  const allDayByDay = props.days.map((d) => eventsOnDay(props.events, d).filter((e) => e.allDay));
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="card" data-testid="time-grid" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${props.days.length}, 1fr)`, borderBottom: "1px solid var(--line)" }}>
        <div />
        {props.days.map((d) => (
          <div
            key={d.toISOString()}
            data-testid="time-grid-dayhead"
            data-today={isSameLocalDay(d, props.today) ? "true" : "false"}
            style={{ padding: "0.35rem", textAlign: "center", borderLeft: "1px solid var(--line)" }}
          >
            <div className="row-meta">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
            <div style={{
              fontWeight: isSameLocalDay(d, props.today) ? 700 : 500,
              color: isSameLocalDay(d, props.today) ? "var(--accent)" : "var(--ink)",
            }}>
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${props.days.length}, 1fr)`, borderBottom: "1px solid var(--line)" }}>
          <div className="row-meta" style={{ padding: "0.3rem", textAlign: "right" }}>all-day</div>
          {allDayByDay.map((list, i) => (
            <div key={props.days[i]!.toISOString()} data-testid="all-day-lane" style={{ padding: "0.2rem", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              {list.map((e) => (
                <EventChip key={e.id} event={e} selected={e.id === props.selectedId} onSelect={props.onSelect} compact />
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ maxHeight: 560, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${props.days.length}, 1fr)`, position: "relative" }}>
          <div>
            {HOURS.map((h) => (
              <div key={h} className="row-meta" style={{ height: HOUR_HEIGHT, textAlign: "right", paddingRight: "0.4rem", borderTop: "1px solid var(--line)" }}>
                {hourLabel(h)}
              </div>
            ))}
          </div>
          {props.days.map((day) => {
            const placed = layoutDayColumn(props.events, day);
            return (
              <div key={day.toISOString()} data-testid="day-column" style={{ position: "relative", borderLeft: "1px solid var(--line)" }}>
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_HEIGHT, borderTop: "1px solid var(--line)" }} />
                ))}
                {placed.map((p) => (
                  <div
                    key={p.event.id}
                    data-testid="positioned-event"
                    data-column={p.column}
                    data-columns={p.columns}
                    style={{
                      position: "absolute",
                      top: `${p.topPct}%`,
                      height: `${p.heightPct}%`,
                      left: `calc(${(p.column / p.columns) * 100}% + 2px)`,
                      width: `calc(${100 / p.columns}% - 4px)`,
                      minHeight: 16,
                    }}
                  >
                    <EventChip event={p.event} selected={p.event.id === props.selectedId} onSelect={props.onSelect} compact style={{ height: "100%" }} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
